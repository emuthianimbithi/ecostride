package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/receipts"
	"ecostride/backend/internal/registrations"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v76/webhook"
	"gorm.io/gorm"
)

func TestStripeWebhookSignatureVerification(t *testing.T) {
	db := testhelpers.OpenTestDB(t)

	cfg := config.Config{
		StripeWebhookSecret: "whsec_test",
		EmailProvider:       "console",
		MediaStorage:        "local",
		MediaDir:            t.TempDir(),
	}

	receiptService := receipts.NewService(db, cfg, nil)
	service := NewService(db, cfg, receiptService)
	handler := NewHandler(service, cfg, audit.NewService(db), db)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/webhooks/stripe", handler.StripeWebhook)

	t.Run("rejects invalid signature", func(t *testing.T) {
		payload := []byte(`{"id":"evt_1","type":"checkout.session.completed","data":{"object":{"id":"cs_test"}}}`)
		req := httptest.NewRequest("POST", "/webhooks/stripe", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", "t=123,v1=invalid")
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", recorder.Code)
		}
	})

	t.Run("accepts valid signature and issues receipt", func(t *testing.T) {
		registration, err := seedRegistration(db)
		if err != nil {
			t.Fatalf("seed registration: %v", err)
		}

		payment, err := service.CreatePayment(context.Background(), "STRIPE", PaymentContext{
			Registration: &registration,
			Email:        registration.Email,
			AmountMinor:  1500,
			Currency:     "KES",
			Description:  "Registration payment",
		}, "", nil)
		if err != nil {
			t.Fatalf("create payment: %v", err)
		}

		payload := map[string]interface{}{
			"id":   "evt_test",
			"type": "checkout.session.completed",
			"data": map[string]interface{}{
				"object": map[string]interface{}{
					"id": "cs_test_123",
					"metadata": map[string]string{
						"payment_slug": payment.Slug.String(),
					},
					"payment_intent": "pi_test",
					"customer_details": map[string]string{
						"email": registration.Email,
					},
				},
			},
		}
		payloadBytes, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}

		signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{
			Payload: payloadBytes,
			Secret:  cfg.StripeWebhookSecret,
		})

		req := httptest.NewRequest("POST", "/webhooks/stripe", bytes.NewReader(payloadBytes))
		req.Header.Set("Stripe-Signature", signed.Header)
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", recorder.Code)
		}

		var updated models.Payment
		if err := db.Where("id = ?", payment.ID).First(&updated).Error; err != nil {
			t.Fatalf("reload payment: %v", err)
		}
		if updated.Status != "success" {
			t.Fatalf("expected payment success, got %s", updated.Status)
		}
		if updated.ProviderRef != "cs_test_123" {
			t.Fatalf("expected provider_ref cs_test_123, got %s", updated.ProviderRef)
		}

		var updatedReg models.Registration
		if err := db.Where("id = ?", registration.ID).First(&updatedReg).Error; err != nil {
			t.Fatalf("reload registration: %v", err)
		}
		if updatedReg.Status != "confirmed" {
			t.Fatalf("expected registration confirmed, got %s", updatedReg.Status)
		}

		var receipt models.Receipt
		if err := db.Where("payment_id = ?", payment.ID).First(&receipt).Error; err != nil {
			t.Fatalf("receipt not found: %v", err)
		}
		if receipt.PDFMediaID == nil {
			t.Fatalf("expected receipt pdf media")
		}
	})
}

func TestMpesaWebhookTokenVerification(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	cfg := config.Config{
		MPesaWebhookToken: "secret-token",
	}

	handler := NewHandler(NewService(db, cfg, receipts.NewService(db, cfg, nil)), cfg, audit.NewService(db), db)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/webhooks/mpesa", handler.MpesaWebhook)

	req := httptest.NewRequest("POST", "/webhooks/mpesa", bytes.NewReader([]byte(`{}`)))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func seedRegistration(db *gorm.DB) (models.Registration, error) {
	event := models.Event{
		Slug:      uuid.New(),
		URLSlug:   "malindi",
		Type:      "MARATHON",
		Title:     "Malindi Marathon",
		Status:    "published",
		StartAt:   time.Now(),
		CreatedBy: 1,
	}
	if err := db.Create(&event).Error; err != nil {
		return models.Registration{}, err
	}

	category := models.EventCategory{
		Slug:          uuid.New(),
		EventID:       event.ID,
		Name:          "10K",
		PriceKESMinor: 1500,
	}
	if err := db.Create(&category).Error; err != nil {
		return models.Registration{}, err
	}

	waiver := models.WaiverVersion{
		Slug:        uuid.New(),
		Scope:       "GLOBAL",
		Version:     1,
		Title:       "Global Waiver",
		Content:     "Terms",
		ContentHash: "hash",
		EffectiveAt: time.Now(),
		IsCurrent:   true,
	}
	if err := db.Create(&waiver).Error; err != nil {
		return models.Registration{}, err
	}

	registration := models.Registration{
		Slug:        uuid.New(),
		EventID:     event.ID,
		CategoryID:  &category.ID,
		AthleteName: "Runner One",
		Email:       "runner@example.com",
		Phone:       "254700000003",
		Status:      "pending_payment",
	}
	consent := models.ConsentRecord{
		Slug:            uuid.New(),
		WaiverVersionID: waiver.ID,
		AcceptedAt:      time.Now(),
		IP:              "127.0.0.1",
		UserAgent:       "test",
	}

	service := registrations.NewService(db)
	created, err := service.CreateRegistration(context.Background(), registration, consent)
	if err != nil {
		return models.Registration{}, err
	}

	return created, nil
}
