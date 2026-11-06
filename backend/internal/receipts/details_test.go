package receipts

import (
	"context"
	"strings"
	"testing"
	"time"

	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

func TestRaceAndOrderReferencesOnReceipts(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	event := models.Event{Slug: uuid.New(), URLSlug: "receipt-race", Title: "Coastal Race", Location: "Malindi", StartAt: time.Date(2027, 1, 15, 6, 0, 0, 0, time.UTC)}
	if err := db.Create(&event).Error; err != nil {
		t.Fatal(err)
	}
	category := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "10K"}
	db.Create(&category)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &category.ID, AthleteName: "Test Runner", Email: "runner@example.com"}
	db.Create(&reg)
	service := NewService(db, config.Config{}, nil)
	payment := models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Provider: "PESAPAL", ProviderRef: "tracking-test", Currency: "KES", AmountMinor: 10000, Metadata: datatypes.JSON([]byte(`{"confirmation_code":"CONFIRMED-TEST"}`))}
	receipt := models.Receipt{ReceiptNumber: "ES-TEST", EmailTo: reg.Email}
	race := service.buildReceiptDetails(context.Background(), receipt, payment)
	for _, lines := range [][]string{race.emailLines, race.pdfLines} {
		text := strings.Join(lines, "\n")
		for _, want := range []string{reg.Slug.String(), "Coastal Race", "10K", "2027-01-15", "Malindi", "Test Runner", "KES 100.00", "CONFIRMED-TEST", "tracking-test"} {
			if !strings.Contains(text, want) {
				t.Fatalf("receipt missing %q", want)
			}
		}
	}
	product := models.Product{Slug: uuid.New(), URLSlug: "receipt-cap", Name: "Renamed catalogue cap", Type: "MERCH"}
	db.Create(&product)
	order := models.Order{Slug: uuid.New(), BuyerName: "Test Buyer", Email: "buyer@example.com", Currency: "KES", TotalMinor: 10000}
	db.Create(&order)
	db.Create(&models.OrderItem{Slug: uuid.New(), OrderID: order.ID, ProductID: product.ID, ProductName: "Purchased Cap", ProductType: "MERCH", Qty: 2, LineTotalMinor: 10000})
	payment.RegistrationID = nil
	payment.OrderID = &order.ID
	shop := service.buildReceiptDetails(context.Background(), receipt, payment)
	for _, lines := range [][]string{shop.emailLines, shop.pdfLines} {
		text := strings.Join(lines, "\n")
		for _, want := range []string{order.Slug.String(), "Purchased Cap x2", "Test Buyer", "CONFIRMED-TEST"} {
			if !strings.Contains(text, want) {
				t.Fatalf("order receipt missing %q", want)
			}
		}
		if strings.Contains(text, "Renamed catalogue cap") {
			t.Fatal("receipt lost historical item name")
		}
	}
}
