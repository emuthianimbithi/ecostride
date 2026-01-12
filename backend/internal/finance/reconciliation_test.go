package finance

import (
	"context"
	"encoding/json"
	"testing"

	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

func TestReconciliationMatching(t *testing.T) {
	db := testhelpers.OpenTestDB(t)

	payment := models.Payment{
		Slug:        uuid.New(),
		Provider:    "MPESA",
		Currency:    "KES",
		AmountMinor: 2500,
		Status:      "success",
		ProviderRef: "ABC123",
	}
	if err := db.Create(&payment).Error; err != nil {
		t.Fatalf("create payment: %v", err)
	}

	meta, _ := json.Marshal(map[string]string{"mpesa_receipt": "MPESA999"})
	paymentWithMeta := models.Payment{
		Slug:        uuid.New(),
		Provider:    "MPESA",
		Currency:    "KES",
		AmountMinor: 5000,
		Status:      "success",
		ProviderRef: "OTHER",
		Metadata:    datatypes.JSON(meta),
	}
	if err := db.Create(&paymentWithMeta).Error; err != nil {
		t.Fatalf("create payment meta: %v", err)
	}

	found, err := findPaymentForReference(context.Background(), db, "ABC123")
	if err != nil {
		t.Fatalf("find by provider_ref: %v", err)
	}
	if found == nil || found.ID != payment.ID {
		t.Fatalf("expected payment match by provider_ref")
	}

	found, err = findPaymentForReference(context.Background(), db, "MPESA999")
	if err != nil {
		t.Fatalf("find by metadata receipt: %v", err)
	}
	if found == nil || found.ID != paymentWithMeta.ID {
		t.Fatalf("expected payment match by metadata")
	}

	found, err = findPaymentForReference(context.Background(), db, "NOPE")
	if err != nil {
		t.Fatalf("find no match: %v", err)
	}
	if found != nil {
		t.Fatalf("expected no match")
	}
}
