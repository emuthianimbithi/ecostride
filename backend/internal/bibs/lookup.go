package bibs

import (
	"ecostride/backend/internal/common/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http"
	"strings"
	"time"
)

// Race desk DTOs deliberately exclude contact, medical and financial details.
type raceEvent struct {
	Slug     uuid.UUID `json:"slug"`
	URLSlug  string    `json:"url_slug"`
	Title    string    `json:"title"`
	Type     string    `json:"type"`
	Location string    `json:"location"`
	StartAt  time.Time `json:"start_at"`
}
type raceEntry struct {
	Slug            uuid.UUID  `json:"slug"`
	AthleteName     string     `json:"athlete_name"`
	Status          string     `json:"status"`
	CategoryName    string     `json:"category_name"`
	BibNumber       *int       `json:"bib_number"`
	CheckedInAt     *time.Time `json:"checked_in_at"`
	BibCollectedAt  *time.Time `json:"bib_collected_at"`
	PackCollectedAt *time.Time `json:"pack_collected_at"`
	Eligible        bool       `json:"eligible"`
}

func (h *Handler) ListRaceEvents(c *gin.Context) {
	events := []raceEvent{}
	if err := h.DB.WithContext(c.Request.Context()).Model(&models.Event{}).Select("slug, url_slug, title, type, location, start_at").Order("start_at DESC").Find(&events).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to load events"})
		return
	}
	c.JSON(http.StatusOK, events)
}
func (h *Handler) ListRaceEntries(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}
	query := h.DB.WithContext(c.Request.Context()).Table("registrations AS r").
		Joins("LEFT JOIN event_categories AS cat ON cat.id = r.category_id AND cat.deleted_at IS NULL").
		Joins("LEFT JOIN bib_assignments AS b ON b.registration_id = r.id AND b.event_id = r.event_id AND b.deleted_at IS NULL").
		Joins("LEFT JOIN checkins AS ci ON ci.registration_id = r.id AND ci.deleted_at IS NULL").
		Where("r.event_id = ? AND r.deleted_at IS NULL", event.ID)
	search := strings.TrimSpace(c.Query("search"))
	if len(search) > 200 {
		c.JSON(400, gin.H{"error": "search too long"})
		return
	}
	if search != "" {
		// Literal substring search: wildcard characters do not broaden the lookup.
		pattern := "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(search) + "%"
		query = query.Where("(r.athlete_name ILIKE ? OR r.slug::text ILIKE ? OR cat.name ILIKE ? OR b.bib_number::text = ?)", pattern, pattern, pattern, search)
	}
	entries := []raceEntry{}
	err = query.Select(`r.slug, r.athlete_name, r.status, COALESCE(cat.name, '') AS category_name, b.bib_number, ci.checked_in_at, ci.bib_collected_at, ci.pack_collected_at,
 (r.status IN ('paid','confirmed') AND (r.category_id IS NULL OR
 (cat.id IS NOT NULL AND ((cat.price_kes_minor = 0 AND COALESCE(cat.price_usd_minor,0) = 0 AND COALESCE(cat.price_eur_minor,0) = 0)
 OR EXISTS (SELECT 1 FROM payments p WHERE p.registration_id = r.id AND p.status = 'success' AND p.amount_minor > 0 AND p.deleted_at IS NULL))))) AS eligible`).Order("r.athlete_name, r.id").Limit(100).Scan(&entries).Error
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to load race entries"})
		return
	}
	c.JSON(http.StatusOK, entries)
}
