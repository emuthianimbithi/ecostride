package events_test

import (
	"context"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/events"
	"errors"
	"github.com/google/uuid"
	"testing"
)

func TestCannotDeleteCategoryUsedByRegistration(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "used-category"}
	db.Create(&event)
	category := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "10K"}
	db.Create(&category)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &category.ID, Email: "runner@example.com", Status: "pending_payment"}
	db.Create(&reg)
	service := events.NewService(db)
	if err := service.DeleteCategory(context.Background(), category); !errors.Is(err, events.ErrCategoryInUse) {
		t.Fatalf("linked category deleted: %v", err)
	}
	db.Delete(&reg)
	if err := service.DeleteCategory(context.Background(), category); !errors.Is(err, events.ErrCategoryInUse) {
		t.Fatalf("historical entry category deleted: %v", err)
	}
	db.Unscoped().Delete(&reg)
	if err := service.DeleteCategory(context.Background(), category); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&models.EventCategory{}).Where("id = ?", category.ID).Count(&count)
	if count != 0 {
		t.Fatal("unused category not removed")
	}
}
