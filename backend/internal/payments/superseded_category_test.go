package payments

import (
	"context"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"encoding/json"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"testing"
)

func TestLateMoneyForReplacedCategoryRequiresReview(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	reg, err := seedRegistration(db)
	if err != nil {
		t.Fatal(err)
	}
	db.Model(&reg).Update("status", "pending_payment")
	payment := models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Status: "failed", AmountMinor: 1500, Currency: "KES", Metadata: datatypes.JSON([]byte(`{"category_superseded":true}`))}
	db.Create(&payment)
	service := NewService(db, config.Config{}, nil)
	result, err := service.MarkPaymentSuccess(context.Background(), payment)
	if err != nil {
		t.Fatal(err)
	}
	db.First(&reg, reg.ID)
	if reg.Status != "pending_payment" {
		t.Fatal("old category payment confirmed changed entry")
	}
	var metadata map[string]interface{}
	json.Unmarshal(result.Metadata, &metadata)
	if result.Status != "success" || metadata["requires_review"] != true {
		t.Fatal("late money not recorded for review")
	}
}
