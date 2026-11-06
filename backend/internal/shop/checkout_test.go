package shop_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"ecostride/backend/internal/common/config"
	httpserver "ecostride/backend/internal/common/http"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/payments"
	"ecostride/backend/internal/shop"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestStockReservationConcurrencyAndExpiry(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	s := shop.NewService(db)
	ctx := context.Background()
	stock, price := 1, 5000
	product := models.Product{Slug: uuid.New(), URLSlug: "cap", Name: "Cap", Type: "MERCH", Active: true, StockQty: &stock, PriceKESMinor: &price}
	if err := db.Create(&product).Error; err != nil {
		t.Fatal(err)
	}
	results := make(chan models.Order, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			key := uuid.NewString()
			order, err := s.CreateOrder(ctx, models.Order{Slug: uuid.New(), CheckoutKey: &key, RequestFingerprint: "same", Status: "pending", Currency: "KES", TotalMinor: price}, []models.OrderItem{{Slug: uuid.New(), ProductID: product.ID, Qty: 1, UnitPriceMinor: price, LineTotalMinor: price}})
			if err == nil {
				results <- order
			}
		}()
	}
	wg.Wait()
	close(results)
	var winner models.Order
	count := 0
	for order := range results {
		winner = order
		count++
	}
	if count != 1 {
		t.Fatalf("oversold: %d orders", count)
	}
	replay, err := s.CreateOrder(ctx, winner, []models.OrderItem{{ProductID: product.ID, Qty: 1, UnitPriceMinor: price}})
	if err != nil || replay.ID != winner.ID {
		t.Fatalf("order replay failed: %v", err)
	}
	if err := s.ExpireOrder(ctx, winner.ID); err != nil {
		t.Fatal(err)
	}
	var before models.Product
	db.First(&before, product.ID)
	if *before.StockQty != 0 {
		t.Fatal("early reservation release")
	}
	db.Model(&winner).Update("reservation_expires_at", time.Now().Add(-time.Minute))
	payService := payments.NewService(db, config.Config{}, nil)
	data := payments.PaymentContext{Order: &winner, Currency: "KES", AmountMinor: price}
	if _, _, err := payService.ClaimPayment(ctx, "PESAPAL", data, "expired-payment", nil); err == nil {
		t.Fatal("expired reservation accepted a new payment")
	}
	late, err := payService.CreatePayment(ctx, "PESAPAL", data, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := payService.MarkPaymentSuccess(ctx, late); err != nil {
		t.Fatal(err)
	}
	var review models.Order
	db.First(&review, winner.ID)
	if review.Status != "pending" {
		t.Fatal("late payment granted fulfillment")
	}

	for i := 0; i < 2; i++ {
		if err := s.ExpireOrder(ctx, winner.ID); err != nil {
			t.Fatal(err)
		}
	}
	var after models.Product
	db.First(&after, product.ID)
	if *after.StockQty != 1 {
		t.Fatalf("stock release not once: %d", *after.StockQty)
	}
	var expired models.Order
	db.First(&expired, winner.ID)
	if expired.Status != "cancelled" {
		t.Fatal("expired order remains payable")
	}
}

func TestSupportPricingAndPaidPickup(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	httpserver.RegisterValidation()
	gin.SetMode(gin.TestMode)
	s := shop.NewService(db)
	h := shop.NewHandler(s, nil, db, nil, config.Config{}, nil)
	price := 10000
	support := models.Product{Slug: uuid.New(), URLSlug: "support", Name: "Support", Type: "DONATION_TIER", Active: true, AllowCustomAmount: true, PriceKESMinor: &price}
	merch := models.Product{Slug: uuid.New(), URLSlug: "shirt", Name: "Shirt", Type: "MERCH", Active: true, PriceKESMinor: &price}
	db.Create(&support)
	db.Create(&merch)
	router := gin.New()
	router.POST("/orders", h.CreateOrder)
	router.POST("/orders/:id/collect", h.CollectOrder)
	call := func(path string, body interface{}, key string) *httptest.ResponseRecorder {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Idempotency-Key", key)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	body := func(slug string, amount int) map[string]interface{} {
		return map[string]interface{}{"buyer_name": "Buyer", "email": "buyer@example.com", "currency": "KES", "items": []map[string]interface{}{{"product_slug": slug, "qty": 1, "custom_amount_minor": amount}}}
	}
	if rec := call("/orders", body(support.Slug.String(), -100), "negative"); rec.Code != 400 {
		t.Fatalf("negative custom amount accepted: %d %s", rec.Code, rec.Body)
	}
	if rec := call("/orders", body(merch.Slug.String(), 1), "fixed-price"); rec.Code != 400 {
		t.Fatalf("merch price override accepted: %d %s", rec.Code, rec.Body)
	}
	rec := call("/orders", body(support.Slug.String(), 25000), "support-order")
	if rec.Code != 201 {
		t.Fatalf("support order: %d %s", rec.Code, rec.Body)
	}
	var supportOrder models.Order
	db.Where("checkout_key = ?", "support-order").First(&supportOrder)
	if supportOrder.TotalMinor != 25000 {
		t.Fatalf("custom amount ignored: %d", supportOrder.TotalMinor)
	}
	var order models.Order
	order.Slug = uuid.New()
	order.Status = "pending"
	order.Currency = "KES"
	order.TotalMinor = price
	db.Create(&order)
	db.Create(&models.OrderItem{Slug: uuid.New(), OrderID: order.ID, ProductID: merch.ID, Qty: 1, UnitPriceMinor: price, LineTotalMinor: price})
	path := "/orders/" + order.Slug.String() + "/collect"
	if rec := call(path, map[string]string{}, ""); rec.Code != 409 {
		t.Fatalf("unpaid pickup accepted: %d", rec.Code)
	}
	db.Model(&order).Update("status", "paid")
	if rec := call(path, map[string]string{}, ""); rec.Code != 409 {
		t.Fatalf("status alone allowed pickup: %d", rec.Code)
	}
	db.Create(&models.Payment{Slug: uuid.New(), OrderID: &order.ID, Provider: "PESAPAL", Status: "success", Currency: "KES", AmountMinor: price})
	for i := 0; i < 2; i++ {
		if rec := call(path, map[string]string{}, ""); rec.Code != 200 {
			t.Fatalf("paid pickup: %d %s", rec.Code, rec.Body)
		}
	}
	var picked models.Order
	db.First(&picked, order.ID)
	if picked.CollectedAt == nil {
		t.Fatal("missing collection record")
	}
	var audits int64
	db.Model(&models.AuditLog{}).Where("action_key = ?", "order.collect").Count(&audits)
	if audits != 1 {
		t.Fatalf("duplicate collection audit: %d", audits)
	}
}
