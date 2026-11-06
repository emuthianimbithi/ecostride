package payments

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/jobs"
	"ecostride/backend/internal/receipts"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (h *Handler) GetPaymentDetail(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, 400, "", "invalid payment id", nil)
		return
	}
	payment, err := h.Service.FindPaymentBySlug(c.Request.Context(), slug)
	if err != nil {
		apierrors.AbortWithError(c, 404, "", "payment not found", nil)
		return
	}
	type eventDTO struct {
		Type        string     `json:"type"`
		ReceivedAt  time.Time  `json:"received_at"`
		ProcessedAt *time.Time `json:"processed_at"`
	}
	var events []eventDTO
	if err := h.DB.WithContext(c.Request.Context()).Model(&models.PaymentEvent{}).Select("type, received_at, processed_at").Where("payment_id = ?", payment.ID).Order("received_at desc").Limit(50).Scan(&events).Error; err != nil {
		apierrors.AbortWithError(c, 500, "", "failed to load history", nil)
		return
	}
	type jobDTO struct {
		Slug     string    `json:"slug"`
		Type     string    `json:"type"`
		Status   string    `json:"status"`
		Attempts int       `json:"attempts"`
		RunAt    time.Time `json:"run_at"`
	}
	var delivery []jobDTO
	if err := h.DB.WithContext(c.Request.Context()).Model(&models.Job{}).Select("slug, type, status, attempts, run_at").Where("type IN ? AND payload->>'payment_id' = ?", []string{"receipt.email", "receipt.pdf"}, strconv.FormatUint(uint64(payment.ID), 10)).Order("created_at desc").Limit(50).Scan(&delivery).Error; err != nil {
		apierrors.AbortWithError(c, 500, "", "failed to load delivery history", nil)
		return
	}
	var receipt models.Receipt
	err = h.DB.WithContext(c.Request.Context()).Where("payment_id = ?", payment.ID).First(&receipt).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		apierrors.AbortWithError(c, 500, "", "failed to load receipt", nil)
		return
	}
	var metadata map[string]interface{}
	_ = json.Unmarshal(payment.Metadata, &metadata)
	stale := payment.Status == "pending" && time.Since(payment.CreatedAt) > 15*time.Minute
	var receiptDTO interface{}
	if receipt.ID != 0 {
		receiptDTO = gin.H{"number": receipt.ReceiptNumber, "delivered_email_at": receipt.DeliveredEmailAt, "pdf_ready": receipt.PDFMediaID != nil}
	}
	c.JSON(http.StatusOK, gin.H{"payment_id": payment.Slug, "status": CanonicalizePaymentStatus(payment.Status), "provider": payment.Provider, "provider_ref": payment.ProviderRef, "currency": payment.Currency, "amount_minor": payment.AmountMinor, "created_at": payment.CreatedAt, "requires_review": metadata["requires_review"] == true || stale, "pending_too_long": stale, "submission_uncertain": payment.Status == "pending" && payment.ProviderRef == "", "events": events, "delivery_jobs": delivery, "last_checked_at": payment.LastCheckedAt, "verification_attempts": payment.VerificationAttempts, "receipt": receiptDTO})
}

// Compatibility route uses the same permission, reason, saved recipient and
// transactional audit/deduplication as the payment console.
func (h *Handler) ResendRegistrationReceipt(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, 400, "", "invalid registration ID", nil)
		return
	}
	var payment models.Payment
	err = h.DB.WithContext(c.Request.Context()).Select("payments.*").Joins("JOIN registrations ON registrations.id = payments.registration_id AND registrations.deleted_at IS NULL").Where("registrations.slug = ? AND payments.status IN ?", slug, []string{"success", "refunded"}).Order("payments.created_at DESC").First(&payment).Error
	if err != nil {
		apierrors.AbortWithError(c, 404, "", "payment not found", nil)
		return
	}
	for i := range c.Params {
		if c.Params[i].Key == "id" {
			c.Params[i].Value = payment.Slug.String()
		}
	}
	h.ResendPaymentReceipt(c)
}

func (h *Handler) ResendPaymentReceipt(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, 400, "", "invalid payment id", nil)
		return
	}
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
	reused := false
	err = h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var payment models.Payment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("slug = ?", slug).First(&payment).Error; err != nil {
			return err
		}
		if payment.Status != "success" && payment.Status != "refunded" {
			return ErrPaymentInProgress
		}
		var receipt models.Receipt
		if err := tx.Where("payment_id = ?", payment.ID).First(&receipt).Error; err != nil {
			return err
		}
		if receipt.EmailTo == "" {
			return errors.New("receipt has no saved recipient")
		}
		var count int64
		if err := tx.Model(&models.Job{}).Where("type = ? AND status IN ? AND payload->>'payment_id' = ?", "receipt.email", []string{"pending", "processing"}, strconv.FormatUint(uint64(payment.ID), 10)).Count(&count).Error; err != nil {
			return err
		}
		reused = count > 0
		if !reused {
			if _, err := jobs.NewService(tx).Enqueue(c.Request.Context(), "receipt.email", receipts.ReceiptJobPayload{ReceiptID: receipt.ID, PaymentID: payment.ID, Email: receipt.EmailTo, Resend: true}, time.Now()); err != nil {
				return err
			}
		}
		record, _ := json.Marshal(gin.H{"reason": req.Reason, "reused_pending_job": reused})
		return audit.NewService(tx).Log(c.Request.Context(), audit.Entry{ActorUserID: h.getActorID(c), ActionKey: "payment.receipt.resend", EntityType: "payment", EntityID: slug.String(), NewJSON: record, IP: c.ClientIP(), UserAgent: c.GetHeader("User-Agent")})
	})
	if err != nil {
		status, message := 500, "failed to queue receipt"
		if errors.Is(err, gorm.ErrRecordNotFound) {
			status, message = 404, "payment or receipt not found"
		}
		if errors.Is(err, ErrPaymentInProgress) {
			status, message = 409, "receipt requires a successful or refunded payment"
		}
		apierrors.AbortWithError(c, status, "", message, nil)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"status": "queued", "reused_pending_job": reused})
}
