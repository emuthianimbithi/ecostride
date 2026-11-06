package registrations

import (
	"context"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPendingDoesNotSendTicketAndCalendarRequiresEligibility(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "calendar-race", Title: "Estuary Marathon", StartAt: time.Now().AddDate(0, 1, 0)}
	db.Create(&event)
	category := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "10K", PriceKESMinor: 10000}
	db.Create(&category)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &category.ID, Email: "runner@example.com", Status: "pending_payment"}
	db.Create(&reg)
	cfg := config.Config{EmailProvider: "resend", BaseURL: "https://estuarymarathon.com"}
	// Missing credentials would fail if a pending legacy job tried to send.
	if err := SendConfirmationEmail(context.Background(), cfg, db, reg.ID); err != nil {
		t.Fatalf("pending job tried to send: %v", err)
	}
	h := NewHandler(NewService(db), nil, db, cfg, nil, nil)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/:id/calendar.ics", h.DownloadCalendar)
	router.GET("/:id/confirmation.pdf", h.GetPublicConfirmationPDF)
	call := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest("GET", "/"+reg.Slug.String()+path, nil))
		return rec
	}
	for _, path := range []string{"/calendar.ics", "/confirmation.pdf"} {
		if rec := call(path); rec.Code != 409 {
			t.Fatalf("pending download %s: %d", path, rec.Code)
		}
	}
	db.Model(&reg).Update("status", "confirmed")
	if rec := call("/calendar.ics"); rec.Code != 409 {
		t.Fatalf("unpaid manual confirmation got calendar: %d", rec.Code)
	}
	db.Create(&models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Status: "success", AmountMinor: 10000, Currency: "KES"})
	if rec := call("/calendar.ics"); rec.Code != 200 || !strings.Contains(rec.Body.String(), "BEGIN:VCALENDAR") {
		t.Fatalf("paid calendar: %d %s", rec.Code, rec.Body)
	}
	if rec := call("/confirmation.pdf"); rec.Code != 200 || !strings.HasPrefix(rec.Body.String(), "%PDF-") {
		t.Fatalf("paid ticket: %d", rec.Code)
	}
}
