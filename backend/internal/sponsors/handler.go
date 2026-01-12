package sponsors

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/storage"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Handler exposes sponsor HTTP handlers.
type Handler struct {
	Service *Service
	Audit   *audit.Service
	DB      *gorm.DB
	Config  config.Config
	Storage storage.StorageProvider
}

func NewHandler(service *Service, auditService *audit.Service, db *gorm.DB, cfg config.Config, storageProvider storage.StorageProvider) *Handler {
	return &Handler{Service: service, Audit: auditService, DB: db, Config: cfg, Storage: storageProvider}
}

type tierRequest struct {
	Name     string `json:"name" binding:"required"`
	Priority int    `json:"priority"`
}

type sponsorRequest struct {
	TierSlug     string `json:"tier_slug" binding:"required"`
	Name         string `json:"name" binding:"required"`
	Slug         string `json:"slug" binding:"required"`
	LogoMediaID  *uint  `json:"logo_media_id"`
	Description  string `json:"description"`
	WebsiteURL   string `json:"website_url"`
	IsFeatured   bool   `json:"is_featured"`
	DisplayOrder int    `json:"display_order"`
}

type placementRequest struct {
	LocationKey string  `json:"location_key" binding:"required"`
	EventSlug   *string `json:"event_slug"`
}

type sponsorPublicItem struct {
	Slug         string  `json:"slug"`
	URLSlug      string  `json:"url_slug"`
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	WebsiteURL   string  `json:"website_url"`
	IsFeatured   bool    `json:"is_featured"`
	DisplayOrder int     `json:"display_order"`
	TierName     *string `json:"tier_name"`
	TierPriority *int    `json:"tier_priority"`
	LogoURL      *string `json:"logo_url"`
	LogoAlt      *string `json:"logo_alt"`
	LogoPath     *string `json:"logo_path"`
	Priority     *int    `json:"priority"`
}

type sponsorAdminItem struct {
	Slug         string                 `json:"slug"`
	URLSlug      string                 `json:"url_slug"`
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	WebsiteURL   string                 `json:"website_url"`
	IsFeatured   bool                   `json:"is_featured"`
	DisplayOrder int                    `json:"display_order"`
	TierSlug     string                 `json:"tier_slug"`
	TierName     string                 `json:"tier_name"`
	TierPriority int                    `json:"tier_priority"`
	LogoMediaID  *uint                  `json:"logo_media_id"`
	LogoURL      *string                `json:"logo_url"`
	LogoAlt      *string                `json:"logo_alt"`
	Placements   []sponsorPlacementItem `json:"placements"`
}

type sponsorPlacementItem struct {
	LocationKey string  `json:"location_key"`
	EventSlug   *string `json:"event_slug"`
	EventTitle  *string `json:"event_title"`
}

func (h *Handler) ListPublicSponsors(c *gin.Context) {
	query := h.DB.WithContext(c.Request.Context()).
		Table("sponsors").
		Select(`
			sponsors.slug,
			sponsors.url_slug,
			sponsors.name,
			sponsors.description,
			sponsors.website_url,
			sponsors.is_featured,
			sponsors.display_order,
			sponsor_tiers.name as tier_name,
			sponsor_tiers.priority as tier_priority,
			media.url as logo_url,
			media.path as logo_path,
			media.alt_text as logo_alt
		`).
		Joins("LEFT JOIN sponsor_tiers ON sponsor_tiers.id = sponsors.tier_id").
		Joins("LEFT JOIN media ON media.id = sponsors.logo_media_id")

	if placement := c.Query("placement"); placement != "" {
		query = query.Joins("JOIN sponsor_placements ON sponsor_placements.sponsor_id = sponsors.id").
			Where("sponsor_placements.location_key = ?", placement)

		if eventSlug := c.Query("event_slug"); eventSlug != "" {
			var event models.Event
			if err := h.DB.WithContext(c.Request.Context()).Where("url_slug = ?", eventSlug).First(&event).Error; err == nil {
				query = query.Where("sponsor_placements.event_id IS NULL OR sponsor_placements.event_id = ?", event.ID)
			}
		}
	}

	if tier := c.Query("tier"); tier != "" {
		query = query.Where("LOWER(sponsor_tiers.name) = ?", strings.ToLower(tier))
	}

	var rows []sponsorPublicItem

	if err := query.Distinct().
		Order("sponsor_tiers.priority asc, sponsors.display_order asc").
		Scan(&rows).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list sponsors", nil)
		return
	}

	items := make([]sponsorPublicItem, 0, len(rows))
	for _, row := range rows {
		item := row
		if (item.LogoURL == nil || *item.LogoURL == "") && row.LogoPath != nil && *row.LogoPath != "" {
			key := normalizeLegacyLocalPathToKey(h.Config.MediaDir, *row.LogoPath)
			value := h.Storage.GetPublicURL(c.Request.Context(), key)
			item.LogoURL = &value
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, items)
}

func normalizeLegacyLocalPathToKey(mediaDir, pathOrKey string) string {
	pathOrKey = strings.TrimSpace(pathOrKey)
	if pathOrKey == "" || strings.TrimSpace(mediaDir) == "" {
		return pathOrKey
	}

	if rel, err := filepath.Rel(mediaDir, pathOrKey); err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return filepath.ToSlash(rel)
	}

	if strings.HasPrefix(filepath.Clean(pathOrKey), filepath.Clean(mediaDir)+string(filepath.Separator)) {
		rel := strings.TrimPrefix(filepath.Clean(pathOrKey), filepath.Clean(mediaDir)+string(filepath.Separator))
		return filepath.ToSlash(rel)
	}

	// If it looks like a key already (forward slashes), keep it.
	if strings.Contains(pathOrKey, "/") && !strings.Contains(pathOrKey, string(os.PathSeparator)) {
		return pathOrKey
	}

	return filepath.ToSlash(pathOrKey)
}

func (h *Handler) RecordView(c *gin.Context) {
	sponsorSlug := c.Param("slug")
	var sponsor models.Sponsor
	if err := h.DB.WithContext(c.Request.Context()).Where("url_slug = ?", sponsorSlug).First(&sponsor).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "sponsor not found", nil)
		return
	}

	pageKey := c.Query("page")
	if pageKey == "" {
		pageKey = "SPONSOR_PAGE"
	}

	ipHash := hashIP(c.ClientIP())
	view := models.SponsorView{
		Slug:      uuid.New(),
		SponsorID: sponsor.ID,
		PageKey:   pageKey,
		ViewedAt:  time.Now(),
		IPHash:    ipHash,
	}

	if err := h.DB.WithContext(c.Request.Context()).Create(&view).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to record view", nil)
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) ListTiers(c *gin.Context) {
	tiers, err := h.Service.ListTiers(c.Request.Context())
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list tiers", nil)
		return
	}
	c.JSON(http.StatusOK, tiers)
}

func (h *Handler) CreateTier(c *gin.Context) {
	var req tierRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	tier := models.SponsorTier{
		Slug:     uuid.New(),
		Name:     req.Name,
		Priority: req.Priority,
	}

	created, err := h.Service.CreateTier(c.Request.Context(), tier)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create tier", nil)
		return
	}

	h.logAudit(c, "sponsor.tier.create", "sponsor_tier", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, created)
}

func (h *Handler) UpdateTier(c *gin.Context) {
	tierSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid tier id", nil)
		return
	}

	var tier models.SponsorTier
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", tierSlug).First(&tier).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "tier not found", nil)
		return
	}

	old := tier

	var req tierRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	tier.Name = req.Name
	tier.Priority = req.Priority

	updated, err := h.Service.UpdateTier(c.Request.Context(), tier)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update tier", nil)
		return
	}

	h.logAudit(c, "sponsor.tier.update", "sponsor_tier", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) DeleteTier(c *gin.Context) {
	tierSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid tier id", nil)
		return
	}

	var tier models.SponsorTier
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", tierSlug).First(&tier).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "tier not found", nil)
		return
	}

	if err := h.Service.DeleteTier(c.Request.Context(), tier); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete tier", nil)
		return
	}

	h.logAudit(c, "sponsor.tier.delete", "sponsor_tier", tier.Slug.String(), tier, nil)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) ListSponsors(c *gin.Context) {
	var rows []struct {
		ID           uint
		Slug         uuid.UUID
		URLSlug      string
		Name         string
		Description  string
		WebsiteURL   string
		IsFeatured   bool
		DisplayOrder int
		TierSlug     uuid.UUID
		TierName     string
		TierPriority int
		LogoMediaID  *uint
		LogoURL      *string
		LogoPath     *string
		LogoAlt      *string
	}

	if err := h.DB.WithContext(c.Request.Context()).
		Table("sponsors").
		Select(`
			sponsors.id,
			sponsors.slug,
			sponsors.url_slug,
			sponsors.name,
			sponsors.description,
			sponsors.website_url,
			sponsors.is_featured,
			sponsors.display_order,
			sponsors.logo_media_id,
			sponsor_tiers.slug as tier_slug,
			sponsor_tiers.name as tier_name,
			sponsor_tiers.priority as tier_priority,
			media.url as logo_url,
			media.path as logo_path,
			media.alt_text as logo_alt
		`).
		Joins("LEFT JOIN sponsor_tiers ON sponsor_tiers.id = sponsors.tier_id").
		Joins("LEFT JOIN media ON media.id = sponsors.logo_media_id").
		Order("sponsor_tiers.priority asc, sponsors.display_order asc").
		Scan(&rows).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list sponsors", nil)
		return
	}

	sponsorIDs := make([]uint, 0, len(rows))
	for _, row := range rows {
		sponsorIDs = append(sponsorIDs, row.ID)
	}

	placements := map[uint][]sponsorPlacementItem{}
	if len(sponsorIDs) > 0 {
		type placementRow struct {
			SponsorID   uint
			LocationKey string
			EventSlug   *string
			EventTitle  *string
		}
		var rowsPlacements []placementRow
		if err := h.DB.WithContext(c.Request.Context()).
			Table("sponsor_placements").
			Select(`
				sponsor_placements.sponsor_id,
				sponsor_placements.location_key,
				events.url_slug as event_slug,
				events.title as event_title
			`).
			Joins("LEFT JOIN events ON events.id = sponsor_placements.event_id").
			Where("sponsor_placements.sponsor_id IN ?", sponsorIDs).
			Find(&rowsPlacements).Error; err == nil {
			for _, row := range rowsPlacements {
				placements[row.SponsorID] = append(placements[row.SponsorID], sponsorPlacementItem{
					LocationKey: row.LocationKey,
					EventSlug:   row.EventSlug,
					EventTitle:  row.EventTitle,
				})
			}
		}
	}

	items := make([]sponsorAdminItem, 0, len(rows))
	for _, row := range rows {
		logoURL := row.LogoURL
		if (logoURL == nil || *logoURL == "") && row.LogoPath != nil && *row.LogoPath != "" {
			key := normalizeLegacyLocalPathToKey(h.Config.MediaDir, *row.LogoPath)
			value := h.Storage.GetPublicURL(c.Request.Context(), key)
			logoURL = &value
		}

		items = append(items, sponsorAdminItem{
			Slug:         row.Slug.String(),
			URLSlug:      row.URLSlug,
			Name:         row.Name,
			Description:  row.Description,
			WebsiteURL:   row.WebsiteURL,
			IsFeatured:   row.IsFeatured,
			DisplayOrder: row.DisplayOrder,
			TierSlug:     row.TierSlug.String(),
			TierName:     row.TierName,
			TierPriority: row.TierPriority,
			LogoMediaID:  row.LogoMediaID,
			LogoURL:      logoURL,
			LogoAlt:      row.LogoAlt,
			Placements:   placements[row.ID],
		})
	}

	c.JSON(http.StatusOK, items)
}

func (h *Handler) CreateSponsor(c *gin.Context) {
	var req sponsorRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	tierSlug, err := uuid.Parse(req.TierSlug)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid tier slug", nil)
		return
	}

	var tier models.SponsorTier
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", tierSlug).First(&tier).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "tier not found", nil)
		return
	}

	if req.LogoMediaID != nil {
		if err := h.ensureMedia(c.Request.Context(), *req.LogoMediaID); err != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "logo media not found", nil)
			return
		}
	}

	sponsor := models.Sponsor{
		Slug:         uuid.New(),
		TierID:       tier.ID,
		Name:         req.Name,
		URLSlug:      req.Slug,
		LogoMediaID:  req.LogoMediaID,
		Description:  req.Description,
		WebsiteURL:   req.WebsiteURL,
		IsFeatured:   req.IsFeatured,
		DisplayOrder: req.DisplayOrder,
	}

	created, err := h.Service.CreateSponsor(c.Request.Context(), sponsor)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create sponsor", nil)
		return
	}

	h.logAudit(c, "sponsor.create", "sponsor", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, created)
}

func (h *Handler) UpdateSponsor(c *gin.Context) {
	sponsorSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid sponsor id", nil)
		return
	}

	var sponsor models.Sponsor
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", sponsorSlug).First(&sponsor).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "sponsor not found", nil)
		return
	}

	old := sponsor

	var req sponsorRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	tierSlug, err := uuid.Parse(req.TierSlug)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid tier slug", nil)
		return
	}

	var tier models.SponsorTier
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", tierSlug).First(&tier).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "tier not found", nil)
		return
	}

	if req.LogoMediaID != nil {
		if err := h.ensureMedia(c.Request.Context(), *req.LogoMediaID); err != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "logo media not found", nil)
			return
		}
	}

	sponsor.TierID = tier.ID
	sponsor.Name = req.Name
	sponsor.URLSlug = req.Slug
	sponsor.LogoMediaID = req.LogoMediaID
	sponsor.Description = req.Description
	sponsor.WebsiteURL = req.WebsiteURL
	sponsor.IsFeatured = req.IsFeatured
	sponsor.DisplayOrder = req.DisplayOrder

	updated, err := h.Service.UpdateSponsor(c.Request.Context(), sponsor)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update sponsor", nil)
		return
	}

	h.logAudit(c, "sponsor.update", "sponsor", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) DeleteSponsor(c *gin.Context) {
	sponsorSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid sponsor id", nil)
		return
	}

	var sponsor models.Sponsor
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", sponsorSlug).First(&sponsor).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "sponsor not found", nil)
		return
	}

	if err := h.Service.DeleteSponsor(c.Request.Context(), sponsor); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete sponsor", nil)
		return
	}

	h.logAudit(c, "sponsor.delete", "sponsor", sponsor.Slug.String(), sponsor, nil)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) UpdatePlacements(c *gin.Context) {
	sponsorSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid sponsor id", nil)
		return
	}

	var sponsor models.Sponsor
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", sponsorSlug).First(&sponsor).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "sponsor not found", nil)
		return
	}

	var placements []placementRequest
	if !apierrors.BindJSON(c, &placements) {
		return
	}

	if err := h.DB.WithContext(c.Request.Context()).
		Where("sponsor_id = ?", sponsor.ID).
		Delete(&models.SponsorPlacement{}).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update placements", nil)
		return
	}

	created := make([]models.SponsorPlacement, 0, len(placements))
	for _, placement := range placements {
		var eventID *uint
		if placement.EventSlug != nil {
			var event models.Event
			if err := h.DB.WithContext(c.Request.Context()).Where("url_slug = ?", *placement.EventSlug).First(&event).Error; err == nil {
				eventID = &event.ID
			}
		}

		created = append(created, models.SponsorPlacement{
			Slug:        uuid.New(),
			SponsorID:   sponsor.ID,
			EventID:     eventID,
			LocationKey: placement.LocationKey,
		})
	}

	if len(created) > 0 {
		if err := h.DB.WithContext(c.Request.Context()).Create(&created).Error; err != nil {
			apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update placements", nil)
			return
		}
	}

	h.logAudit(c, "sponsor.placements.update", "sponsor", sponsor.Slug.String(), nil, created)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) SponsorAnalytics(c *gin.Context) {
	sponsorSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid sponsor id", nil)
		return
	}

	var sponsor models.Sponsor
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", sponsorSlug).First(&sponsor).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "sponsor not found", nil)
		return
	}

	type result struct {
		PageKey string
		Count   int64
	}

	var rows []result
	if err := h.DB.WithContext(c.Request.Context()).
		Model(&models.SponsorView{}).
		Select("page_key, COUNT(*) as count").
		Where("sponsor_id = ?", sponsor.ID).
		Group("page_key").
		Find(&rows).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to load analytics", nil)
		return
	}

	c.JSON(http.StatusOK, rows)
}

func (h *Handler) ensureMedia(ctx context.Context, mediaID uint) error {
	var media models.Media
	return h.DB.WithContext(ctx).Where("id = ?", mediaID).First(&media).Error
}

func hashIP(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
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
