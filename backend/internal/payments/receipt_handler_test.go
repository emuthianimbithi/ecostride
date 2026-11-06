package payments

import (
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/receipts"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestReceiptDownloadRequiresVerifiedPaymentAndPersonalizedStatus(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	cfg := config.Config{BaseURL: "https://example.com"}
	order := models.Order{Slug: uuid.New(), BuyerName: "Jane Buyer", Email: "PRIVATE@example.com", Currency: "KES", Status: "pending", TotalMinor: 10000}
	db.Create(&order)
	db.Create(&models.OrderItem{Slug: uuid.New(), OrderID: order.ID, ProductName: "Coastal Cap", Qty: 2, UnitPriceMinor: 5000, LineTotalMinor: 10000})
	payment := models.Payment{Slug: uuid.New(), OrderID: &order.ID, Provider: "PESAPAL", Currency: "KES", Status: "pending", AmountMinor: 10000, Metadata: datatypes.JSON([]byte(`{"checkout_url":"https://pay.pesapal.com/iframe/pay","secret":"PRIVATE"}`))}
	db.Create(&payment)
	receipt := models.Receipt{Slug: uuid.New(), PaymentID: payment.ID, ReceiptNumber: "ES-TEST", EmailTo: order.Email, IssuedAt: time.Now()}
	db.Create(&receipt)
	h := NewHandler(NewService(db, cfg, receipts.NewService(db, cfg, nil)), cfg, nil, db)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/:id/status", h.PaymentStatus)
	router.GET("/:id/receipt.pdf", h.DownloadReceipt)
	call := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		return rec
	}
	for _, status := range []string{"pending", "failed"} {
		db.Model(&payment).Update("status", status)
		if rec := call("/" + payment.Slug.String() + "/receipt.pdf"); rec.Code != 409 {
			t.Fatalf("%s download: %d", status, rec.Code)
		}
	}
	db.Model(&payment).Update("status", "pending")
	rec := call("/" + payment.Slug.String() + "/status")
	var detail map[string]interface{}
	json.Unmarshal(rec.Body.Bytes(), &detail)
	if detail["payer_name"] != "Jane Buyer" || detail["description"] != "Coastal Cap × 2" || detail["checkout_url"] == "" || detail["receipt_url"] != "" || strings.Contains(rec.Body.String(), "PRIVATE") {
		t.Fatalf("unsafe summary: %s", rec.Body)
	}
	db.Model(&payment).Update("status", "success")
	rec = call("/" + payment.Slug.String() + "/receipt.pdf")
	if rec.Code != 200 || !strings.HasPrefix(rec.Body.String(), "%PDF") || !strings.Contains(rec.Header().Get("Content-Disposition"), "attachment") || rec.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("receipt: %d %s", rec.Code, rec.Body)
	}
	if path := os.Getenv("RECEIPT_TEST_PDF_PATH"); path != "" {
		if err := os.WriteFile(path, rec.Body.Bytes(), 0600); err != nil {
			t.Fatal(err)
		}
	}
	rec = call("/" + payment.Slug.String() + "/status")
	json.Unmarshal(rec.Body.Bytes(), &detail)
	if detail["checkout_url"] != "" || detail["receipt_url"] == "" {
		t.Fatalf("wrong successful links: %s", rec.Body)
	}
	if rec := call("/" + uuid.NewString() + "/receipt.pdf"); rec.Code != 404 {
		t.Fatalf("unknown receipt: %d", rec.Code)
	}
}
