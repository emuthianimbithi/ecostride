package receipts

import (
	"context"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"github.com/google/uuid"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStyledRaceShopAndSupportEmails(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	service := NewService(db, config.Config{BaseURL: "https://estuarymarathon.com"}, nil)
	event := models.Event{Slug: uuid.New(), URLSlug: "estuary-marathon", Title: "Estuary Marathon", Location: "Malindi, Kenya", StartAt: time.Date(2027, 1, 15, 3, 0, 0, 0, time.UTC)}
	db.Create(&event)
	category := models.EventCategory{Slug: uuid.New(), EventID: event.ID, Name: "10K", PriceKESMinor: 150000}
	db.Create(&category)
	reg := models.Registration{Slug: uuid.New(), EventID: event.ID, CategoryID: &category.ID, Status: "confirmed", AthleteName: "Amina Runner", Email: "amina@example.com"}
	db.Create(&reg)
	payment := models.Payment{Slug: uuid.New(), RegistrationID: &reg.ID, Status: "success", Currency: "KES", AmountMinor: 150000, Provider: "PESAPAL"}
	db.Create(&payment)
	receipt := models.Receipt{Slug: uuid.New(), PaymentID: payment.ID, ReceiptNumber: "ES-PREVIEW", IssuedAt: time.Now(), EmailTo: reg.Email}
	db.Create(&receipt)
	race, err := service.buildEmail(context.Background(), receipt, payment)
	if err != nil {
		t.Fatal(err)
	}
	if len(race.Attachments) != 3 || !strings.Contains(race.Subject, "Estuary Marathon ticket") || !strings.Contains(race.HTML, "RACE ENTRY CONFIRMED") || !strings.Contains(race.HTML, "6:00 AM") || !strings.Contains(race.HTML, "Download your race ticket") {
		t.Fatal("missing styled race ticket, receipt or calendar")
	}
	for _, attachment := range race.Attachments {
		if attachment.ContentType == "application/pdf" && !strings.HasPrefix(string(attachment.Content), "%PDF-") {
			t.Fatal("invalid PDF attachment")
		}
		if attachment.ContentType == "text/calendar" && !strings.Contains(string(attachment.Content), "TRIGGER:-P1D") {
			t.Fatal("missing calendar reminder")
		}
	}
	db.Model(&reg).Update("status", "cancelled")
	invalid, err := service.buildEmail(context.Background(), receipt, payment)
	if err != nil {
		t.Fatal(err)
	}
	if len(invalid.Attachments) != 1 || strings.Contains(invalid.HTML, "RACE ENTRY CONFIRMED") {
		t.Fatal("cancelled entry sent active ticket")
	}
	order := models.Order{Slug: uuid.New(), Status: "paid", BuyerName: "Jane Buyer", Email: "jane@example.com", Currency: "KES", TotalMinor: 160000}
	db.Create(&order)
	item := models.OrderItem{Slug: uuid.New(), OrderID: order.ID, ProductName: "Coastal Cap", ProductType: "MERCH", Qty: 2, UnitPriceMinor: 80000, LineTotalMinor: 160000}
	db.Create(&item)
	payment.RegistrationID = nil
	payment.OrderID = &order.ID
	payment.AmountMinor = 160000
	shop, err := service.buildEmail(context.Background(), receipt, payment)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"ORDER CONFIRMED", "Coastal Cap", "Quantity 2", "KES 1600.00", "race-day merchandise collection point", order.Slug.String()} {
		if !strings.Contains(shop.HTML, want) {
			t.Fatalf("shop email missing %s", want)
		}
	}
	if len(shop.Attachments) != 1 {
		t.Fatal("shop buyer received race attachments")
	}
	db.Model(&item).Update("product_type", "DONATION_TIER")
	support, err := service.buildEmail(context.Background(), receipt, payment)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(support.HTML, "SUPPORT RECEIVED") || !strings.Contains(support.HTML, "do not include a race-day entry or bib") {
		t.Fatal("support email implies race entry")
	}
	if dir := os.Getenv("EMAIL_PREVIEW_DIR"); dir != "" {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
		for name, html := range map[string]string{"race": race.HTML, "shop": shop.HTML, "support": support.HTML} {
			if err := os.WriteFile(filepath.Join(dir, name+".html"), []byte(html), 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
}
