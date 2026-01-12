package payments

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/webhook"
	"gorm.io/gorm"
)

// Handler exposes payment HTTP handlers.
type Handler struct {
	Service *Service
	Config  config.Config
	Audit   *audit.Service
	DB      *gorm.DB
}

func NewHandler(service *Service, cfg config.Config, auditService *audit.Service, db *gorm.DB) *Handler {
	return &Handler{Service: service, Config: cfg, Audit: auditService, DB: db}
}

type stripeCheckoutRequest struct {
	RegistrationSlug string `json:"registration_slug"`
	OrderSlug        string `json:"order_slug"`
	Currency         string `json:"currency"`
	SuccessURL       string `json:"success_url"`
	CancelURL        string `json:"cancel_url"`
}

type mpesaSTKRequest struct {
	RegistrationSlug string `json:"registration_slug"`
	OrderSlug        string `json:"order_slug"`
	Phone            string `json:"phone" binding:"required,phone"`
}

type refundRequest struct {
	AmountMinor *int   `json:"amount_minor"`
	Reason      string `json:"reason"`
	Manual      bool   `json:"manual"`
}

type paymentListItem struct {
	Slug             string
	Provider         string
	Currency         string
	AmountMinor      int
	Status           string
	ProviderRef      string
	CreatedAt        time.Time
	RegistrationSlug *string
	OrderSlug        *string
	PayerName        *string
	PayerEmail       *string
	LinkedType       string
	EventTitle       *string
	EventStartAt     *time.Time
	CategoryName     *string
}

func (h *Handler) StripeCheckout(c *gin.Context) {
	var req stripeCheckoutRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	if req.RegistrationSlug == "" && req.OrderSlug == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "registration_slug or order_slug required", nil)
		return
	}

	if req.RegistrationSlug != "" && req.OrderSlug != "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "provide only one target", nil)
		return
	}

	successURL := req.SuccessURL
	cancelURL := req.CancelURL
	if successURL == "" {
		successURL = h.Config.StripeSuccessURL
	}
	if cancelURL == "" {
		cancelURL = h.Config.StripeCancelURL
	}
	if successURL == "" || cancelURL == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "success_url and cancel_url required", nil)
		return
	}

	idempotencyKey := c.GetHeader("X-Idempotency-Key")
	if existing, _ := h.Service.EnsureIdempotency(c.Request.Context(), idempotencyKey); existing != nil {
		c.JSON(http.StatusOK, gin.H{
			"payment_id":   existing.Slug,
			"status":       existing.Status,
			"checkout_url": extractMetadata(existing.Metadata, "checkout_url"),
		})
		return
	}

	var ctxData PaymentContext
	var err error
	if req.RegistrationSlug != "" {
		registrationSlug, parseErr := uuid.Parse(req.RegistrationSlug)
		if parseErr != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid registration_slug", nil)
			return
		}
		ctxData, err = h.Service.BuildRegistrationContext(c.Request.Context(), registrationSlug, req.Currency)
	} else {
		orderSlug, parseErr := uuid.Parse(req.OrderSlug)
		if parseErr != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid order_slug", nil)
			return
		}
		ctxData, err = h.Service.BuildOrderContext(c.Request.Context(), orderSlug)
	}
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", err.Error(), nil)
		return
	}

	payment, err := h.Service.CreatePayment(c.Request.Context(), "STRIPE", ctxData, idempotencyKey, nil)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create payment", nil)
		return
	}

	stripeSession, err := h.Service.CreateStripeSession(c.Request.Context(), payment, ctxData, successURL, cancelURL, idempotencyKey)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "stripe checkout failed", nil)
		return
	}

	payment, err = h.Service.UpdatePayment(c.Request.Context(), payment, stripeSession.SessionID, map[string]interface{}{
		"checkout_url": stripeSession.CheckoutURL,
		"session_id":   stripeSession.SessionID,
	})
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"payment_id":   payment.Slug,
		"status":       payment.Status,
		"checkout_url": stripeSession.CheckoutURL,
	})
}

func (h *Handler) MpesaSTK(c *gin.Context) {
	var req mpesaSTKRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	if req.RegistrationSlug == "" && req.OrderSlug == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "registration_slug or order_slug required", nil)
		return
	}

	if req.RegistrationSlug != "" && req.OrderSlug != "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "provide only one target", nil)
		return
	}

	idempotencyKey := c.GetHeader("X-Idempotency-Key")
	if existing, _ := h.Service.EnsureIdempotency(c.Request.Context(), idempotencyKey); existing != nil {
		c.JSON(http.StatusOK, gin.H{"payment_id": existing.Slug, "status": existing.Status})
		return
	}

	phone := normalizePhone(req.Phone)
	if phone == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid phone", nil)
		return
	}

	var ctxData PaymentContext
	var err error
	if req.RegistrationSlug != "" {
		registrationSlug, parseErr := uuid.Parse(req.RegistrationSlug)
		if parseErr != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid registration_slug", nil)
			return
		}
		ctxData, err = h.Service.BuildRegistrationContext(c.Request.Context(), registrationSlug, "KES")
	} else {
		orderSlug, parseErr := uuid.Parse(req.OrderSlug)
		if parseErr != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid order_slug", nil)
			return
		}
		ctxData, err = h.Service.BuildOrderContext(c.Request.Context(), orderSlug)
	}
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", err.Error(), nil)
		return
	}

	if ctxData.Currency != "KES" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "mpesa supports KES only", nil)
		return
	}

	payment, err := h.Service.CreatePayment(c.Request.Context(), "MPESA", ctxData, idempotencyKey, map[string]interface{}{"phone": phone})
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create payment", nil)
		return
	}

	response, err := h.Service.InitiateMpesaSTK(c.Request.Context(), payment, phone)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", err.Error(), nil)
		return
	}

	payment, err = h.Service.UpdatePayment(c.Request.Context(), payment, response.CheckoutRequestID, map[string]interface{}{
		"merchant_request_id": response.MerchantRequestID,
		"customer_message":    response.CustomerMessage,
	})
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"payment_id":          payment.Slug,
		"status":              payment.Status,
		"checkout_request_id": response.CheckoutRequestID,
		"customer_message":    response.CustomerMessage,
	})
}

func (h *Handler) StripeWebhook(c *gin.Context) {
	if h.Config.StripeWebhookSecret == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "stripe webhook secret not configured", nil)
		return
	}

	payload, err := c.GetRawData()
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid payload", nil)
		return
	}

	signature := c.GetHeader("Stripe-Signature")
	event, err := webhook.ConstructEvent(payload, signature, h.Config.StripeWebhookSecret)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid signature", nil)
		return
	}

	if event.Type != "checkout.session.completed" {
		c.JSON(http.StatusOK, gin.H{"status": "ignored"})
		return
	}

	var sessionObj stripe.CheckoutSession
	if err := json.Unmarshal(event.Data.Raw, &sessionObj); err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid session", nil)
		return
	}

	providerRef := sessionObj.ID
	if providerRef == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "missing session id", nil)
		return
	}

	var payment models.Payment
	if err := h.DB.WithContext(c.Request.Context()).Where("provider_ref = ?", providerRef).First(&payment).Error; err != nil {
		if sessionObj.Metadata != nil {
			if paymentSlug, ok := sessionObj.Metadata["payment_slug"]; ok {
				if parsed, parseErr := uuid.Parse(paymentSlug); parseErr == nil {
					if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", parsed).First(&payment).Error; err == nil {
						_, _ = h.Service.UpdatePayment(c.Request.Context(), payment, providerRef, nil)
					}
				}
			}
		}
		if payment.ID == 0 {
			apierrors.AbortWithError(c, http.StatusNotFound, "", "payment not found", nil)
			return
		}
	}

	if err := h.Service.RecordEvent(c.Request.Context(), payment.ID, event.ID, string(event.Type), payload); err != nil {
		if errors.Is(err, ErrDuplicateEvent) {
			c.JSON(http.StatusOK, gin.H{"status": "duplicate"})
			return
		}
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to record event", nil)
		return
	}

	metadata := map[string]interface{}{}
	if sessionObj.PaymentIntent != nil && sessionObj.PaymentIntent.ID != "" {
		metadata["payment_intent"] = sessionObj.PaymentIntent.ID
	}
	if sessionObj.CustomerDetails != nil && sessionObj.CustomerDetails.Email != "" {
		metadata["customer_email"] = sessionObj.CustomerDetails.Email
	}
	if len(metadata) > 0 {
		_, _ = h.Service.UpdatePayment(c.Request.Context(), payment, "", metadata)
	}

	updated, err := h.Service.MarkPaymentSuccess(c.Request.Context(), payment)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
		return
	}

	h.logAudit(c, "payment.success", "payment", updated.Slug.String(), payment, updated)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) MpesaWebhook(c *gin.Context) {
	if !h.verifyMpesaRequest(c) {
		return
	}

	payload, err := c.GetRawData()
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid payload", nil)
		return
	}

	var callback mpesaCallback
	if err := json.Unmarshal(payload, &callback); err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid callback", nil)
		return
	}

	stk := callback.Body.StkCallback
	if stk.CheckoutRequestID == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "missing checkout_request_id", nil)
		return
	}

	var payment models.Payment
	if err := h.DB.WithContext(c.Request.Context()).Where("provider_ref = ?", stk.CheckoutRequestID).First(&payment).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "payment not found", nil)
		return
	}

	if err := h.Service.RecordEvent(c.Request.Context(), payment.ID, stk.CheckoutRequestID, "mpesa.stk", payload); err != nil {
		if errors.Is(err, ErrDuplicateEvent) {
			c.JSON(http.StatusOK, gin.H{"status": "duplicate"})
			return
		}
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to record event", nil)
		return
	}

	metadata := map[string]interface{}{
		"result_code": stk.ResultCode,
		"result_desc": stk.ResultDesc,
	}

	if receipt := callback.receiptNumber(); receipt != "" {
		metadata["mpesa_receipt"] = receipt
	}

	if _, err := h.Service.UpdatePayment(c.Request.Context(), payment, "", metadata); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
		return
	}

	if stk.ResultCode == 0 {
		updated, err := h.Service.MarkPaymentSuccess(c.Request.Context(), payment)
		if err != nil {
			apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
			return
		}
		h.logAudit(c, "payment.success", "payment", updated.Slug.String(), payment, updated)
	} else {
		updated, err := h.Service.MarkPaymentFailed(c.Request.Context(), payment)
		if err != nil {
			apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
			return
		}
		h.logAudit(c, "payment.failed", "payment", updated.Slug.String(), payment, updated)
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) PaymentStatus(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid payment id", nil)
		return
	}

	payment, err := h.Service.FindPaymentBySlug(c.Request.Context(), slug)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "payment not found", nil)
		return
	}

	var registrationSlug *string
	if payment.RegistrationID != nil {
		var registration models.Registration
		if err := h.DB.WithContext(c.Request.Context()).Where("id = ?", *payment.RegistrationID).First(&registration).Error; err == nil {
			value := registration.Slug.String()
			registrationSlug = &value
		}
	}

	var orderSlug *string
	if payment.OrderID != nil {
		var order models.Order
		if err := h.DB.WithContext(c.Request.Context()).Where("id = ?", *payment.OrderID).First(&order).Error; err == nil {
			value := order.Slug.String()
			orderSlug = &value
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"payment_id":        payment.Slug.String(),
		"status":            CanonicalizePaymentStatus(payment.Status),
		"provider":          strings.ToUpper(payment.Provider),
		"currency":          strings.ToUpper(payment.Currency),
		"amount_minor":      payment.AmountMinor,
		"provider_ref":      payment.ProviderRef,
		"created_at":        payment.CreatedAt.Format(time.RFC3339),
		"registration_slug": registrationSlug,
		"order_slug":        orderSlug,
	})
}

func (h *Handler) ListPayments(c *gin.Context) {
	status := c.Query("status")
	provider := c.Query("provider")

	query := h.DB.WithContext(c.Request.Context()).
		Table("payments").
		Select(`
			payments.slug,
			payments.provider,
			payments.currency,
			payments.amount_minor,
			payments.status,
			payments.provider_ref,
			payments.created_at,
			registrations.slug as registration_slug,
			orders.slug as order_slug,
			COALESCE(registrations.athlete_name, orders.buyer_name) as payer_name,
			COALESCE(registrations.email, orders.email) as payer_email,
			CASE WHEN payments.registration_id IS NOT NULL THEN 'Registration' ELSE 'Shop Order' END as linked_type,
			events.title as event_title,
			events.start_at as event_start_at,
			event_categories.name as category_name
		`).
		Joins("LEFT JOIN registrations ON registrations.id = payments.registration_id").
		Joins("LEFT JOIN orders ON orders.id = payments.order_id").
		Joins("LEFT JOIN events ON events.id = registrations.event_id").
		Joins("LEFT JOIN event_categories ON event_categories.id = registrations.category_id")
	if status != "" {
		query = query.Where("payments.status = ?", status)
	}
	if provider != "" {
		query = query.Where("payments.provider = ?", strings.ToUpper(provider))
	}

	var payments []paymentListItem
	if err := query.Order("payments.created_at desc").Scan(&payments).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list payments", nil)
		return
	}

	type paymentAdminDTO struct {
		PaymentID         string     `json:"payment_id"`
		Status            string     `json:"status"`
		Provider          string     `json:"provider"`
		Currency          string     `json:"currency"`
		AmountMinor       int        `json:"amount_minor"`
		ProviderRef       string     `json:"provider_ref"`
		CreatedAt         string     `json:"created_at"`
		RegistrationSlug  *string    `json:"registration_slug,omitempty"`
		OrderSlug         *string    `json:"order_slug,omitempty"`
		PayerName         *string    `json:"payer_name,omitempty"`
		PayerEmail        *string    `json:"payer_email,omitempty"`
		LinkedType        string     `json:"linked_type"`
		EventTitle        *string    `json:"event_title,omitempty"`
		EventStartAt      *time.Time `json:"event_start_at,omitempty"`
		CategoryName      *string    `json:"category_name,omitempty"`
		ProviderDashboard *string    `json:"provider_dashboard_url,omitempty"`
	}

	out := make([]paymentAdminDTO, 0, len(payments))
	for _, p := range payments {
		statusVal := CanonicalizePaymentStatus(p.Status)
		out = append(out, paymentAdminDTO{
			PaymentID:        p.Slug,
			Status:           statusVal,
			Provider:         strings.ToUpper(p.Provider),
			Currency:         strings.ToUpper(p.Currency),
			AmountMinor:      p.AmountMinor,
			ProviderRef:      p.ProviderRef,
			CreatedAt:        p.CreatedAt.Format(time.RFC3339),
			RegistrationSlug: p.RegistrationSlug,
			OrderSlug:        p.OrderSlug,
			PayerName:        p.PayerName,
			PayerEmail:       p.PayerEmail,
			LinkedType:       p.LinkedType,
			EventTitle:       p.EventTitle,
			EventStartAt:     p.EventStartAt,
			CategoryName:     p.CategoryName,
		})
	}

	c.JSON(http.StatusOK, out)
}

func (h *Handler) Refund(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid payment id", nil)
		return
	}

	var payment models.Payment
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&payment).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "payment not found", nil)
		return
	}

	var req refundRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		apierrors.AbortValidationError(c, err)
		return
	}

	if payment.Status == "refunded" {
		c.JSON(http.StatusOK, payment)
		return
	}
	if payment.Status != "success" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "payment not refundable", nil)
		return
	}

	if req.AmountMinor != nil {
		if *req.AmountMinor <= 0 {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "amount_minor must be positive", nil)
			return
		}
		if *req.AmountMinor > payment.AmountMinor {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "amount_minor exceeds payment", nil)
			return
		}
	}

	refundAmount := payment.AmountMinor
	if req.AmountMinor != nil {
		refundAmount = *req.AmountMinor
	}

	old := payment
	refundMeta := map[string]interface{}{
		"refund_amount_minor": refundAmount,
		"refund_reason":       req.Reason,
		"refunded_at":         time.Now().Format(time.RFC3339),
	}

	var refundEventID string
	var refundPayload []byte

	switch strings.ToUpper(payment.Provider) {
	case "STRIPE":
		if !req.Manual {
			refundID, meta, err := h.Service.RefundStripe(c.Request.Context(), payment, req.AmountMinor, req.Reason)
			if err != nil {
				apierrors.AbortWithError(c, http.StatusInternalServerError, "", "stripe refund failed", nil)
				return
			}
			refundEventID = refundID
			for key, value := range meta {
				refundMeta[key] = value
			}
		} else {
			refundMeta["manual_refund"] = true
		}
	case "MPESA":
		if !req.Manual {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "mpesa refunds must be manual", nil)
			return
		}
		refundMeta["manual_refund"] = true
	default:
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "unsupported provider", nil)
		return
	}

	refundPayload, _ = json.Marshal(refundMeta)
	if refundEventID == "" {
		refundEventID = uuid.New().String()
	}
	_ = h.Service.RecordEvent(c.Request.Context(), payment.ID, refundEventID, "payment.refund", refundPayload)

	payment, err = h.Service.UpdatePayment(c.Request.Context(), payment, "", refundMeta)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
		return
	}

	updated, err := h.Service.MarkPaymentRefunded(c.Request.Context(), payment)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
		return
	}

	h.logAudit(c, "payment.refund", "payment", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) verifyMpesaRequest(c *gin.Context) bool {
	if h.Config.MPesaWebhookToken != "" {
		token := c.GetHeader("X-Mpesa-Token")
		if token != h.Config.MPesaWebhookToken {
			apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid token", nil)
			return false
		}
	}

	if h.Config.MPesaAllowedIPs != "" {
		allowed := strings.Split(h.Config.MPesaAllowedIPs, ",")
		clientIP := c.ClientIP()
		for i := range allowed {
			if strings.TrimSpace(allowed[i]) == clientIP {
				return true
			}
		}
		apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized ip", nil)
		return false
	}

	return true
}

func (h *Handler) logAudit(c *gin.Context, action, entityType, entityID string, oldValue interface{}, newValue interface{}) {
	actorID := h.getActorID(c)
	if actorID == 0 {
		return
	}

	oldJSON, _ := json.Marshal(oldValue)
	newJSON, _ := json.Marshal(newValue)

	_ = h.Audit.Log(c.Request.Context(), audit.Entry{
		ActorUserID: actorID,
		ActionKey:   action,
		EntityType:  entityType,
		EntityID:    entityID,
		OldJSON:     oldJSON,
		NewJSON:     newJSON,
		IP:          c.ClientIP(),
		UserAgent:   c.GetHeader("User-Agent"),
	})
}

func (h *Handler) getActorID(c *gin.Context) uint {
	claimsValue, exists := c.Get("authClaims")
	if !exists {
		return 0
	}
	claims, ok := claimsValue.(*auth.Claims)
	if !ok {
		return 0
	}
	return claims.UserID
}

func extractMetadata(metadataJSON []byte, key string) string {
	if len(metadataJSON) == 0 {
		return ""
	}

	var data map[string]interface{}
	if err := json.Unmarshal(metadataJSON, &data); err != nil {
		return ""
	}

	if value, ok := data[key]; ok {
		if str, ok := value.(string); ok {
			return str
		}
	}

	return ""
}

func normalizePhone(phone string) string {
	value := strings.ReplaceAll(strings.TrimSpace(phone), " ", "")
	if value == "" {
		return ""
	}
	if strings.HasPrefix(value, "+") {
		value = strings.TrimPrefix(value, "+")
	}
	if strings.HasPrefix(value, "0") {
		value = "254" + strings.TrimPrefix(value, "0")
	}
	return value
}

type mpesaCallback struct {
	Body struct {
		StkCallback struct {
			MerchantRequestID string `json:"MerchantRequestID"`
			CheckoutRequestID string `json:"CheckoutRequestID"`
			ResultCode        int    `json:"ResultCode"`
			ResultDesc        string `json:"ResultDesc"`
			CallbackMetadata  struct {
				Item []struct {
					Name  string      `json:"Name"`
					Value interface{} `json:"Value"`
				} `json:"Item"`
			} `json:"CallbackMetadata"`
		} `json:"stkCallback"`
	} `json:"Body"`
}

func (m mpesaCallback) receiptNumber() string {
	for _, item := range m.Body.StkCallback.CallbackMetadata.Item {
		if item.Name == "MpesaReceiptNumber" {
			if value, ok := item.Value.(string); ok {
				return value
			}
		}
	}
	return ""
}
