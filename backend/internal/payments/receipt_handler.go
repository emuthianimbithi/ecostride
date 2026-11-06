package payments

import (
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"mime"
)

func (h *Handler) DownloadReceipt(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
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
	if payment.Status != "success" && payment.Status != "refunded" {
		apierrors.AbortWithError(c, 409, "", "receipt requires a verified successful payment", nil)
		return
	}
	var receipt models.Receipt
	if err := h.DB.WithContext(c.Request.Context()).Where("payment_id = ?", payment.ID).First(&receipt).Error; err != nil {
		apierrors.AbortWithError(c, 404, "", "receipt is not available yet", nil)
		return
	}
	if h.Service.Receipts == nil {
		apierrors.AbortWithError(c, 503, "", "receipt service unavailable", nil)
		return
	}
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": "receipt-" + receipt.ReceiptNumber + ".pdf"}))
	c.Data(200, "application/pdf", h.Service.Receipts.BuildReceiptPDF(c.Request.Context(), receipt, payment))
}
