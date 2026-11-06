package bibs

import (
	"bytes"
	"net/http/httptest"
	"testing"
	"time"

	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestCheckinRequiresEligibilityAndPreservesCollection(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	gin.SetMode(gin.TestMode)
	event := models.Event{Slug: uuid.New(), URLSlug: "checkin", Title: "Race", StartAt: time.Now()}
	db.Create(&event)
	category := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "10K", PriceKESMinor: 10000}
	db.Create(&category)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &category.ID, Status: "pending_payment", Email: "runner@example.com"}
	db.Create(&reg)
	h := NewHandler(NewService(db), nil, db)
	router := gin.New()
	router.POST("/checkin/:registrationId", h.CheckIn)
	call := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/checkin/"+reg.Slug.String(), bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	if rec := call(`{"checked_in":true}`); rec.Code != 409 {
		t.Fatalf("pending entry checked in: %d", rec.Code)
	}
	db.Model(&reg).Update("status", "confirmed")
	if rec := call(`{"checked_in":true}`); rec.Code != 409 {
		t.Fatalf("unpaid confirmed entry checked in: %d", rec.Code)
	}
	db.Create(&models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Status: "success", Currency: "KES", AmountMinor: 10000})
	if rec := call(`{"bib_collected":true}`); rec.Code != 409 {
		t.Fatalf("unassigned bib collected: %d", rec.Code)
	}
	db.Create(&models.BibAssignment{Slug: uuid.New(), EventID: event.ID, RegistrationID: reg.ID, BibNumber: 42, AssignedAt: time.Now()})
	for i := 0; i < 2; i++ {
		if rec := call(`{"checked_in":true,"bib_collected":true,"pack_collected":true}`); rec.Code != 200 {
			t.Fatalf("paid check-in: %d %s", rec.Code, rec.Body)
		}
	}
	var record models.Checkin
	db.First(&record)
	if record.CheckedInAt == nil || record.BibCollectedAt == nil || record.PackCollectedAt == nil {
		t.Fatal("incomplete handover record")
	}
	var audits int64
	db.Model(&models.AuditLog{}).Where("action_key = ?", "registration.checkin").Count(&audits)
	if audits != 1 {
		t.Fatalf("repeat rewrote check-in: %d audits", audits)
	}
	db.Model(&reg).Update("status", "refunded")
	if rec := call(`{"checked_in":true}`); rec.Code != 409 {
		t.Fatalf("refunded entry checked in: %d", rec.Code)
	}
}
