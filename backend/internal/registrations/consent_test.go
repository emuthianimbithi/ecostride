package registrations

import (
	"net/http/httptest"
	"testing"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestConsentVersioning(t *testing.T) {
	db := testhelpers.OpenTestDB(t)

	event := models.Event{
		Slug:      uuid.New(),
		URLSlug:   "event-waiver",
		Type:      "MARATHON",
		Title:     "Event",
		Status:    "published",
		StartAt:   time.Now(),
		CreatedBy: 1,
	}
	if err := db.Create(&event).Error; err != nil {
		t.Fatalf("create event: %v", err)
	}

	globalWaiver := models.WaiverVersion{
		Slug:        uuid.New(),
		Scope:       "GLOBAL",
		Version:     1,
		Title:       "Global Waiver",
		Content:     "Global terms",
		ContentHash: "hash-global",
		EffectiveAt: time.Now(),
		IsCurrent:   true,
	}
	if err := db.Create(&globalWaiver).Error; err != nil {
		t.Fatalf("create global waiver: %v", err)
	}

	eventWaiver := models.WaiverVersion{
		Slug:        uuid.New(),
		Scope:       "EVENT",
		EventID:     &event.ID,
		Version:     2,
		Title:       "Event Waiver",
		Content:     "Event terms",
		ContentHash: "hash-event",
		EffectiveAt: time.Now(),
		IsCurrent:   true,
	}
	if err := db.Create(&eventWaiver).Error; err != nil {
		t.Fatalf("create event waiver: %v", err)
	}

	handler := NewHandler(NewService(db), audit.NewService(db), db, config.Config{}, nil, nil)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest("GET", "/public/events/"+event.URLSlug+"/waiver/current", nil)

	waiver, err := handler.currentWaiver(ctx, event.ID)
	if err != nil {
		t.Fatalf("current waiver: %v", err)
	}
	if waiver.ID != eventWaiver.ID {
		t.Fatalf("expected event-specific waiver")
	}

	if err := db.Model(&models.WaiverVersion{}).
		Where("id = ?", eventWaiver.ID).
		Update("is_current", false).Error; err != nil {
		t.Fatalf("update event waiver: %v", err)
	}

	waiver, err = handler.currentWaiver(ctx, event.ID)
	if err != nil {
		t.Fatalf("current waiver fallback: %v", err)
	}
	if waiver.ID != globalWaiver.ID {
		t.Fatalf("expected global waiver fallback")
	}
}
