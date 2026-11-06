package payments

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/apierrors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *Handler) PaymentProviders(c *gin.Context) {
	c.JSON(200, gin.H{"pesapal_enabled": h.Config.PesaPalEnabled})
}
func (h *Handler) PesaPalCheckout(c *gin.Context) {
	if !h.Config.PesaPalEnabled {
		apierrors.AbortWithError(c, 503, "", "PesaPal is not enabled", nil)
		return
	}
	var req struct {
		RegistrationSlug string `json:"registration_slug"`
		OrderSlug        string `json:"order_slug"`
		Currency         string `json:"currency"`
	}
	if !apierrors.BindJSON(c, &req) {
		return
	}
	if (req.RegistrationSlug == "") == (req.OrderSlug == "") {
		apierrors.AbortWithError(c, 400, "", "exactly one payment target required", nil)
		return
	}
	// Enable additional currencies only after merchant-account acceptance testing.
	if req.Currency != "" && !strings.EqualFold(req.Currency, "KES") {
		apierrors.AbortWithError(c, 400, "", "PesaPal checkout currently supports KES", nil)
		return
	}
	slug, err := uuid.Parse(req.RegistrationSlug + req.OrderSlug)
	if err != nil {
		apierrors.AbortWithError(c, 400, "", "invalid payment target", nil)
		return
	}
	var data PaymentContext
	if req.RegistrationSlug != "" {
		data, err = h.Service.BuildRegistrationContext(c.Request.Context(), slug, "KES")
	} else {
		data, err = h.Service.BuildOrderContext(c.Request.Context(), slug)
	}
	if err != nil || data.Currency != "KES" || data.AmountMinor <= 0 {
		apierrors.AbortWithError(c, 400, "", "payment target is not payable in KES", nil)
		return
	}
	payment, created, err := h.Service.ClaimPayment(c.Request.Context(), "PESAPAL", data, c.GetHeader("X-Idempotency-Key"), map[string]interface{}{"pesapal_environment": h.Config.PesaPalEnvironment})
	if err != nil {
		status, message := 500, "failed to claim payment"
		if errors.Is(err, ErrIdempotencyRequired) {
			status, message = 400, err.Error()
		}
		if errors.Is(err, ErrPaymentInProgress) || errors.Is(err, ErrIdempotencyConflict) {
			status, message = 409, err.Error()
		}
		apierrors.AbortWithError(c, status, "", message, nil)
		return
	}
	if created {
		// Schedule follow-up before submission. An unknown outcome remains blocked.
		payment, err = h.Service.SubmitPesaPal(c.Request.Context(), payment, data)
	}
	code := 200
	redirect := extractMetadataString(payment.Metadata, "checkout_url")
	if err != nil || redirect == "" {
		code = 202
	}
	c.JSON(code, gin.H{"payment_id": payment.Slug, "status": payment.Status, "checkout_url": redirect})
}

type pesaPalNotification struct {
	TrackingID string `json:"OrderTrackingId"`
	Reference  string `json:"OrderMerchantReference"`
	Type       string `json:"OrderNotificationType"`
}

func (h *Handler) PesaPalNotification(c *gin.Context) {
	if !h.Config.PesaPalEnabled {
		apierrors.AbortWithError(c, 503, "", "PesaPal is not enabled", nil)
		return
	}
	var notice pesaPalNotification
	if c.Request.Method == http.MethodPost {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
		if err := c.ShouldBindJSON(&notice); err != nil {
			apierrors.AbortWithError(c, 400, "", "invalid notification", nil)
			return
		}
	} else {
		notice = pesaPalNotification{TrackingID: c.Query("OrderTrackingId"), Reference: c.Query("OrderMerchantReference"), Type: c.Query("OrderNotificationType")}
	}
	isCallback := strings.HasSuffix(c.FullPath(), "/callback")
	expected := "IPNCHANGE"
	if isCallback {
		expected = "CALLBACKURL"
	}
	// The sandbox's hosted return can omit the notification type. This route
	// still verifies the references and authoritative status before any change.
	if notice.Type != expected && !(isCallback && notice.Type == "") {
		apierrors.AbortWithError(c, 400, "", "invalid notification type", nil)
		return
	}
	slug, err := uuid.Parse(notice.Reference)
	if err != nil {
		apierrors.AbortWithError(c, 400, "", "invalid reference", nil)
		return
	}
	payment, err := h.Service.FindPaymentBySlug(c.Request.Context(), slug)
	if err != nil || payment.Provider != "PESAPAL" {
		apierrors.AbortWithError(c, 404, "", "payment not found", nil)
		return
	}
	_, err = h.Service.VerifyPesaPal(c.Request.Context(), payment, notice.TrackingID, nil)
	if isCallback {
		// The destination is server configuration and the page displays local status.
		c.Redirect(http.StatusSeeOther, strings.TrimRight(h.Config.PesaPalReturnURL, "/")+"/"+payment.Slug.String())
		return
	}
	status := 200
	if err != nil {
		status = 500
	}
	c.JSON(status, gin.H{"orderNotificationType": "IPNCHANGE", "orderTrackingId": notice.TrackingID, "orderMerchantReference": notice.Reference, "status": status})
}
func (h *Handler) VerifyPesaPalAdmin(c *gin.Context) {
	var req struct {
		Reason string `json:"reason"`
	}
	if !apierrors.BindJSON(c, &req) {
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" || len(req.Reason) > 500 {
		apierrors.AbortWithError(c, 400, "", "reason is required (maximum 500 characters)", nil)
		return
	}
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, 400, "", "invalid payment ID", nil)
		return
	}
	payment, err := h.Service.FindPaymentBySlug(c.Request.Context(), slug)
	if err != nil {
		apierrors.AbortWithError(c, 404, "", "payment not found", nil)
		return
	}
	if payment.Provider != "PESAPAL" || payment.ProviderRef == "" {
		apierrors.AbortWithError(c, 409, "", "a saved PesaPal tracking ID is required; review with the provider", nil)
		return
	}
	value, _ := json.Marshal(gin.H{"reason": req.Reason})
	entry := audit.Entry{ActorUserID: h.getActorID(c), ActionKey: "payment.verify", EntityType: "payment", EntityID: slug.String(), NewJSON: value, IP: c.ClientIP(), UserAgent: c.GetHeader("User-Agent")}
	payment, err = h.Service.VerifyPesaPal(c.Request.Context(), payment, payment.ProviderRef, &entry)
	if err != nil {
		apierrors.AbortWithError(c, 502, "", "unable to verify payment; current local status retained", nil)
		return
	}
	c.JSON(200, gin.H{"payment_id": payment.Slug, "status": payment.Status})
}
