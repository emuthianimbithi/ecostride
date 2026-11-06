package registrations_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"ecostride/backend/internal/common/config"
	httpserver "ecostride/backend/internal/common/http"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/jobs"
	"ecostride/backend/internal/registrations"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestPublicRegistrationSecurity(t *testing.T) {
	httpserver.RegisterValidation()
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "secure-race", Title: "Race", Status: "published", StartAt: time.Now()}
	if err := db.Create(&event).Error; err != nil {
		t.Fatal(err)
	}
	waiver := models.WaiverVersion{Slug: uuid.New(), Scope: "GLOBAL", IsCurrent: true, EffectiveAt: time.Now()}
	if err := db.Create(&waiver).Error; err != nil {
		t.Fatal(err)
	}
	h := registrations.NewHandler(registrations.NewService(db), nil, db, config.Config{EmailProvider: "console"}, jobs.NewService(db), nil)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/registrations", h.CreatePublicRegistration)
	request := func(email string, accepted bool, waiverSlug string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]interface{}{"event_slug": event.URLSlug, "athlete_name": "Runner", "email": email, "phone": "254700000001", "waiver_accepted": accepted, "waiver_slug": waiverSlug})
		req := httptest.NewRequest(http.MethodPost, "/registrations", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	for _, tc := range []struct {
		name     string
		accepted bool
		slug     string
		status   int
	}{
		{"missing acceptance", false, waiver.Slug.String(), 400},
		{"stale waiver", true, uuid.NewString(), 409},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := request("runner@example.com", tc.accepted, tc.slug)
			if rec.Code != tc.status {
				t.Fatalf("status %d: %s", rec.Code, rec.Body)
			}
		})
	}
	var count int64
	db.Model(&models.ConsentRecord{}).Count(&count)
	if count != 0 {
		t.Fatal("invalid requests recorded consent")
	}
	rec := request("Runner@Example.com", true, waiver.Slug.String())
	if rec.Code != 201 {
		t.Fatalf("create %d: %s", rec.Code, rec.Body)
	}
	var response map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response) != 2 || response["slug"] == nil || response["status"] == nil {
		t.Fatalf("unexpected public response: %s", rec.Body)
	}
	var reg models.Registration
	if err := db.First(&reg).Error; err != nil {
		t.Fatal(err)
	}
	if reg.Email != "runner@example.com" {
		t.Fatalf("email not normalized: %s", reg.Email)
	}
	db.Model(&reg).Update("medical_declaration", "PRIVATE_MEDICAL")
	rec = request("runner@example.com", true, waiver.Slug.String())
	if rec.Code != 409 || strings.Contains(rec.Body.String(), "PRIVATE_MEDICAL") || strings.Contains(rec.Body.String(), reg.Slug.String()) {
		t.Fatalf("duplicate disclosure: %d %s", rec.Code, rec.Body)
	}
	var job models.Job
	if err := db.First(&job).Error; err != nil {
		t.Fatal(err)
	}
	var payload struct {
		RegistrationID uint `json:"registration_id"`
	}
	if err := json.Unmarshal(job.Payload, &payload); err != nil || payload.RegistrationID != reg.ID {
		t.Fatalf("confirmation job has wrong registration ID: %s", job.Payload)
	}
	var consent models.ConsentRecord
	if err := db.First(&consent).Error; err != nil {
		t.Fatal(err)
	}
	if consent.WaiverVersionID != waiver.ID || consent.RegistrationID != reg.ID {
		t.Fatal("wrong consent linkage")
	}
	category := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "10K", PriceKESMinor: 1000}
	if err := db.Create(&category).Error; err != nil {
		t.Fatal(err)
	}
	rec = request("other@example.com", true, waiver.Slug.String())
	if rec.Code != 400 {
		t.Fatalf("category bypass: %d %s", rec.Code, rec.Body)
	}
}

func TestConcurrentEmailUniqueness(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "concurrent-race", Title: "Race"}
	if err := db.Create(&event).Error; err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			email := "runner@example.com"
			if i%2 == 0 {
				email = " Runner@Example.COM "
			}
			results <- db.Create(&models.Registration{Slug: uuid.New(), EventID: event.ID, Email: email, Status: "pending_payment"}).Error
		}(i)
	}
	wg.Wait()
	close(results)
	created := 0
	for err := range results {
		if err == nil {
			created++
		}
	}
	if created != 1 {
		t.Fatalf("created %d simultaneous registrations for one email", created)
	}
	if err := db.Model(&models.Registration{}).Where("event_id = ?", event.ID).Update("status", "cancelled").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.Registration{Slug: uuid.New(), EventID: event.ID, Email: "runner@example.com", Status: "pending_payment"}).Error; err != nil {
		t.Fatalf("cancelled registration prevented re-entry: %v", err)
	}
}
