package events

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/cms"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/dto"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/storage"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Handler exposes event HTTP handlers.
type Handler struct {
	Service    *Service
	CMSService *cms.Service
	Audit      *audit.Service
	Config     config.Config
	Storage    storage.StorageProvider
}

func NewHandler(service *Service, cmsService *cms.Service, auditService *audit.Service, cfg config.Config, storageProvider storage.StorageProvider) *Handler {
	return &Handler{Service: service, CMSService: cmsService, Audit: auditService, Config: cfg, Storage: storageProvider}
}

type eventRequest struct {
	Slug        string  `json:"url_slug" binding:"required"`
	Type        string  `json:"type" binding:"required"`
	Title       string  `json:"title" binding:"required"`
	Description string  `json:"description"`
	Location    string  `json:"location"`
	MapURL      string  `json:"map_url"`
	StartAt     string  `json:"start_at" binding:"required"`
	RegOpenAt   *string `json:"reg_open_at"`
	RegCloseAt  *string `json:"reg_close_at"`
	Status      string  `json:"status"`
	IsFeatured  bool    `json:"is_featured"`
	RepeatMode  string  `json:"repeat_mode"`
	RepeatCount int     `json:"repeat_count"`
	HeroMediaID *uint   `json:"hero_media_id"`
	SEOTitle    string  `json:"seo_title"`
	SEODesc     string  `json:"seo_desc"`
}

func parseRequiredTime(raw string) (time.Time, bool) {
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}

func parseOptionalTime(raw *string) (*time.Time, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, true
	}
	parsed, err := time.Parse(time.RFC3339, *raw)
	if err != nil {
		return nil, false
	}
	return &parsed, true
}

func normalizeRepeatMode(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "monthly":
		return "monthly"
	case "yearly":
		return "yearly"
	default:
		return "none"
	}
}

func occurrenceTitle(base string, startAt time.Time) string {
	return fmt.Sprintf("%s (%s)", base, startAt.Format("02 Jan 2006"))
}

func occurrenceSlug(base string, startAt time.Time) string {
	return fmt.Sprintf("%s-%s", base, startAt.Format("2006-01-02"))
}

type categoryRequest struct {
	Name          string          `json:"name" binding:"required"`
	PriceKESMinor int             `json:"price_kes_minor"`
	PriceUSDMinor *int            `json:"price_usd_minor"`
	PriceEURMinor *int            `json:"price_eur_minor"`
	Capacity      *int            `json:"capacity"`
	Rules         json.RawMessage `json:"rules"`
	BibPrefix     string          `json:"bib_prefix"`
	BibRangeStart *int            `json:"bib_range_start"`
	BibRangeEnd   *int            `json:"bib_range_end"`
	BibNext       *int            `json:"bib_next"`
}

type formFieldRequest struct {
	Key      string          `json:"key" binding:"required"`
	Label    string          `json:"label" binding:"required"`
	Type     string          `json:"type" binding:"required"`
	Required bool            `json:"required"`
	Options  json.RawMessage `json:"options"`
	Order    int             `json:"order"`
}

type eventMediaRequest struct {
	MediaIDs []uint `json:"media_ids"`
}

type eventMediaItem struct {
	MediaID   uint   `json:"media_id"`
	SortOrder int    `json:"sort_order"`
	URL       string `json:"url"`
	Path      string `json:"path"`
	Mime      string `json:"mime"`
	AltText   string `json:"alt_text"`
	Type      string `json:"type"`
}

func (h *Handler) ListPublicEvents(c *gin.Context) {
	// get search params if any (e.g., date range, location) - omitted for brevity
	// search
	search := c.Query("search")
	eventtype := c.Query("type")
	events, err := h.Service.ListEvents(c.Request.Context(), "published", search, eventtype)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list events", nil)
		return
	}
	c.JSON(http.StatusOK, dto.EventsFromModels(events))
}

func (h *Handler) GetPublicEvent(c *gin.Context) {
	event, err := h.Service.GetEventBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil || event.Status != "published" {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return
	}
	c.JSON(http.StatusOK, dto.EventFromModel(event))
}

func (h *Handler) ListPublicFormFields(c *gin.Context) {
	event, err := h.Service.GetEventBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil || event.Status != "published" {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return
	}

	fields, err := h.Service.ListFormFields(c.Request.Context(), event.ID)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list form fields", nil)
		return
	}

	c.JSON(http.StatusOK, dto.EventFormFieldsFromModels(fields))
}

func (h *Handler) ListPublicEventMedia(c *gin.Context) {
	event, err := h.Service.GetEventBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil || event.Status != "published" {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return
	}
	h.respondEventMedia(c, event.ID)
}

func (h *Handler) ListPublicCategories(c *gin.Context) {
	event, err := h.Service.GetEventBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil || event.Status != "published" {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return
	}

	categories, err := h.Service.ListCategories(c.Request.Context(), event.ID)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list categories", nil)
		return
	}

	c.JSON(http.StatusOK, dto.EventCategoriesFromModels(categories))
}

func (h *Handler) GetCurrentWaiver(c *gin.Context) {
	event, err := h.Service.GetEventBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return
	}

	waiver, err := h.CMSService.GetCurrentWaiver(c.Request.Context(), "EVENT", &event.ID)
	if err != nil {
		waiver, err = h.CMSService.GetCurrentWaiver(c.Request.Context(), "GLOBAL", nil)
		if err != nil {
			apierrors.AbortWithError(c, http.StatusNotFound, "", "waiver not found", nil)
			return
		}
	}

	c.JSON(http.StatusOK, dto.WaiverFromModel(waiver))
}

func (h *Handler) ListEvents(c *gin.Context) {
	status := c.Query("status")
	search := c.Query("search")
	evenType := c.Query("type")
	events, err := h.Service.ListEvents(c.Request.Context(), status, search, evenType)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list events", nil)
		return
	}
	c.JSON(http.StatusOK, dto.EventsFromModels(events))
}

func (h *Handler) GetEvent(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}
	c.JSON(http.StatusOK, dto.EventFromModel(event))
}

func (h *Handler) CreateEvent(c *gin.Context) {
	var req eventRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	status := req.Status
	if status == "" {
		status = "draft"
	}

	startAt, ok := parseRequiredTime(req.StartAt)
	if !ok {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid start_at", nil)
		return
	}
	regOpenAt, ok := parseOptionalTime(req.RegOpenAt)
	if !ok {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid reg_open_at", nil)
		return
	}
	regCloseAt, ok := parseOptionalTime(req.RegCloseAt)
	if !ok {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid reg_close_at", nil)
		return
	}
	repeatMode := normalizeRepeatMode(req.RepeatMode)
	repeatCount := req.RepeatCount
	if repeatCount < 1 {
		repeatCount = 1
	}

	event := models.Event{
		Slug:        uuid.New(),
		URLSlug:     req.Slug,
		Type:        req.Type,
		Title:       req.Title,
		Description: req.Description,
		Location:    req.Location,
		MapURL:      req.MapURL,
		StartAt:     startAt,
		RegOpenAt:   regOpenAt,
		RegCloseAt:  regCloseAt,
		Status:      status,
		IsFeatured:  req.IsFeatured,
		HeroMediaID: req.HeroMediaID,
		SEOTitle:    req.SEOTitle,
		SEODesc:     req.SEODesc,
		CreatedBy:   h.getActorID(c),
	}

	var created models.Event
	err := h.Service.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if event.IsFeatured {
			if err := tx.Model(&models.Event{}).Where("is_featured = ?", true).Update("is_featured", false).Error; err != nil {
				return err
			}
		}

		if err := tx.Create(&event).Error; err != nil {
			return err
		}
		created = event

		if repeatMode == "none" || repeatCount <= 1 {
			return nil
		}

		for i := 1; i < repeatCount; i++ {
			occurrenceStart := startAt
			occurrenceRegOpen := regOpenAt
			occurrenceRegClose := regCloseAt
			if repeatMode == "monthly" {
				occurrenceStart = occurrenceStart.AddDate(0, i, 0)
				if occurrenceRegOpen != nil {
					next := occurrenceRegOpen.AddDate(0, i, 0)
					occurrenceRegOpen = &next
				}
				if occurrenceRegClose != nil {
					next := occurrenceRegClose.AddDate(0, i, 0)
					occurrenceRegClose = &next
				}
			} else {
				occurrenceStart = occurrenceStart.AddDate(i, 0, 0)
				if occurrenceRegOpen != nil {
					next := occurrenceRegOpen.AddDate(i, 0, 0)
					occurrenceRegOpen = &next
				}
				if occurrenceRegClose != nil {
					next := occurrenceRegClose.AddDate(i, 0, 0)
					occurrenceRegClose = &next
				}
			}

			clone := models.Event{
				Slug:        uuid.New(),
				URLSlug:     occurrenceSlug(req.Slug, occurrenceStart),
				Type:        req.Type,
				Title:       occurrenceTitle(req.Title, occurrenceStart),
				Description: req.Description,
				Location:    req.Location,
				MapURL:      req.MapURL,
				StartAt:     occurrenceStart,
				RegOpenAt:   occurrenceRegOpen,
				RegCloseAt:  occurrenceRegClose,
				Status:      status,
				IsFeatured:  false,
				HeroMediaID: req.HeroMediaID,
				SEOTitle:    req.SEOTitle,
				SEODesc:     req.SEODesc,
				CreatedBy:   h.getActorID(c),
			}
			if err := tx.Create(&clone).Error; err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create event", nil)
		return
	}

	h.logAudit(c, "event.create", "event", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, dto.EventFromModel(created))
}

func (h *Handler) UpdateEvent(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid event id", nil)
		return
	}

	var event models.Event
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&event).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return
	}

	old := event

	var req eventRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	startAt, ok := parseRequiredTime(req.StartAt)
	if !ok {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid start_at", nil)
		return
	}
	regOpenAt, ok := parseOptionalTime(req.RegOpenAt)
	if !ok {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid reg_open_at", nil)
		return
	}
	regCloseAt, ok := parseOptionalTime(req.RegCloseAt)
	if !ok {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid reg_close_at", nil)
		return
	}

	event.URLSlug = req.Slug
	event.Type = req.Type
	event.Title = req.Title
	event.Description = req.Description
	event.Location = req.Location
	event.MapURL = req.MapURL
	event.StartAt = startAt
	event.RegOpenAt = regOpenAt
	event.RegCloseAt = regCloseAt
	event.Status = req.Status
	event.IsFeatured = req.IsFeatured
	event.HeroMediaID = req.HeroMediaID
	event.SEOTitle = req.SEOTitle
	event.SEODesc = req.SEODesc

	var updated models.Event
	err = h.Service.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if event.IsFeatured {
			if err := tx.Model(&models.Event{}).Where("slug <> ?", event.Slug).Where("is_featured = ?", true).Update("is_featured", false).Error; err != nil {
				return err
			}
		}
		if err := tx.Save(&event).Error; err != nil {
			return err
		}
		updated = event
		return nil
	})
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update event", nil)
		return
	}

	h.logAudit(c, "event.update", "event", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, dto.EventFromModel(updated))
}

func (h *Handler) DeleteEvent(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid event id", nil)
		return
	}

	var event models.Event
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&event).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return
	}

	if err := h.Service.DeleteEvent(c.Request.Context(), event); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete event", nil)
		return
	}

	h.logAudit(c, "event.delete", "event", event.Slug.String(), event, nil)

	c.JSON(http.StatusOK, dto.SuccessResponse{Status: "ok"})
}

func (h *Handler) PublishEvent(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid event id", nil)
		return
	}

	var event models.Event
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&event).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return
	}

	old := event
	event.Status = "published"

	updated, err := h.Service.UpdateEvent(c.Request.Context(), event)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to publish event", nil)
		return
	}

	h.logAudit(c, "event.publish", "event", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, dto.EventFromModel(updated))
}

func (h *Handler) ListCategories(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	categories, err := h.Service.ListCategories(c.Request.Context(), event.ID)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list categories", nil)
		return
	}

	c.JSON(http.StatusOK, dto.EventCategoriesFromModels(categories))
}

func (h *Handler) CreateCategory(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	var req categoryRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	category := models.EventCategory{
		Slug:          uuid.New(),
		EventID:       event.ID,
		Name:          req.Name,
		PriceKESMinor: req.PriceKESMinor,
		PriceUSDMinor: req.PriceUSDMinor,
		PriceEURMinor: req.PriceEURMinor,
		Capacity:      req.Capacity,
		Rules:         datatypes.JSON(req.Rules),
		BibPrefix:     req.BibPrefix,
		BibRangeStart: req.BibRangeStart,
		BibRangeEnd:   req.BibRangeEnd,
		BibNext:       req.BibNext,
	}

	created, err := h.Service.CreateCategory(c.Request.Context(), category)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create category", nil)
		return
	}

	h.logAudit(c, "event.category.create", "event_category", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, dto.EventCategoryFromModel(created))
}

func (h *Handler) UpdateCategory(c *gin.Context) {
	categorySlug, err := uuid.Parse(c.Param("categoryId"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid category id", nil)
		return
	}

	var category models.EventCategory
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", categorySlug).First(&category).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "category not found", nil)
		return
	}

	old := category

	var req categoryRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	category.Name = req.Name
	category.PriceKESMinor = req.PriceKESMinor
	category.PriceUSDMinor = req.PriceUSDMinor
	category.PriceEURMinor = req.PriceEURMinor
	category.Capacity = req.Capacity
	category.Rules = datatypes.JSON(req.Rules)
	category.BibPrefix = req.BibPrefix
	category.BibRangeStart = req.BibRangeStart
	category.BibRangeEnd = req.BibRangeEnd
	category.BibNext = req.BibNext

	updated, err := h.Service.UpdateCategory(c.Request.Context(), category)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update category", nil)
		return
	}

	h.logAudit(c, "event.category.update", "event_category", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, dto.EventCategoryFromModel(updated))
}

func (h *Handler) DeleteCategory(c *gin.Context) {
	categorySlug, err := uuid.Parse(c.Param("categoryId"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid category id", nil)
		return
	}

	var category models.EventCategory
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", categorySlug).First(&category).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "category not found", nil)
		return
	}

	if err := h.Service.DeleteCategory(c.Request.Context(), category); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete category", nil)
		return
	}

	h.logAudit(c, "event.category.delete", "event_category", category.Slug.String(), category, nil)

	c.JSON(http.StatusOK, dto.SuccessResponse{Status: "ok"})
}

func (h *Handler) ListFormFields(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	fields, err := h.Service.ListFormFields(c.Request.Context(), event.ID)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list form fields", nil)
		return
	}

	c.JSON(http.StatusOK, dto.EventFormFieldsFromModels(fields))
}

func (h *Handler) ListEventMedia(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}
	h.respondEventMedia(c, event.ID)
}

func (h *Handler) SetEventMedia(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	var req eventMediaRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	if err := h.Service.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if len(req.MediaIDs) > 0 {
			var count int64
			if err := tx.Model(&models.Media{}).Where("id IN ?", req.MediaIDs).Count(&count).Error; err != nil {
				return err
			}
			if count != int64(len(req.MediaIDs)) {
				apierrors.AbortWithError(c, http.StatusBadRequest, "", "one or more media_ids do not exist", nil)
				return fmt.Errorf("invalid media ids")
			}
		}

		if err := tx.Unscoped().Where("event_id = ?", event.ID).Delete(&models.EventMedia{}).Error; err != nil {
			return err
		}

		for i, mediaID := range req.MediaIDs {
			link := models.EventMedia{
				EventID:   event.ID,
				MediaID:   mediaID,
				SortOrder: i + 1,
			}
			if err := tx.Create(&link).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		if c.IsAborted() {
			return
		}
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to set event media", nil)
		return
	}

	h.logAudit(c, "event.media.set", "event", event.Slug.String(), nil, gin.H{"media_ids": req.MediaIDs})
	h.respondEventMedia(c, event.ID)
}

func (h *Handler) CreateFormField(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	var req formFieldRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	field := models.EventFormField{
		Slug:     uuid.New(),
		EventID:  event.ID,
		Key:      req.Key,
		Label:    req.Label,
		Type:     req.Type,
		Required: req.Required,
		Options:  datatypes.JSON(req.Options),
		Order:    req.Order,
	}

	created, err := h.Service.CreateFormField(c.Request.Context(), field)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create form field", nil)
		return
	}

	h.logAudit(c, "event.formfield.create", "event_form_field", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, dto.EventFormFieldFromModel(created))
}

func (h *Handler) UpdateFormField(c *gin.Context) {
	fieldSlug, err := uuid.Parse(c.Param("fieldId"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid field id", nil)
		return
	}

	var field models.EventFormField
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", fieldSlug).First(&field).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "field not found", nil)
		return
	}

	old := field

	var req formFieldRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	field.Key = req.Key
	field.Label = req.Label
	field.Type = req.Type
	field.Required = req.Required
	field.Options = datatypes.JSON(req.Options)
	field.Order = req.Order

	updated, err := h.Service.UpdateFormField(c.Request.Context(), field)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update form field", nil)
		return
	}

	h.logAudit(c, "event.formfield.update", "event_form_field", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, dto.EventFormFieldFromModel(updated))
}

func (h *Handler) DeleteFormField(c *gin.Context) {
	fieldSlug, err := uuid.Parse(c.Param("fieldId"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid field id", nil)
		return
	}

	var field models.EventFormField
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", fieldSlug).First(&field).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "field not found", nil)
		return
	}

	if err := h.Service.DeleteFormField(c.Request.Context(), field); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete form field", nil)
		return
	}

	h.logAudit(c, "event.formfield.delete", "event_form_field", field.Slug.String(), field, nil)

	c.JSON(http.StatusOK, dto.SuccessResponse{Status: "ok"})
}

func (h *Handler) getEventBySlugParam(c *gin.Context) (models.Event, error) {
	eventSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid event id", nil)
		return models.Event{}, err
	}

	var event models.Event
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", eventSlug).First(&event).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return models.Event{}, err
	}

	return event, nil
}

func (h *Handler) respondEventMedia(c *gin.Context, eventID uint) {
	var media []eventMediaItem
	if err := h.Service.DB.WithContext(c.Request.Context()).
		Table("event_media").
		Select("event_media.media_id, event_media.sort_order, media.url, media.path, media.mime, media.alt_text, media.type").
		Joins("JOIN media ON media.id = event_media.media_id").
		Where("event_media.event_id = ?", eventID).
		Order("event_media.sort_order asc").
		Scan(&media).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to load event media", nil)
		return
	}

	for i := range media {
		m := models.Media{URL: media[i].URL, Path: media[i].Path}
		m = resolveMediaURL(c.Request.Context(), h.Storage, h.Config.MediaDir, m)
		media[i].URL = m.URL
	}

	c.JSON(http.StatusOK, media)
}

func resolveMediaURL(ctx context.Context, provider storage.StorageProvider, mediaDir string, m models.Media) models.Media {
	if strings.TrimSpace(m.URL) != "" || strings.TrimSpace(m.Path) == "" || provider == nil {
		return m
	}

	objectKey := m.Path
	if _, ok := provider.(*storage.LocalProvider); ok {
		objectKey = normalizeLegacyLocalPathToKey(mediaDir, objectKey)
	}

	m.URL = provider.GetPublicURL(ctx, objectKey)
	return m
}

func normalizeLegacyLocalPathToKey(mediaDir, pathOrKey string) string {
	pathOrKey = strings.TrimSpace(pathOrKey)
	if pathOrKey == "" || strings.TrimSpace(mediaDir) == "" {
		return pathOrKey
	}

	if strings.Contains(pathOrKey, "/") && !strings.Contains(pathOrKey, string(os.PathSeparator)) {
		return pathOrKey
	}

	if rel, err := filepath.Rel(mediaDir, pathOrKey); err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return filepath.ToSlash(rel)
	}

	if strings.HasPrefix(filepath.Clean(pathOrKey), filepath.Clean(mediaDir)+string(filepath.Separator)) {
		rel := strings.TrimPrefix(filepath.Clean(pathOrKey), filepath.Clean(mediaDir)+string(filepath.Separator))
		return filepath.ToSlash(rel)
	}

	return filepath.ToSlash(pathOrKey)
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
