package bibs

import (
	"bytes"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestManualBibsAndPrivateRaceLookup(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "race", Title: "Race", StartAt: time.Now()}
	db.Create(&event)
	other := models.Event{Slug: uuid.New(), URLSlug: "other-race", Title: "Other"}
	db.Create(&other)
	start, end := 100, 110
	cat := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "10K", PriceKESMinor: 1000, BibRangeStart: &start, BibRangeEnd: &end}
	db.Create(&cat)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &cat.ID, Email: "PRIVATE@example.com", Phone: "PRIVATE_PHONE", MedicalDeclaration: "PRIVATE_MEDICAL", AthleteName: "Runner", Status: "confirmed"}
	db.Create(&reg)
	h := NewHandler(NewService(db), nil, db)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/events/:id/assign", h.ManualAssign)
	router.POST("/events/:id/lock", h.LockBibs)
	router.GET("/events/:id/entries", h.ListRaceEntries)
	router.GET("/events", h.ListRaceEvents)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	assign := func(number int) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]interface{}{"registration_slug": reg.Slug.String(), "bib_number": number})
		return call("POST", "/events/"+event.Slug.String()+"/assign", string(body))
	}
	if rec := assign(100); rec.Code != 409 {
		t.Fatalf("unpaid bib: %d", rec.Code)
	}
	db.Create(&models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Status: "success", Provider: "PESAPAL", Currency: "KES", AmountMinor: 1000})
	for _, number := range []int{-1, 99, 111} {
		if rec := assign(number); rec.Code != 409 {
			t.Fatalf("out of range %d: %d", number, rec.Code)
		}
	}
	if rec := assign(100); rec.Code != 201 {
		t.Fatalf("assign: %d %s", rec.Code, rec.Body)
	}
	if rec := assign(100); rec.Code != 200 {
		t.Fatalf("repeat: %d", rec.Code)
	}
	if rec := assign(101); rec.Code != 409 {
		t.Fatalf("silent replacement: %d", rec.Code)
	}
	lockBody := `{"registration_slug":"` + reg.Slug.String() + `","lock_reason":"issued"}`
	if rec := call("POST", "/events/"+other.Slug.String()+"/lock", lockBody); rec.Code != 404 {
		t.Fatalf("cross-event lock: %d", rec.Code)
	}
	if rec := call("POST", "/events/"+event.Slug.String()+"/lock", lockBody); rec.Code != 200 {
		t.Fatalf("lock: %d", rec.Code)
	}
	if rec := assign(101); rec.Code != 409 {
		t.Fatalf("locked assignment replaced: %d", rec.Code)
	}
	var before models.BibAssignment
	db.Where("registration_id = ?", reg.ID).First(&before)
	if rec := call("POST", "/events/"+event.Slug.String()+"/lock", lockBody); rec.Code != 200 {
		t.Fatalf("repeat lock: %d", rec.Code)
	}
	var after models.BibAssignment
	db.Where("registration_id = ?", reg.ID).First(&after)
	if before.LockedAt == nil || after.LockedAt == nil || !before.LockedAt.Equal(*after.LockedAt) {
		t.Fatal("repeat lock rewrote timestamp")
	}
	rec := call("GET", "/events/"+event.Slug.String()+"/entries?search=Runner", "")
	if rec.Code != 200 {
		t.Fatalf("lookup: %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), "PRIVATE") || strings.Contains(rec.Body.String(), "amount_minor") || strings.Contains(rec.Body.String(), "email") {
		t.Fatalf("race lookup leaks details: %s", rec.Body)
	}
	var entries []raceEntry
	if err := json.Unmarshal(rec.Body.Bytes(), &entries); err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || !entries[0].Eligible || entries[0].BibNumber == nil || *entries[0].BibNumber != 100 {
		t.Fatalf("wrong race entry: %+v", entries)
	}
	if rec := call("GET", "/events/"+other.Slug.String()+"/entries", ""); rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("cross-event lookup: %d %s", rec.Code, rec.Body)
	}
	if rec := call("GET", "/events/"+event.Slug.String()+"/entries?search=%25", ""); rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("wildcard search: %d %s", rec.Code, rec.Body)
	}
	var audits int64
	db.Model(&models.AuditLog{}).Where("action_key = ?", "bib.assign.manual").Count(&audits)
	if audits != 1 {
		t.Fatalf("repeat audited new handover: %d", audits)
	}
}
