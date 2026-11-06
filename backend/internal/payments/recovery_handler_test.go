package payments_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/config"
	httpserver "ecostride/backend/internal/common/http"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/payments"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

func TestReceiptRecoveryPermissionDedupeAndAudit(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "receipt-race", Title: "Race"}
	if err := db.Create(&event).Error; err != nil {
		t.Fatal(err)
	}
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, Email: "runner@example.com", Status: "confirmed"}
	if err := db.Create(&reg).Error; err != nil {
		t.Fatal(err)
	}
	payment := models.Payment{RegistrationID: &reg.ID, Slug: uuid.New(), Provider: "STRIPE", Status: "success", Currency: "KES", AmountMinor: 1500, Metadata: datatypes.JSON([]byte(`{"secret":"DO_NOT_EXPOSE"}`))}
	if err := db.Create(&payment).Error; err != nil {
		t.Fatal(err)
	}
	receipt := models.Receipt{Slug: uuid.New(), PaymentID: payment.ID, ReceiptNumber: "R-1", EmailTo: "original@example.com", IssuedAt: time.Now()}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{}
	h := payments.NewHandler(payments.NewService(db, cfg, nil), cfg, nil, db)
	manager := auth.NewManager("test-access", "test-refresh")
	user := models.User{Slug: uuid.New(), Email: "finance@example.com", IsActive: true}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/payments/:id/verify", httpserver.RequireAuth(manager, auth.NewService(db, manager)), httpserver.RequirePermission("payment.verify"), h.VerifyPesaPalAdmin)
	router.GET("/payments", httpserver.RequireAuth(manager, auth.NewService(db, manager)), httpserver.RequirePermission("payment.read"), h.ListPayments)
	router.POST("/payments/:id/refund", httpserver.RequireAuth(manager, auth.NewService(db, manager)), httpserver.RequirePermission("payment.refund"), h.Refund)
	router.GET("/payments/:id", httpserver.RequireAuth(manager, auth.NewService(db, manager)), httpserver.RequirePermission("payment.read"), h.GetPaymentDetail)
	router.POST("/registrations/:id/resend-receipt", httpserver.RequireAuth(manager, auth.NewService(db, manager)), httpserver.RequirePermission("payment.receipt.resend"), h.ResendRegistrationReceipt)
	router.POST("/payments/:id/resend-receipt", httpserver.RequireAuth(manager, auth.NewService(db, manager)), httpserver.RequirePermission("payment.receipt.resend"), h.ResendPaymentReceipt)
	token := func(perms ...string) string {
		user := models.User{Slug: uuid.New(), Email: uuid.NewString() + "@example.com", IsActive: true}
		db.Create(&user)
		var grants []models.Permission
		for _, key := range perms {
			var grant models.Permission
			db.Where("key = ?", key).FirstOrCreate(&grant, models.Permission{Slug: uuid.New(), Key: key})
			grants = append(grants, grant)
		}
		role := models.Role{Slug: uuid.New(), Name: uuid.NewString(), Permissions: grants}
		db.Create(&role)
		db.Model(&user).Association("Roles").Replace(&role)
		tok, err := manager.SignAccessToken(user.ID, user.Slug, perms)
		if err != nil {
			t.Fatal(err)
		}
		return tok
	}
	call := func(method, path, body, bearer string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		if bearer != "" {
			req.Header.Set("Authorization", "Bearer "+bearer)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	path := "/payments/" + payment.Slug.String()
	if rec := call("GET", path, "", ""); rec.Code != 401 {
		t.Fatalf("anonymous read: %d", rec.Code)
	}
	reader := token("payment.read")
	if rec := call("POST", path+"/verify", `{"reason":"review"}`, reader); rec.Code != 403 {
		t.Fatalf("read-only provider verification: %d", rec.Code)
	}
	if rec := call("POST", path+"/verify", `{"reason":"review"}`, token("payment.verify")); rec.Code != 409 {
		t.Fatalf("unsupported verification: %d", rec.Code)
	}
	if rec := call("POST", path+"/resend-receipt", `{"reason":"support request"}`, reader); rec.Code != 403 {
		t.Fatalf("read-only resend: %d", rec.Code)
	}
	legacyPath := "/registrations/" + reg.Slug.String() + "/resend-receipt"
	if rec := call("POST", legacyPath, `{"reason":"support request"}`, reader); rec.Code != 403 {
		t.Fatalf("legacy read-only resend: %d", rec.Code)
	}
	writer := token("payment.receipt.resend")
	if rec := call("POST", legacyPath, `{}`, writer); rec.Code != 400 {
		t.Fatalf("legacy missing reason: %d", rec.Code)
	}
	if rec := call("POST", path+"/resend-receipt", `{}`, writer); rec.Code != 400 {
		t.Fatalf("missing reason: %d", rec.Code)
	}
	// Audit failure must undo the newly queued email.
	if err := db.Exec("ALTER TABLE audit_logs ADD CONSTRAINT reject_resend CHECK (action_key <> 'payment.receipt.resend')").Error; err != nil {
		t.Fatal(err)
	}
	if rec := call("POST", path+"/resend-receipt", `{"reason":"support request"}`, writer); rec.Code != 500 {
		t.Fatalf("audit failure: %d %s", rec.Code, rec.Body)
	}
	var count int64
	db.Model(&models.Job{}).Count(&count)
	if count != 0 {
		t.Fatal("job committed without audit")
	}
	db.Exec("ALTER TABLE audit_logs DROP CONSTRAINT reject_resend")
	for _, resendPath := range []string{path + "/resend-receipt", legacyPath} {
		if rec := call("POST", resendPath, `{"reason":"support request","email":"attacker@example.com"}`, writer); rec.Code != 202 {
			t.Fatalf("resend: %d %s", rec.Code, rec.Body)
		}
	}
	var queued []models.Job
	if err := db.Find(&queued).Error; err != nil || len(queued) != 1 {
		t.Fatalf("duplicate enqueue: %d %v", len(queued), err)
	}
	var payload struct {
		Email  string `json:"email"`
		Resend bool   `json:"resend"`
	}
	json.Unmarshal(queued[0].Payload, &payload)
	if payload.Email != receipt.EmailTo || !payload.Resend {
		t.Fatalf("unsafe destination: %+v", payload)
	}
	db.Model(&models.AuditLog{}).Count(&count)
	if count != 2 {
		t.Fatalf("missing audit records: %d", count)
	}
	rec := call("GET", path, "", reader)
	if rec.Code != 200 || strings.Contains(rec.Body.String(), "DO_NOT_EXPOSE") {
		t.Fatalf("detail response: %d %s", rec.Code, rec.Body)
	}
	if rec := call("POST", path+"/refund", `{"amount_minor":100,"reason":"partial request"}`, token("payment.refund")); rec.Code != 400 {
		t.Fatalf("partial refund accepted: %d %s", rec.Code, rec.Body)
	}
	// The safe detail endpoint flags uncertain old submissions without changing money state.
	db.WithContext(context.Background()).Model(&payment).Updates(map[string]interface{}{"status": "pending", "created_at": time.Now().Add(-time.Hour)})
	rec = call("GET", path, "", reader)
	var detail struct {
		RequiresReview      bool `json:"requires_review"`
		SubmissionUncertain bool `json:"submission_uncertain"`
	}
	json.Unmarshal(rec.Body.Bytes(), &detail)
	list := call("GET", "/payments?needs_review=true", "", reader)
	if list.Code != 200 || !strings.Contains(list.Body.String(), payment.Slug.String()) {
		t.Fatalf("review queue omitted uncertain payment: %d %s", list.Code, list.Body)
	}
	if !detail.RequiresReview || !detail.SubmissionUncertain {
		t.Fatalf("missing pending review flags: %s", rec.Body)
	}
	if rec := call("POST", path+"/resend-receipt", `{"reason":"support request"}`, writer); rec.Code != 409 {
		t.Fatalf("unpaid receipt resend: %d", rec.Code)
	}
}
