package registrations

import (
	"ecostride/backend/internal/tickets"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *Handler) DownloadCalendar(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid registration ID"})
		return
	}
	reg, err := h.Service.GetRegistrationBySlug(c.Request.Context(), slug.String())
	if err != nil {
		c.JSON(404, gin.H{"error": "registration not found"})
		return
	}
	ticket, err := tickets.Load(c.Request.Context(), h.DB, reg.ID)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to load event"})
		return
	}
	if !ticket.Eligible {
		c.JSON(409, gin.H{"error": "calendar requires a confirmed eligible entry"})
		return
	}
	calendar := tickets.Calendar(ticket, h.Config.BaseURL)
	if len(calendar) == 0 {
		c.JSON(409, gin.H{"error": "event date has not been set"})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="race-day.ics"`)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(200, "text/calendar; charset=utf-8", calendar)
}
