package shop

import (
	"encoding/json"
	"errors"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrPickupNotEligible = errors.New("only paid merchandise orders with verified payment can be collected")

func (h *Handler) CollectOrder(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, 400, "", "invalid order ID", nil)
		return
	}
	var order models.Order
	err = h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("slug = ?", slug).First(&order).Error; err != nil {
			return err
		}
		if order.Status != "paid" {
			return ErrPickupNotEligible
		}
		var count int64
		if err := tx.Model(&models.Payment{}).Where("order_id = ? AND status = ? AND amount_minor = ? AND currency = ?", order.ID, "success", order.TotalMinor, order.Currency).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return ErrPickupNotEligible
		}
		if err := tx.Table("order_items").Joins("JOIN products ON products.id = order_items.product_id").Where("order_items.order_id = ? AND UPPER(COALESCE(NULLIF(order_items.product_type,''),products.type)) = ?", order.ID, "MERCH").Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return ErrPickupNotEligible
		}
		if order.CollectedAt != nil {
			return nil
		}
		now := time.Now()
		actor := h.getActorID(c)
		order.CollectedAt = &now
		order.CollectedBy = &actor
		if err := tx.Save(&order).Error; err != nil {
			return err
		}
		value, _ := json.Marshal(map[string]interface{}{"collected_at": now})
		return audit.NewService(tx).Log(c.Request.Context(), audit.Entry{ActorUserID: actor, ActionKey: "order.collect", EntityType: "order", EntityID: slug.String(), NewJSON: value, IP: c.ClientIP(), UserAgent: c.GetHeader("User-Agent")})
	})
	if err != nil {
		status, message := 500, "unable to record collection"
		if errors.Is(err, gorm.ErrRecordNotFound) {
			status, message = 404, "order not found"
		}
		if errors.Is(err, ErrPickupNotEligible) {
			status, message = 409, err.Error()
		}
		apierrors.AbortWithError(c, status, "", message, nil)
		return
	}
	c.JSON(200, gin.H{"slug": order.Slug, "collected_at": order.CollectedAt})
}
