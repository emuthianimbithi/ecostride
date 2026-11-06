package maintenance

import (
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"fmt"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func runCleanup(t *testing.T, apply bool, cutoff time.Time) ([]byte, error) {
	t.Helper()
	binary, err := exec.LookPath("psql")
	if err != nil {
		t.Skip("psql required for maintenance integration test")
	}
	script, err := os.ReadFile("../../../scripts/cleanup-before-date.sql")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(binary, "-X", os.Getenv("TEST_DATABASE_URL"), "-v", "ON_ERROR_STOP=1", "-v", fmt.Sprintf("apply=%t", apply), "-v", "cutoff="+cutoff.Format(time.RFC3339))
	cmd.Stdin = strings.NewReader(string(script))
	return cmd.CombinedOutput()
}
func save(t *testing.T, db *gorm.DB, value interface{}) {
	t.Helper()
	if err := db.Create(value).Error; err != nil {
		t.Fatal(err)
	}
}
func TestDatedCleanupPreservesTodayAndPreviewIsReadOnly(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	loc, err := time.LoadLocation("Africa/Nairobi")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().In(loc)
	cutoff := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	old := gorm.Model{CreatedAt: cutoff.Add(-time.Hour)}
	today := gorm.Model{CreatedAt: cutoff}
	event := models.Event{Slug: uuid.New(), URLSlug: "cleanup", Title: "Race"}
	save(t, db, &event)
	oldReg := models.Registration{Model: old, Slug: uuid.New(), EventID: event.ID, Email: "old@example.com", Status: "confirmed"}
	save(t, db, &oldReg)
	keepReg := models.Registration{Model: today, Slug: uuid.New(), EventID: event.ID, Email: "today@example.com", Status: "pending_payment"}
	save(t, db, &keepReg)
	oldPayment := models.Payment{Model: old, Slug: uuid.New(), RegistrationID: &oldReg.ID, Provider: "PESAPAL", Status: "success", Currency: "KES", AmountMinor: 1000}
	save(t, db, &oldPayment)
	keepPayment := models.Payment{Model: today, Slug: uuid.New(), RegistrationID: &keepReg.ID, Provider: "PESAPAL", Status: "failed", Currency: "KES", AmountMinor: 1000}
	save(t, db, &keepPayment)
	receipt := models.Receipt{Slug: uuid.New(), PaymentID: oldPayment.ID, ReceiptNumber: "OLD"}
	save(t, db, &receipt)
	save(t, db, &models.PaymentEvent{Slug: uuid.New(), PaymentID: oldPayment.ID, ProviderEventID: "old-event", Payload: datatypes.JSON([]byte(`{}`))})
	save(t, db, &models.BibAssignment{Slug: uuid.New(), RegistrationID: oldReg.ID, EventID: event.ID, BibNumber: 10})
	save(t, db, &models.Checkin{Slug: uuid.New(), RegistrationID: oldReg.ID, EventID: event.ID})
	oldJob := models.Job{Slug: uuid.New(), Type: "receipt.email", Status: "pending", Payload: datatypes.JSON([]byte(fmt.Sprintf(`{"payment_id":%d,"receipt_id":%d}`, oldPayment.ID, receipt.ID)))}
	save(t, db, &oldJob)
	keepJob := models.Job{Slug: uuid.New(), Type: "receipt.email", Status: "pending", Payload: datatypes.JSON([]byte(fmt.Sprintf(`{"payment_id":%d}`, keepPayment.ID)))}
	save(t, db, &keepJob)
	result := models.Result{Slug: uuid.New(), RegistrationID: &oldReg.ID, EventID: event.ID, Name: "Historical runner", BibNumber: 10}
	save(t, db, &result)
	match := models.ReconciliationMatch{Slug: uuid.New(), PaymentID: &oldPayment.ID, Status: "matched", RowData: datatypes.JSON([]byte(`{}`))}
	save(t, db, &match)
	out, err := runCleanup(t, false, cutoff)
	if err != nil {
		t.Fatalf("preview: %v %s", err, out)
	}
	var count int64
	db.Model(&models.Payment{}).Count(&count)
	if count != 2 {
		t.Fatal("preview modified payments")
	}
	out, err = runCleanup(t, true, cutoff)
	if err != nil {
		t.Fatalf("apply: %v %s", err, out)
	}
	for _, item := range []struct {
		model interface{}
		want  int64
	}{{&models.Payment{}, 1}, {&models.Registration{}, 1}, {&models.Receipt{}, 0}, {&models.PaymentEvent{}, 0}, {&models.BibAssignment{}, 0}, {&models.Checkin{}, 0}, {&models.Job{}, 1}, {&models.AuditLog{}, 1}} {
		if err := db.Unscoped().Model(item.model).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count != item.want {
			t.Fatalf("%T count %d want %d", item.model, count, item.want)
		}
	}
	var kept models.Payment
	if err := db.First(&kept).Error; err != nil {
		t.Fatal(err)
	}
	if kept.ID != keepPayment.ID || kept.Status != "failed" {
		t.Fatal("today's payment changed")
	}
	result = models.Result{}
	db.First(&result)
	if result.RegistrationID != nil || result.Name != "Historical runner" {
		t.Fatal("historical result not safely detached")
	}
	match = models.ReconciliationMatch{}
	db.First(&match)
	if match.PaymentID != nil || match.Status != "unmatched" {
		t.Fatal("reconciliation not safely detached")
	}
	out, err = runCleanup(t, true, cutoff)
	if err != nil {
		t.Fatalf("repeat: %v %s", err, out)
	}
}

func TestDatedCleanupRollsBackIfOldRegistrationHasNewPayment(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	cutoff := time.Now().UTC().Truncate(24 * time.Hour)
	event := models.Event{Slug: uuid.New(), URLSlug: "linked-cleanup"}
	save(t, db, &event)
	reg := models.Registration{Model: gorm.Model{CreatedAt: cutoff.Add(-time.Hour)}, Slug: uuid.New(), EventID: event.ID, Email: "old@example.com", Status: "confirmed"}
	save(t, db, &reg)
	payment := models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Provider: "PESAPAL", Status: "success"}
	save(t, db, &payment)
	out, err := runCleanup(t, true, cutoff)
	if err == nil || !strings.Contains(string(out), "Cleanup blocked") {
		t.Fatalf("expected guarded rollback: %v %s", err, out)
	}
	var count int64
	db.Model(&models.Registration{}).Count(&count)
	if count != 1 {
		t.Fatal("registration removed despite newer payment")
	}
	db.Model(&models.Payment{}).Count(&count)
	if count != 1 {
		t.Fatal("new payment removed")
	}
}
