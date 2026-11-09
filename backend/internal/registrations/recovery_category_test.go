package registrations

import (
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"strings"
	"testing"
	"time"
)

func TestFreshRecoveryWithDeletedCategory(t *testing.T) {
	for _, kind := range []string{"soft", "hard"} {
		t.Run(kind, func(t *testing.T) {
			db := testhelpers.OpenTestDB(t)
			event := models.Event{Slug: uuid.New(), URLSlug: "deleted-category", Title: "Estuary Marathon"}
			db.Create(&event)
			old := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "Old 5K", PriceKESMinor: 10000}
			db.Create(&old)
			current := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "Current 10K", PriceKESMinor: 20000}
			db.Create(&current)
			reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &old.ID, Email: "runner@example.com", AthleteName: "Saved Runner", Status: "pending_payment"}
			db.Create(&reg)
			payment := models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Status: "failed", Currency: "KES", AmountMinor: 10000}
			db.Create(&payment)
			if kind == "soft" {
				db.Delete(&old)
			} else {
				db.Unscoped().Delete(&old)
			}
			token := strings.Repeat("c", 64)
			record := models.RegistrationRecovery{RegistrationID: reg.ID, Email: reg.Email, TokenHash: recoveryHash(token), ExpiresAt: time.Now().Add(15 * time.Minute)}
			db.Create(&record)
			router := recoveryRouter(db)
			for i := 0; i < 2; i++ {
				rec := recoveryCall(router, "/verify", gin.H{"token": token})
				var result struct {
					Action     string             `json:"next_action"`
					Categories []recoveryCategory `json:"categories"`
				}
				json.Unmarshal(rec.Body.Bytes(), &result)
				if rec.Code != 200 || result.Action != "select_category" || len(result.Categories) != 1 || result.Categories[0].Slug != current.Slug {
					t.Fatalf("fresh link rejected: %d %s", rec.Code, rec.Body)
				}
			}
			db.First(&record, record.ID)
			if record.ConsumedAt != nil {
				t.Fatal("link consumed before category selection")
			}
			otherEvent := models.Event{Slug: uuid.New(), URLSlug: "other-event"}
			db.Create(&otherEvent)
			other := models.EventCategory{Slug: uuid.New(), EventID: otherEvent.ID, PriceKESMinor: 10000}
			db.Create(&other)
			if rec := recoveryCall(router, "/verify", gin.H{"token": token, "category_slug": other.Slug}); rec.Code != 409 {
				t.Fatalf("cross-event category accepted: %d", rec.Code)
			}
			rec := recoveryCall(router, "/verify", gin.H{"token": token, "category_slug": current.Slug})
			var result map[string]interface{}
			json.Unmarshal(rec.Body.Bytes(), &result)
			if rec.Code != 200 || result["next_action"] != "retry_payment" {
				t.Fatalf("cannot continue saved entry: %d %s", rec.Code, rec.Body)
			}
			var saved models.Registration
			db.First(&saved, reg.ID)
			if saved.ID != reg.ID || saved.CategoryID == nil || *saved.CategoryID != current.ID || saved.AthleteName != "Saved Runner" || saved.Status != "pending_payment" {
				t.Fatal("saved registration not safely updated")
			}
			db.First(&payment, payment.ID)
			var metadata map[string]interface{}
			json.Unmarshal(payment.Metadata, &metadata)
			if metadata["category_superseded"] != true {
				t.Fatal("old failed attempt can confirm new category later")
			}
			var count int64
			db.Model(&models.Payment{}).Count(&count)
			if count != 1 {
				t.Fatal("verification started a payment")
			}
			db.Model(&models.Registration{}).Count(&count)
			if count != 1 {
				t.Fatal("verification created another registration")
			}
			db.Model(&models.AuditLog{}).Where("action_key = ?", "registration.category.recover").Count(&count)
			if count != 1 {
				t.Fatal("category change not audited")
			}
			if rec := recoveryCall(router, "/verify", gin.H{"token": token}); rec.Code != 400 || !strings.Contains(rec.Body.String(), "RECOVERY_LINK_USED") {
				t.Fatal("finished link not single use")
			}
		})
	}
}

func TestDeletedCategoryRecoveryProtectsExistingPayments(t *testing.T) {
	for _, state := range []string{"pending", "success"} {
		t.Run(state, func(t *testing.T) {
			db := testhelpers.OpenTestDB(t)
			event := models.Event{Slug: uuid.New(), URLSlug: "paid-retired"}
			db.Create(&event)
			old := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "Paid category", PriceKESMinor: 10000}
			db.Create(&old)
			regStatus := "pending_payment"
			if state == "success" {
				regStatus = "confirmed"
			}
			reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &old.ID, Email: "runner@example.com", Status: regStatus}
			db.Create(&reg)
			payment := models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Status: state, AmountMinor: 10000, Currency: "KES"}
			db.Create(&payment)
			db.Delete(&old)
			db.Create(&models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "Replacement", PriceKESMinor: 20000})
			token := strings.Repeat("d", 64)
			db.Create(&models.RegistrationRecovery{RegistrationID: reg.ID, Email: reg.Email, TokenHash: recoveryHash(token), ExpiresAt: time.Now().Add(time.Minute)})
			rec := recoveryCall(recoveryRouter(db), "/verify", gin.H{"token": token})
			var result map[string]interface{}
			json.Unmarshal(rec.Body.Bytes(), &result)
			want := "view_payment"
			if state == "success" {
				want = "view_ticket"
			}
			if rec.Code != 200 || result["next_action"] != want {
				t.Fatalf("retired category payment lost: %d %s", rec.Code, rec.Body)
			}
			db.First(&reg, reg.ID)
			if reg.CategoryID == nil || *reg.CategoryID != old.ID {
				t.Fatal("entry with money silently recategorized")
			}
		})
	}
}
