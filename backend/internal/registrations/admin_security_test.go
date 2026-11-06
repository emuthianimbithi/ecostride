package registrations_test

import (
	"bytes"
	"context"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/registrations"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http/httptest"
	"testing"
)

func TestAdminEditCannotOverridePaymentOrCancellation(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "admin-race", Title: "Race"}
	db.Create(&event)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, Email: "runner@example.com", Status: "pending_payment"}
	db.Create(&reg)
	service := registrations.NewService(db)
	handler := registrations.NewHandler(service, nil, db, config.Config{}, nil, nil)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/:id", handler.UpdateRegistration)
	for _, status := range []string{"confirmed", "paid", "refunded", "invented"} {
		req := httptest.NewRequest("PUT", "/"+reg.Slug.String(), bytes.NewBufferString(`{"status":"`+status+`"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != 409 {
			t.Fatalf("status %s accepted: %d", status, rec.Code)
		}
	}
	// Simulate an edit form loaded before a verified payment or cancellation.
	stale := reg
	db.Model(&reg).Update("status", "paid")
	stale.AthleteName = "Corrected name"
	updated, err := service.UpdateRegistration(context.Background(), stale)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != "paid" || updated.AthleteName != "Corrected name" {
		t.Fatalf("payment overwritten: %+v", updated)
	}
	db.Model(&reg).Update("status", "cancelled")
	updated, err = service.UpdateRegistration(context.Background(), stale)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != "cancelled" {
		t.Fatal("cancelled entry resurrected")
	}
}
