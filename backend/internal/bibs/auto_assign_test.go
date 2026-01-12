package bibs

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestAutoAssignBibs(t *testing.T) {
	db := testhelpers.OpenTestDB(t)

	event := models.Event{
		Slug:      uuid.New(),
		URLSlug:   "test-event",
		Type:      "MARATHON",
		Title:     "Test Event",
		Status:    "published",
		StartAt:   time.Now(),
		CreatedBy: 1,
	}
	if err := db.Create(&event).Error; err != nil {
		t.Fatalf("create event: %v", err)
	}

	start := 100
	end := 101
	category := models.EventCategory{
		Slug:          uuid.New(),
		EventID:       event.ID,
		Name:          "10K",
		PriceKESMinor: 1000,
		BibRangeStart: &start,
		BibRangeEnd:   &end,
	}
	if err := db.Create(&category).Error; err != nil {
		t.Fatalf("create category: %v", err)
	}

	registrations := []models.Registration{
		{
			Slug:        uuid.New(),
			EventID:     event.ID,
			CategoryID:  &category.ID,
			AthleteName: "Runner One",
			Email:       "runner1@example.com",
			Phone:       "254700000001",
			Status:      "confirmed",
		},
		{
			Slug:        uuid.New(),
			EventID:     event.ID,
			CategoryID:  &category.ID,
			AthleteName: "Runner Two",
			Email:       "runner2@example.com",
			Phone:       "254700000002",
			Status:      "confirmed",
		},
	}
	if err := db.Create(&registrations).Error; err != nil {
		t.Fatalf("create registrations: %v", err)
	}

	handler := NewHandler(NewService(db), audit.NewService(db), db)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest("POST", "/admin/events/"+event.Slug.String()+"/bibs/auto-assign", nil)
	ctx.Request = req
	ctx.Params = gin.Params{{Key: "id", Value: event.Slug.String()}}

	handler.AutoAssign(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", recorder.Code)
	}

	var assignments []models.BibAssignment
	if err := db.Find(&assignments).Error; err != nil {
		t.Fatalf("list assignments: %v", err)
	}
	if len(assignments) != 2 {
		t.Fatalf("expected 2 assignments, got %d", len(assignments))
	}

	assignedNumbers := map[int]bool{}
	for _, assignment := range assignments {
		assignedNumbers[assignment.BibNumber] = true
	}
	if !assignedNumbers[100] || !assignedNumbers[101] {
		t.Fatalf("unexpected bib numbers: %+v", assignedNumbers)
	}

	var updated models.EventCategory
	if err := db.First(&updated, category.ID).Error; err != nil {
		t.Fatalf("reload category: %v", err)
	}
	if updated.BibNext == nil || *updated.BibNext != 102 {
		t.Fatalf("expected bib_next 102, got %v", updated.BibNext)
	}
}
