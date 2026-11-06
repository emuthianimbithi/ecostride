package payments

import (
	"context"
	"errors"
	"sync"
	"testing"

	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/receipts"
	"github.com/google/uuid"
)

func TestConcurrentPaymentClaims(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	reg, err := seedRegistration(db)
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(db, config.Config{}, nil)
	data := PaymentContext{Registration: &reg, Currency: "KES", AmountMinor: 1500}
	var wg sync.WaitGroup
	results := make(chan models.Payment, 8)
	failures := make(chan error, 8)
	creations := make(chan bool, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p, created, err := service.ClaimPayment(context.Background(), "STRIPE", data, "same-key", nil)
			results <- p
			failures <- err
			creations <- created
		}()
	}
	wg.Wait()
	close(results)
	close(failures)
	close(creations)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	var id uint
	for p := range results {
		if id == 0 {
			id = p.ID
		}
		if p.ID != id {
			t.Fatal("retries returned different payments")
		}
	}
	createdCount := 0
	for created := range creations {
		if created {
			createdCount++
		}
	}
	if createdCount != 1 {
		t.Fatalf("created %d attempts", createdCount)
	}
	if _, _, err := service.ClaimPayment(context.Background(), "STRIPE", data, "different-key", nil); !errors.Is(err, ErrPaymentInProgress) {
		t.Fatalf("different key bypass: %v", err)
	}
	changed := data
	changed.AmountMinor++
	if _, _, err := service.ClaimPayment(context.Background(), "STRIPE", changed, "same-key", nil); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("fingerprint mismatch: %v", err)
	}
	if _, _, err := service.ClaimPayment(context.Background(), "MPESA", data, "same-key", nil); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("provider mismatch: %v", err)
	}
	if _, _, err := service.ClaimPayment(context.Background(), "STRIPE", data, "", nil); !errors.Is(err, ErrIdempotencyRequired) {
		t.Fatalf("missing key: %v", err)
	}
}

func TestNotificationRollbackRetryAndTerminalStates(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	reg, err := seedRegistration(db)
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{}
	service := NewService(db, cfg, receipts.NewService(db, cfg, nil))
	payment, err := service.CreatePayment(context.Background(), "STRIPE", PaymentContext{Registration: &reg, Currency: "KES", AmountMinor: 1500}, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("ALTER TABLE jobs ADD CONSTRAINT reject_pdf CHECK (type <> 'receipt.pdf')").Error; err != nil {
		t.Fatal(err)
	}
	process := func(eventID string, success bool) (models.Payment, error) {
		return service.ProcessNotification(context.Background(), payment, eventID, "test", []byte(`{}`), map[string]interface{}{"reference": "retained"}, success)
	}
	if _, err := process("event-retry", true); err == nil {
		t.Fatal("expected enqueue failure")
	}
	var count int64
	for _, table := range []string{"payment_events", "receipts", "jobs"} {
		if err := db.Table(table).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("%s did not roll back: %d %v", table, count, err)
		}
	}
	var persisted models.Payment
	db.First(&persisted, payment.ID)
	if persisted.Status != "pending" {
		t.Fatalf("payment not rolled back: %s", persisted.Status)
	}
	if err := db.Exec("ALTER TABLE jobs DROP CONSTRAINT reject_pdf").Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := process("event-retry", true); err != nil {
			t.Fatal(err)
		}
	}
	db.Model(&models.Receipt{}).Count(&count)
	if count != 1 {
		t.Fatalf("duplicate receipts: %d", count)
	}
	db.Model(&models.Job{}).Count(&count)
	if count != 2 {
		t.Fatalf("duplicate jobs: %d", count)
	}
	var event models.PaymentEvent
	db.Where("provider_event_id = ?", "event-retry").First(&event)
	if event.ProcessedAt == nil {
		t.Fatal("event completion missing")
	}
	if p, err := process("late-failure", false); err != nil || p.Status != "success" {
		t.Fatalf("late failure downgraded payment: %s %v", p.Status, err)
	}
	// A stale struct must not undo a refund already persisted by another operation.
	db.Model(&models.Payment{}).Where("id = ?", payment.ID).Update("status", "refunded")
	if p, err := process("late-success", true); err != nil || p.Status != "refunded" {
		t.Fatalf("refund resurrected: %s %v", p.Status, err)
	}
	// Genuine late money is recorded while cancelled entry stays ineligible.
	db.Model(&models.Payment{}).Where("id = ?", payment.ID).Update("status", "pending")
	db.Model(&reg).Update("status", "cancelled")
	if p, err := process("cancelled-success", true); err != nil || p.Status != "success" {
		t.Fatalf("late money not recorded: %s %v", p.Status, err)
	}
	db.First(&reg, reg.ID)
	if reg.Status != "cancelled" {
		t.Fatal("cancelled entry reconfirmed")
	}
}

func TestPaymentKeyCannotDiscloseAnotherTarget(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	reg, err := seedRegistration(db)
	if err != nil {
		t.Fatal(err)
	}
	other := reg
	other.ID = 0
	other.Slug = uuid.New()
	other.Email = "other@example.com"
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	s := NewService(db, config.Config{}, nil)
	data := PaymentContext{Registration: &reg, Currency: "KES", AmountMinor: 1500}
	if _, _, err := s.ClaimPayment(context.Background(), "STRIPE", data, "private-key", nil); err != nil {
		t.Fatal(err)
	}
	data.Registration = &other
	if p, _, err := s.ClaimPayment(context.Background(), "STRIPE", data, "private-key", nil); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("cross-target key accepted: %s %v", p.Slug, err)
	}
}
