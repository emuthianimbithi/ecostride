package audit

import (
	"net/http"
	"strconv"
	"time"

	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Handler exposes audit log HTTP handlers.
type Handler struct {
	DB *gorm.DB
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{DB: db}
}

func (h *Handler) List(c *gin.Context) {
	query := h.DB.WithContext(c.Request.Context()).Model(&models.AuditLog{})

	if action := c.Query("action"); action != "" {
		query = query.Where("action_key = ?", action)
	}
	if entityType := c.Query("entity_type"); entityType != "" {
		query = query.Where("entity_type = ?", entityType)
	}
	if entityID := c.Query("entity_id"); entityID != "" {
		query = query.Where("entity_id = ?", entityID)
	}
	if actor := c.Query("actor"); actor != "" {
		if actorID, err := strconv.Atoi(actor); err == nil {
			query = query.Where("actor_user_id = ?", actorID)
		} else if actorSlug, err := uuid.Parse(actor); err == nil {
			var user models.User
			if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", actorSlug).First(&user).Error; err == nil {
				query = query.Where("actor_user_id = ?", user.ID)
			} else {
				apierrors.AbortWithError(c, http.StatusNotFound, "", "actor not found", nil)
				return
			}
		} else {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid actor", nil)
			return
		}
	}

	if startRaw := c.Query("start"); startRaw != "" {
		if parsed, err := time.Parse(time.RFC3339, startRaw); err == nil {
			query = query.Where("created_at >= ?", parsed)
		} else {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid start date", nil)
			return
		}
	}
	if endRaw := c.Query("end"); endRaw != "" {
		if parsed, err := time.Parse(time.RFC3339, endRaw); err == nil {
			query = query.Where("created_at <= ?", parsed)
		} else {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid end date", nil)
			return
		}
	}

	limit := 100
	if limitRaw := c.Query("limit"); limitRaw != "" {
		if parsed, err := strconv.Atoi(limitRaw); err == nil && parsed > 0 {
			if parsed > 500 {
				parsed = 500
			}
			limit = parsed
		}
	}

	var logs []models.AuditLog
	if err := query.Order("created_at desc").Limit(limit).Find(&logs).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list audit logs", nil)
		return
	}

	c.JSON(http.StatusOK, logs)
}
