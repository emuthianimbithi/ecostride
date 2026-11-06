package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/receipts"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func TestPesaPalAmountsAndConfiguration(t *testing.T) {
	for _, tc := range []struct {
		raw     string
		minor   int
		matches bool
	}{{"15.00", 1500, true}, {"15.001", 1500, false}, {"15.01", 1500, false}, {"bad", 1500, false}} {
		if amountMatches(json.Number(tc.raw), tc.minor) != tc.matches {
			t.Fatalf("amount check: %+v", tc)
		}
	}
	if validPesaPalRedirect("https://pay.pesapal.com.evil.example/pay") || validPesaPalRedirect("http://pay.pesapal.com/pay") || validPesaPalRedirect("https://user@pay.pesapal.com/pay") {
		t.Fatal("unsafe provider redirect accepted")
	}
	cfg := config.Config{PesaPalEnabled: true, PesaPalEnvironment: "sandbox", PesaPalConsumerKey: "fixture-key", PesaPalConsumerSecret: "fixture-secret", PesaPalNotificationID: uuid.NewString(), BaseURL: "http://localhost:8080", PesaPalReturnURL: "http://localhost:3000/payment"}
	if err := ValidatePesaPalConfig(cfg); err != nil {
		t.Fatal(err)
	}
	cfg.PesaPalEnvironment = "live"
	if ValidatePesaPalConfig(cfg) == nil {
		t.Fatal("live HTTP callback accepted")
	}
	cfg.PesaPalEnabled = false
	if err := ValidatePesaPalConfig(cfg); err != nil {
		t.Fatal("disabled provider blocked startup")
	}
}

// This test runs the real payment handlers and HTTP client against the local
// Postman simulation. It never calls a merchant account or sends real email.
func TestPesaPalSimulation(t *testing.T) {
	base := os.Getenv("PESAPAL_SIMULATION_URL")
	if base == "" {
		t.Skip("PESAPAL_SIMULATION_URL not set")
	}
	u, err := url.Parse(base)
	if err != nil || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") {
		t.Fatal("simulation URL must be localhost")
	}
	client := &http.Client{Timeout: 5 * time.Second}
	control := func(path string, body interface{}) map[string]interface{} {
		t.Helper()
		b, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", base+path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != 200 {
			t.Fatalf("fixture control: %d %+v", resp.StatusCode, result)
		}
		return result
	}
	for _, mode := range []string{"completed", "lost-submit"} {
		t.Run(mode, func(t *testing.T) {
			control("/__test/reset", map[string]string{"mode": mode})
			db := testhelpers.OpenTestDB(t)
			reg, err := seedRegistration(db)
			if err != nil {
				t.Fatal(err)
			}
			cfg := config.Config{PesaPalEnabled: true, PesaPalEnvironment: "sandbox", PesaPalConsumerKey: "fixture-key", PesaPalConsumerSecret: "fixture-secret", PesaPalNotificationID: uuid.NewString(), BaseURL: "http://localhost:8080", PesaPalReturnURL: "http://localhost:3000/payment"}
			s := NewService(db, cfg, receipts.NewService(db, cfg, nil))
			s.PesaPal.BaseURL = base
			h := NewHandler(s, cfg, nil, db)
			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.POST("/checkout", h.PesaPalCheckout)
			router.POST("/ipn", h.PesaPalNotification)
			router.GET("/callback", h.PesaPalNotification)
			router.POST("/adminverify", h.VerifyPesaPalAdmin)
			call := func(path string, body interface{}) *httptest.ResponseRecorder {
				b, _ := json.Marshal(body)
				req := httptest.NewRequest("POST", path, bytes.NewReader(b))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Idempotency-Key", "checkout-key")
				rec := httptest.NewRecorder()
				router.ServeHTTP(rec, req)
				return rec
			}
			checkout := map[string]interface{}{"registration_slug": reg.Slug.String(), "currency": "KES"}
			expected := 200
			if mode == "lost-submit" {
				expected = 202
			}
			for i := 0; i < 2; i++ {
				rec := call("/checkout", checkout)
				if rec.Code != expected {
					t.Fatalf("checkout: %d %s", rec.Code, rec.Body)
				}
			}
			state := control("/__test/state", nil)
			if state["submissions"] != float64(1) {
				t.Fatalf("duplicate order submission: %+v", state)
			}
			tracking := state["lastTrackingID"].(string)
			var payment models.Payment
			if err := db.First(&payment).Error; err != nil {
				t.Fatal(err)
			}
			submitted := state["orders"].(map[string]interface{})[tracking].(map[string]interface{})
			if submitted["redirect_mode"] != "TOP_WINDOW" || submitted["cancellation_url"] != cfg.PesaPalReturnURL+"/"+payment.Slug.String() {
				t.Fatal("hosted return/cancellation destination missing")
			}
			notify := func(id string) *httptest.ResponseRecorder {
				return call("/ipn", map[string]interface{}{"OrderNotificationType": "IPNCHANGE", "OrderMerchantReference": payment.Slug.String(), "OrderTrackingId": id, "payment_status": "success"})
			}
			if rec := notify(uuid.NewString()); rec.Code != 500 {
				t.Fatalf("forged tracking: %d %s", rec.Code, rec.Body)
			}
			for _, failure := range []string{"mismatch", "status-error"} {
				control("/__test/mode", map[string]string{"mode": failure})
				if rec := notify(tracking); rec.Code != 500 {
					t.Fatalf("unsafe status %s: %d %s", failure, rec.Code, rec.Body)
				}
				var row models.Payment
				db.First(&row, payment.ID)
				if row.Status != "pending" {
					t.Fatal("unverified payment confirmed")
				}
			}
			control("/__test/mode", map[string]string{"mode": "pending"})
			if rec := notify(tracking); rec.Code != 200 {
				t.Fatalf("pending IPN: %d %s", rec.Code, rec.Body)
			}
			var pending models.Payment
			db.First(&pending, payment.ID)
			if pending.Status != "pending" {
				t.Fatal("INVALID was treated as payment failure")
			}
			// A verified callback can restore a tracking ID lost during order submission.
			if pending.ProviderRef != tracking {
				t.Fatal("lost tracking ID not recovered")
			}
			control("/__test/mode", map[string]string{"mode": "completed"})
			db.Model(&models.Payment{}).Where("id = ?", payment.ID).Update("next_check_at", time.Now().Add(-time.Minute))
			if err := s.RecoverPesaPal(context.Background()); err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 2; i++ {
				if rec := notify(tracking); rec.Code != 200 {
					t.Fatalf("completed IPN: %d %s", rec.Code, rec.Body)
				}
			}
			for _, notificationType := range []string{"CALLBACKURL", ""} {
				callback := httptest.NewRecorder()
				router.ServeHTTP(callback, httptest.NewRequest("GET", "/callback?OrderNotificationType="+notificationType+"&OrderMerchantReference="+payment.Slug.String()+"&OrderTrackingId="+tracking+"&return_url=https://evil.example", nil))
				if callback.Code != 303 || callback.Header().Get("Location") != cfg.PesaPalReturnURL+"/"+payment.Slug.String() {
					t.Fatalf("unsafe callback redirect: %d %s", callback.Code, callback.Header().Get("Location"))
				}
			}
			if rec := call("/ipn", map[string]string{"OrderMerchantReference": payment.Slug.String(), "OrderTrackingId": tracking}); rec.Code != 400 {
				t.Fatalf("IPN without notification type accepted: %d", rec.Code)
			}
			verifyRec := httptest.NewRecorder()
			verifyCtx, _ := gin.CreateTestContext(verifyRec)
			verifyCtx.Params = gin.Params{{Key: "id", Value: payment.Slug.String()}}
			verifyCtx.Request = httptest.NewRequest("POST", "/adminverify", bytes.NewBufferString(`{"reason":"finance reconciliation"}`))
			verifyCtx.Request.Header.Set("Content-Type", "application/json")
			h.VerifyPesaPalAdmin(verifyCtx)
			if verifyRec.Code != 200 {
				t.Fatalf("admin verify: %d %s", verifyRec.Code, verifyRec.Body)
			}
			var audits int64
			db.Model(&models.AuditLog{}).Where("action_key = ?", "payment.verify").Count(&audits)
			if audits != 1 {
				t.Fatal("provider check not audited")
			}
			var settled models.Payment
			db.First(&settled, payment.ID)
			if settled.Status != "success" || settled.LastCheckedAt == nil {
				t.Fatalf("payment not settled: %+v", settled)
			}
			var registered models.Registration
			db.First(&registered, reg.ID)
			if registered.Status != "confirmed" {
				t.Fatal("verified entry not confirmed")
			}
			var count int64
			db.Model(&models.Receipt{}).Count(&count)
			if count != 1 {
				t.Fatalf("receipt count: %d", count)
			}
			db.Model(&models.Job{}).Count(&count)
			if count != 2 {
				t.Fatalf("receipt delivery count: %d", count)
			}
			control("/__test/mode", map[string]string{"mode": "reversed"})
			if rec := notify(tracking); rec.Code != 200 {
				t.Fatalf("reversal: %d %s", rec.Code, rec.Body)
			}
			var reversed models.Payment
			db.First(&reversed, payment.ID)
			if reversed.Status != "refunded" {
				t.Fatal("reversal not applied")
			}
			control("/__test/mode", map[string]string{"mode": "completed"})
			notify(tracking)
			var final models.Payment
			db.First(&final, payment.ID)
			if final.Status != "refunded" {
				t.Fatal("late success undid reversal")
			}
			state = control("/__test/state", nil)
			if state["tokens"] != float64(1) {
				t.Fatalf("token cache not reused: %+v", state)
			}
			control("/__test/mode", map[string]string{"mode": "token-expired"})
			if _, err := s.VerifyPesaPal(context.Background(), final, tracking, nil); err != nil {
				t.Fatalf("token refresh: %v", err)
			}
			state = control("/__test/state", nil)
			if state["tokens"] != float64(2) {
				t.Fatalf("expired token not refreshed: %+v", state)
			}
		})
	}
}

// Opt-in read-only merchant authentication check. Credentials come from an
// ignored local file and neither credentials nor the issued token are logged.
func TestPesaPalSandboxAuthentication(t *testing.T) {
	path := os.Getenv("PESAPAL_SANDBOX_ENV_FILE")
	if path == "" {
		t.Skip("PESAPAL_SANDBOX_ENV_FILE not set")
	}
	values, err := godotenv.Read(path)
	if err != nil {
		t.Fatal("unable to read local sandbox configuration")
	}
	if values["PESAPAL_ENVIRONMENT"] != "sandbox" {
		t.Fatal("sandbox configuration required")
	}
	cfg := config.Config{PesaPalEnvironment: "sandbox", PesaPalConsumerKey: values["PESAPAL_CONSUMER_KEY"], PesaPalConsumerSecret: values["PESAPAL_CONSUMER_SECRET"]}
	client := NewPesaPalClient(cfg)
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	token, err := client.accessToken(ctx)
	if err != nil {
		t.Fatalf("sandbox authentication check: %v", err)
	}
	if token == "" {
		t.Fatal("sandbox did not issue a token")
	}
	t.Log("Sandbox authentication verified with the application HTTP client; token not persisted")
}
