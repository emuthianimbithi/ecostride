package registrations

import (
	"bytes"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func recoveryRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewHandler(NewService(db), nil, db, config.Config{EmailProvider: "resend", JWTSecret: "test-recovery-secret"}, nil, nil)
	router := gin.New()
	router.POST("/request", h.RequestRecovery)
	router.POST("/verify", h.VerifyRecovery)
	return router
}
func recoveryCall(router *gin.Engine, path string, body interface{}) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	request := httptest.NewRequest("POST", path, bytes.NewReader(raw))
	request.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, request)
	return rec
}
func TestRecoveryEmailPrivacyCooldownSingleUseAndNoCharge(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "recover-race", Title: "Estuary Marathon"}
	db.Create(&event)
	cat := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "10K", PriceKESMinor: 10000}
	db.Create(&cat)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &cat.ID, Email: "runner@example.com", AthleteName: "Runner", Status: "pending_payment", MedicalDeclaration: "PRIVATE_MEDICAL"}
	db.Create(&reg)
	db.Create(&models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Provider: "PESAPAL", Status: "failed", AmountMinor: 10000, Currency: "KES"})
	router := recoveryRouter(db)
	known := recoveryCall(router, "/request", gin.H{"event_slug": event.URLSlug, "email": "RUNNER@example.com"})
	unknown := recoveryCall(router, "/request", gin.H{"event_slug": event.URLSlug, "email": "unknown@example.com"})
	if known.Code != 202 || unknown.Code != 202 || known.Body.String() != unknown.Body.String() || strings.Contains(known.Body.String(), reg.Slug.String()) {
		t.Fatal("request reveals account existence or entry")
	}
	recoveryCall(router, "/request", gin.H{"event_slug": event.URLSlug, "email": reg.Email})
	var count int64
	db.Model(&models.RegistrationRecovery{}).Count(&count)
	if count != 1 {
		t.Fatalf("cooldown created %d links", count)
	}
	var job models.Job
	if err := db.Where("type = ?", "registration.recovery").First(&job).Error; err != nil {
		t.Fatal(err)
	}
	var payload RecoveryEmailPayload
	if err := json.Unmarshal(job.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	var record models.RegistrationRecovery
	db.First(&record)
	token, err := openRecoveryToken("test-recovery-secret", payload.EncryptedToken)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(job.Payload), token) {
		t.Fatal("raw token stored in email queue")
	}
	if record.TokenHash == token || recoveryHash(token) != record.TokenHash {
		t.Fatal("token hash not stored correctly")
	}
	bad := recoveryCall(router, "/verify", gin.H{"token": strings.Repeat("f", 64)})
	if bad.Code != 400 {
		t.Fatalf("forged token: %d", bad.Code)
	}
	expired := time.Now().Add(-time.Second)
	db.Model(&record).Update("expires_at", expired)
	if rec := recoveryCall(router, "/verify", gin.H{"token": token}); rec.Code != 400 {
		t.Fatal("expired token accepted")
	}
	db.Model(&record).Update("expires_at", time.Now().Add(time.Minute))
	rec := recoveryCall(router, "/verify", gin.H{"token": token})
	var result struct {
		RegistrationSlug string `json:"registration_slug"`
		Action           string `json:"next_action"`
	}
	json.Unmarshal(rec.Body.Bytes(), &result)
	if rec.Code != 200 || result.Action != "retry_payment" || result.RegistrationSlug != reg.Slug.String() || strings.Contains(rec.Body.String(), "PRIVATE_MEDICAL") || strings.Contains(rec.Body.String(), reg.Email) {
		t.Fatalf("wrong verified result: %d", rec.Code)
	}
	if rec := recoveryCall(router, "/verify", gin.H{"token": token}); rec.Code != 400 {
		t.Fatal("used token accepted")
	}
	db.Model(&models.Payment{}).Count(&count)
	if count != 1 {
		t.Fatal("verification started payment")
	}
	db.Model(&models.Registration{}).Count(&count)
	if count != 1 {
		t.Fatal("verification created duplicate registration")
	}
}

func TestRecoveryChoosesPendingPaidAndReviewSafely(t *testing.T) {
	for i, tc := range []struct{ name, regStatus, paymentStatus, action string }{{"pending", "pending_payment", "pending", "view_payment"}, {"paid", "confirmed", "success", "view_ticket"}, {"cancelled", "cancelled", "success", "contact_support"}, {"refunded", "pending_payment", "refunded", "view_payment"}} {
		t.Run(tc.name, func(t *testing.T) {
			db := testhelpers.OpenTestDB(t)
			event := models.Event{Slug: uuid.New(), URLSlug: "recover"}
			db.Create(&event)
			cat := models.EventCategory{Slug: uuid.New(), EventID: event.ID, PriceKESMinor: 10000}
			db.Create(&cat)
			reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &cat.ID, Email: "runner@example.com", Status: tc.regStatus}
			db.Create(&reg)
			payment := models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Provider: "PESAPAL", Status: tc.paymentStatus, AmountMinor: 10000, Currency: "KES"}
			db.Create(&payment)
			db.Create(&models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Status: "failed", Model: gorm.Model{CreatedAt: time.Now()}})
			token := fmt.Sprintf("%064x", i+1)
			record := models.RegistrationRecovery{RegistrationID: reg.ID, Email: reg.Email, TokenHash: recoveryHash(token), ExpiresAt: time.Now().Add(time.Minute)}
			db.Create(&record)
			router := recoveryRouter(db)
			rec := recoveryCall(router, "/verify", gin.H{"token": token})
			var result map[string]interface{}
			json.Unmarshal(rec.Body.Bytes(), &result)
			if rec.Code != 200 || result["next_action"] != tc.action {
				t.Fatalf("wrong action: %d %s", rec.Code, rec.Body)
			}
			if tc.action == "view_payment" && result["payment_id"] != payment.Slug.String() {
				t.Fatal("selected failed attempt instead of active/settled payment")
			}
		})
	}
}

func TestRecoveryTokenCanOnlyBeConsumedOnceConcurrently(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "recover-concurrent"}
	db.Create(&event)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, Email: "runner@example.com", Status: "pending_payment"}
	db.Create(&reg)
	token := strings.Repeat("a", 64)
	db.Create(&models.RegistrationRecovery{RegistrationID: reg.ID, Email: reg.Email, TokenHash: recoveryHash(token), ExpiresAt: time.Now().Add(time.Minute)})
	router := recoveryRouter(db)
	results := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- recoveryCall(router, "/verify", gin.H{"token": token}).Code }()
	}
	wg.Wait()
	close(results)
	accepted := 0
	for code := range results {
		if code == 200 {
			accepted++
		} else if code != 400 {
			t.Fatalf("unexpected verification status %d", code)
		}
	}
	if accepted != 1 {
		t.Fatalf("accepted token %d times", accepted)
	}
}
