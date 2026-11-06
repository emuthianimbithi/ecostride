package http

import (
	"ecostride/backend/internal/auth"
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLegacyCheckoutRoutesCannotCreatePayments(t *testing.T) {
	gin.SetMode(gin.TestMode)
	manager := auth.NewManager("access-test", "refresh-test")
	router := gin.New()
	registerAPIRoutes(router, Handlers{Auth: auth.NewHandler(auth.NewService(nil, manager), nil)}, manager)
	for _, path := range []string{"/api/v1/public/payments/stripe/checkout", "/api/v1/public/payments/mpesa/stk", "/api/v1/public/shop/orders/any-order/pay/stripe", "/api/v1/public/shop/orders/any-order/pay/mpesa"} {
		req := httptest.NewRequest("POST", path, strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != 410 || !strings.Contains(rec.Body.String(), "PAYMENT_PROVIDER_DISABLED") {
			t.Fatalf("legacy route %s: %d %s", path, rec.Code, rec.Body)
		}
	}
}
