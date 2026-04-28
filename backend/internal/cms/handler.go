package cms

import (
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
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
	"gorm.io/datatypes"
)

// Handler exposes CMS HTTP handlers.
type Handler struct {
	Service *Service
	Audit   *audit.Service
	Config  config.Config
	Storage storage.StorageProvider
}

func NewHandler(service *Service, auditService *audit.Service, cfg config.Config, storageProvider storage.StorageProvider) *Handler {
	return &Handler{Service: service, Audit: auditService, Config: cfg, Storage: storageProvider}
}

type pageRequest struct {
	Slug      string          `json:"url_slug"`
	Title     string          `json:"title" binding:"required"`
	Status    string          `json:"status"`
	Blocks    json.RawMessage `json:"blocks"`
	SEOTitle  string          `json:"seo_title"`
	SEODesc   string          `json:"seo_desc"`
	OgImageID *uint           `json:"og_image_media_id"`
}

type postRequest struct {
	Slug            string          `json:"url_slug"`
	Title           string          `json:"title" binding:"required"`
	Content         json.RawMessage `json:"content"`
	Excerpt         string          `json:"excerpt"`
	FeaturedImageID *uint           `json:"featured_image_media_id"`
	HeroStyleID     *string         `json:"hero_style_id"`
	HeroShowTitle   *bool           `json:"hero_show_title"`
	Status          string          `json:"status"`
	PublishedAt     *time.Time      `json:"published_at"`
}

type mediaRequest struct {
	Type    string `json:"type" binding:"required"`
	Path    string `json:"path"`
	URL     string `json:"url"`
	Mime    string `json:"mime"`
	Size    int64  `json:"size"`
	AltText string `json:"alt_text"`
}

type heroStyleRequest struct {
	Name           string          `json:"name" binding:"required"`
	Key            string          `json:"key" binding:"required"`
	Description    string          `json:"description"`
	LayoutType     string          `json:"layout_type" binding:"required"`
	AspectRatio    string          `json:"aspect_ratio" binding:"required"`
	Overlay        json.RawMessage `json:"overlay"`
	FocalPoint     json.RawMessage `json:"focal_point"`
	TextPlacement  string          `json:"text_placement"`
	PaddingVariant string          `json:"padding_variant"`
	IsActive       *bool           `json:"is_active"`
}

type defaultHeroStyleRequest struct {
	HeroStyleID string `json:"hero_style_id" binding:"required"`
}

type waiverRequest struct {
	Scope       string     `json:"scope" binding:"required"`
	EventID     *uint      `json:"event_id"`
	Version     int        `json:"version" binding:"required"`
	Title       string     `json:"title" binding:"required"`
	Content     string     `json:"content" binding:"required"`
	EffectiveAt *time.Time `json:"effective_at"`
	IsCurrent   bool       `json:"is_current"`
}

type galleryMediaItem struct {
	SortOrder int    `json:"sort_order"`
	URL       string `json:"url"`
	Path      string `json:"path"`
	Mime      string `json:"mime"`
	AltText   string `json:"alt_text"`
	Type      string `json:"type"`
}

func (h *Handler) ListPages(c *gin.Context) {
	status := c.Query("status")
	pages, err := h.Service.ListPages(c.Request.Context(), status)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list pages", nil)
		return
	}
	c.JSON(http.StatusOK, pages)
}

func (h *Handler) GetPublishedPage(c *gin.Context) {
	page, err := h.Service.GetPublishedPageBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "page not found", nil)
		return
	}
	c.JSON(http.StatusOK, page)
}

func (h *Handler) CreatePage(c *gin.Context) {
	var req pageRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	status := req.Status
	if status == "" {
		status = "draft"
	}

	page := models.Page{
		Slug: uuid.New(),
		URLSlug: func() string {
			if strings.TrimSpace(req.Slug) == "" {
				return strings.ToLower(strings.ReplaceAll(req.Title, " ", "-"))
			}
			return req.Slug
		}(),
		Title:          req.Title,
		Status:         status,
		Blocks:         datatypes.JSON(req.Blocks),
		SEOTitle:       req.SEOTitle,
		SEODesc:        req.SEODesc,
		OgImageMediaID: req.OgImageID,
	}

	created, err := h.Service.CreatePage(c.Request.Context(), page)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create page", nil)
		return
	}

	h.logAudit(c, "cms.page.create", "page", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, created)
}

func (h *Handler) UpdatePage(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid page id", nil)
		return
	}

	var page models.Page
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&page).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "page not found", nil)
		return
	}

	old := page

	var req pageRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	page.URLSlug = func() string {
		if strings.TrimSpace(req.Slug) == "" {
			return strings.ToLower(strings.ReplaceAll(req.Title, " ", "-"))
		}
		return req.Slug
	}()
	page.Title = req.Title
	page.Status = req.Status
	page.Blocks = datatypes.JSON(req.Blocks)
	page.SEOTitle = req.SEOTitle
	page.SEODesc = req.SEODesc
	page.OgImageMediaID = req.OgImageID

	updated, err := h.Service.UpdatePage(c.Request.Context(), page)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update page", nil)
		return
	}

	h.logAudit(c, "cms.page.update", "page", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) DeletePage(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid page id", nil)
		return
	}

	var page models.Page
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&page).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "page not found", nil)
		return
	}

	if err := h.Service.DeletePage(c.Request.Context(), page); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete page", nil)
		return
	}

	h.logAudit(c, "cms.page.delete", "page", page.Slug.String(), page, nil)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) PublishPage(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid page id", nil)
		return
	}

	var page models.Page
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&page).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "page not found", nil)
		return
	}

	old := page
	page.Status = "published"
	now := time.Now()
	page.PublishedAt = &now

	updated, err := h.Service.UpdatePage(c.Request.Context(), page)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to publish page", nil)
		return
	}

	h.logAudit(c, "cms.page.publish", "page", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) ListPosts(c *gin.Context) {
	status := c.Query("status")
	posts, err := h.Service.ListPosts(c.Request.Context(), status)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list posts", nil)
		return
	}
	out := make([]PostDTO, 0, len(posts))
	for _, post := range posts {
		dto, _ := buildPostDTO(c.Request.Context(), h.Service.DB, h.Storage, h.Config.MediaDir, post)
		out = append(out, dto)
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) ListPublicPosts(c *gin.Context) {
	posts, err := h.Service.ListPosts(c.Request.Context(), "published")
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list posts", nil)
		return
	}
	out := make([]PostDTO, 0, len(posts))
	for _, post := range posts {
		dto, _ := buildPostDTO(c.Request.Context(), h.Service.DB, h.Storage, h.Config.MediaDir, post)
		out = append(out, dto)
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) GetPublishedPost(c *gin.Context) {
	post, err := h.Service.GetPublishedPostBySlug(c.Request.Context(), c.Param("slug"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "post not found", nil)
		return
	}
	dto, _ := buildPostDTO(c.Request.Context(), h.Service.DB, h.Storage, h.Config.MediaDir, post)
	if dto.FeaturedImageMediaID != nil && dto.HeroStyleID == nil {
		if def, _ := h.Service.GetDefaultHeroStyle(c.Request.Context()); def != nil {
			slug := def.Slug.String()
			dto.HeroStyleID = &slug
			dto.HeroStyle = &HeroStyleDTO{
				ID:             slug,
				Name:           def.Name,
				Key:            def.Key,
				Description:    def.Description,
				LayoutType:     def.LayoutType,
				AspectRatio:    def.AspectRatio,
				Overlay:        json.RawMessage(def.Overlay),
				FocalPoint:     json.RawMessage(def.FocalPoint),
				TextPlacement:  def.TextPlacement,
				PaddingVariant: def.PaddingVariant,
				IsActive:       def.IsActive,
			}
		}
	}
	c.JSON(http.StatusOK, dto)
}

func (h *Handler) CreatePost(c *gin.Context) {
	var req postRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	status := req.Status
	if status == "" {
		status = "draft"
	}

	post := models.Post{
		Slug:                 uuid.New(),
		URLSlug:              req.Slug,
		Title:                req.Title,
		Content:              datatypes.JSON(req.Content),
		Excerpt:              req.Excerpt,
		FeaturedImageMediaID: req.FeaturedImageID,
		HeroShowTitle:        true,
		Status:               status,
		PublishedAt:          req.PublishedAt,
		AuthorUserID:         h.getActorID(c),
	}

	if req.HeroShowTitle != nil {
		post.HeroShowTitle = *req.HeroShowTitle
	}
	if req.HeroStyleID != nil && *req.HeroStyleID != "" {
		heroSlug, parseErr := uuid.Parse(*req.HeroStyleID)
		if parseErr != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid hero_style_id", nil)
			return
		}
		style, err := h.Service.FindHeroStyleBySlug(c.Request.Context(), heroSlug)
		if err != nil || !style.IsActive {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "hero style not found", nil)
			return
		}
		post.HeroStyleID = &style.ID
	}

	created, err := h.Service.CreatePost(c.Request.Context(), post)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create post", nil)
		return
	}

	h.logAudit(c, "cms.post.create", "post", created.Slug.String(), nil, created)

	dto, _ := buildPostDTO(c.Request.Context(), h.Service.DB, h.Storage, h.Config.MediaDir, created)
	c.JSON(http.StatusCreated, dto)
}

func (h *Handler) UpdatePost(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid post id", nil)
		return
	}

	var post models.Post
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&post).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "post not found", nil)
		return
	}

	old := post

	var req postRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	post.URLSlug = req.Slug
	post.Title = req.Title
	post.Content = datatypes.JSON(req.Content)
	post.Excerpt = req.Excerpt
	post.FeaturedImageMediaID = req.FeaturedImageID
	post.Status = req.Status
	post.PublishedAt = req.PublishedAt
	if req.HeroShowTitle != nil {
		post.HeroShowTitle = *req.HeroShowTitle
	}
	if req.HeroStyleID == nil || *req.HeroStyleID == "" {
		post.HeroStyleID = nil
	} else {
		heroSlug, parseErr := uuid.Parse(*req.HeroStyleID)
		if parseErr != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid hero_style_id", nil)
			return
		}
		style, err := h.Service.FindHeroStyleBySlug(c.Request.Context(), heroSlug)
		if err != nil || !style.IsActive {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "hero style not found", nil)
			return
		}
		post.HeroStyleID = &style.ID
	}

	updated, err := h.Service.UpdatePost(c.Request.Context(), post)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update post", nil)
		return
	}

	h.logAudit(c, "cms.post.update", "post", updated.Slug.String(), old, updated)

	dto, _ := buildPostDTO(c.Request.Context(), h.Service.DB, h.Storage, h.Config.MediaDir, updated)
	c.JSON(http.StatusOK, dto)
}

func (h *Handler) DeletePost(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid post id", nil)
		return
	}

	var post models.Post
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&post).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "post not found", nil)
		return
	}

	if err := h.Service.DeletePost(c.Request.Context(), post); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete post", nil)
		return
	}

	h.logAudit(c, "cms.post.delete", "post", post.Slug.String(), post, nil)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) PublishPost(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid post id", nil)
		return
	}

	var post models.Post
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&post).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "post not found", nil)
		return
	}

	old := post
	post.Status = "published"
	now := time.Now()
	post.PublishedAt = &now

	updated, err := h.Service.UpdatePost(c.Request.Context(), post)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to publish post", nil)
		return
	}

	h.logAudit(c, "cms.post.publish", "post", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) ListMedia(c *gin.Context) {
	media, err := h.Service.ListMedia(c.Request.Context())
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list media", nil)
		return
	}
	for i := range media {
		media[i] = withResolvedMediaURL(c.Request.Context(), h.Storage, h.Config.MediaDir, media[i])
	}
	c.JSON(http.StatusOK, media)
}

func (h *Handler) ListHeroStyles(c *gin.Context) {
	activeOnly := c.Query("active") == "true"
	if strings.HasPrefix(c.FullPath(), "/api/v1/public/") {
		activeOnly = true
	}
	styles, err := h.Service.ListHeroStyles(c.Request.Context(), activeOnly)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list hero styles", nil)
		return
	}
	c.JSON(http.StatusOK, styles)
}

func (h *Handler) CreateHeroStyle(c *gin.Context) {
	var req heroStyleRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}
	if err := validateHeroStyleRequest(req); err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", err.Error(), nil)
		return
	}

	style := models.HeroStyle{
		Slug:           uuid.New(),
		Name:           strings.TrimSpace(req.Name),
		Key:            strings.TrimSpace(req.Key),
		Description:    strings.TrimSpace(req.Description),
		LayoutType:     req.LayoutType,
		AspectRatio:    req.AspectRatio,
		Overlay:        datatypes.JSON(req.Overlay),
		FocalPoint:     datatypes.JSON(req.FocalPoint),
		TextPlacement:  req.TextPlacement,
		PaddingVariant: req.PaddingVariant,
		IsActive:       true,
	}
	if req.IsActive != nil {
		style.IsActive = *req.IsActive
	}

	created, err := h.Service.CreateHeroStyle(c.Request.Context(), style)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create hero style", nil)
		return
	}
	c.JSON(http.StatusCreated, created)
}

func (h *Handler) UpdateHeroStyle(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid hero style id", nil)
		return
	}

	style, err := h.Service.FindHeroStyleBySlug(c.Request.Context(), slug)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "hero style not found", nil)
		return
	}

	var req heroStyleRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}
	if err := validateHeroStyleRequest(req); err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", err.Error(), nil)
		return
	}

	style.Name = strings.TrimSpace(req.Name)
	style.Key = strings.TrimSpace(req.Key)
	style.Description = strings.TrimSpace(req.Description)
	style.LayoutType = req.LayoutType
	style.AspectRatio = req.AspectRatio
	style.Overlay = datatypes.JSON(req.Overlay)
	style.FocalPoint = datatypes.JSON(req.FocalPoint)
	style.TextPlacement = req.TextPlacement
	style.PaddingVariant = req.PaddingVariant
	if req.IsActive != nil {
		style.IsActive = *req.IsActive
	}

	updated, err := h.Service.UpdateHeroStyle(c.Request.Context(), style)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update hero style", nil)
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *Handler) DisableHeroStyle(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid hero style id", nil)
		return
	}

	style, err := h.Service.FindHeroStyleBySlug(c.Request.Context(), slug)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "hero style not found", nil)
		return
	}

	updated, err := h.Service.DisableHeroStyle(c.Request.Context(), style)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to disable hero style", nil)
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *Handler) GetDefaultHeroStyle(c *gin.Context) {
	style, err := h.Service.GetDefaultHeroStyle(c.Request.Context())
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to load default hero style", nil)
		return
	}
	if style == nil {
		c.JSON(http.StatusOK, gin.H{"hero_style_id": ""})
		return
	}
	c.JSON(http.StatusOK, gin.H{"hero_style_id": style.Slug.String()})
}

func (h *Handler) SetDefaultHeroStyle(c *gin.Context) {
	var req defaultHeroStyleRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}
	slug, err := uuid.Parse(req.HeroStyleID)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid hero_style_id", nil)
		return
	}
	style, err := h.Service.FindHeroStyleBySlug(c.Request.Context(), slug)
	if err != nil || !style.IsActive {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "hero style not found", nil)
		return
	}
	if err := h.Service.SetDefaultHeroStyle(c.Request.Context(), style.ID); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to save default hero style", nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"hero_style_id": style.Slug.String()})
}

func (h *Handler) UploadMedia(c *gin.Context) {
	if strings.HasPrefix(c.ContentType(), "multipart/") {
		media, err := h.handleMediaUpload(c)
		if err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, errUploadFailed) {
				status = http.StatusInternalServerError
			}
			apierrors.AbortWithError(c, status, "", err.Error(), nil)
			return
		}

		created, err := h.Service.CreateMedia(c.Request.Context(), media)
		if err != nil {
			apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create media", nil)
			return
		}

		h.logAudit(c, "cms.media.create", "media", created.Slug.String(), nil, created)
		c.JSON(http.StatusCreated, created)
		return
	}

	var req mediaRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	media := models.Media{
		Slug:      uuid.New(),
		Type:      req.Type,
		Path:      req.Path,
		URL:       req.URL,
		Mime:      req.Mime,
		Size:      req.Size,
		AltText:   req.AltText,
		CreatedBy: h.getActorID(c),
	}

	created, err := h.Service.CreateMedia(c.Request.Context(), media)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create media", nil)
		return
	}

	h.logAudit(c, "cms.media.create", "media", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, created)
}

var errUploadFailed = errors.New("upload failed")

func (h *Handler) handleMediaUpload(c *gin.Context) (models.Media, error) {
	file, err := c.FormFile("file")
	if err != nil {
		return models.Media{}, errors.New("file required")
	}

	if file.Size <= 0 {
		return models.Media{}, errors.New("empty file")
	}

	maxBytes := int64(h.Config.MaxUploadMB) * 1024 * 1024
	if maxBytes <= 0 {
		maxBytes = 10 * 1024 * 1024
	}
	if file.Size > maxBytes {
		return models.Media{}, errors.New("file too large")
	}

	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" {
		return models.Media{}, errors.New("missing content type")
	}
	if !isAllowedMediaMime(mimeType) {
		return models.Media{}, errors.New("unsupported file type")
	}

	src, err := file.Open()
	if err != nil {
		return models.Media{}, errUploadFailed
	}
	defer func(src multipart.File) {
		err := src.Close()
		if err != nil {
			return
		}
	}(src)

	obj, err := h.Storage.Save(c.Request.Context(), io.LimitReader(src, maxBytes+1), file.Filename, mimeType)
	if err != nil {
		return models.Media{}, errUploadFailed
	}
	media := models.Media{
		Slug:      uuid.New(),
		Type:      mediaTypeFromMime(mimeType),
		Path:      obj.Key,
		URL:       obj.PublicURL,
		Mime:      mimeType,
		Size:      file.Size,
		AltText:   c.PostForm("alt_text"),
		CreatedBy: h.getActorID(c),
	}

	return media, nil
}

func isAllowedMediaMime(mimeType string) bool {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml":
		return true
	case "video/mp4", "video/webm":
		return true
	case "application/pdf":
		return true
	default:
		return false
	}
}

func mediaTypeFromMime(mimeType string) string {
	if strings.HasPrefix(mimeType, "image/") {
		return "image"
	}
	if strings.HasPrefix(mimeType, "video/") {
		return "video"
	}
	return "file"
}

func mediaExtFromMime(mimeType string) string {
	switch mimeType {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "application/pdf":
		return ".pdf"
	default:
		return ""
	}
}

func (h *Handler) ListWaivers(c *gin.Context) {
	waivers, err := h.Service.ListWaivers(c.Request.Context(), c.Query("scope"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list waivers", nil)
		return
	}
	c.JSON(http.StatusOK, waivers)
}

func (h *Handler) CreateWaiver(c *gin.Context) {
	var req waiverRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	effectiveAt := time.Now()
	if req.EffectiveAt != nil {
		effectiveAt = *req.EffectiveAt
	}

	waiver := models.WaiverVersion{
		Slug:        uuid.New(),
		Scope:       req.Scope,
		EventID:     req.EventID,
		Version:     req.Version,
		Title:       req.Title,
		Content:     req.Content,
		EffectiveAt: effectiveAt,
		IsCurrent:   req.IsCurrent,
	}

	created, err := h.Service.CreateWaiver(c.Request.Context(), waiver)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create waiver", nil)
		return
	}

	h.logAudit(c, "cms.waiver.create", "waiver", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, created)
}

func (h *Handler) UpdateWaiver(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid waiver id", nil)
		return
	}

	var waiver models.WaiverVersion
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&waiver).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "waiver not found", nil)
		return
	}

	old := waiver

	var req waiverRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	effectiveAt := waiver.EffectiveAt
	if req.EffectiveAt != nil {
		effectiveAt = *req.EffectiveAt
	}

	waiver.Scope = req.Scope
	waiver.EventID = req.EventID
	waiver.Version = req.Version
	waiver.Title = req.Title
	waiver.Content = req.Content
	waiver.EffectiveAt = effectiveAt
	waiver.IsCurrent = req.IsCurrent

	updated, err := h.Service.UpdateWaiver(c.Request.Context(), waiver)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update waiver", nil)
		return
	}

	h.logAudit(c, "cms.waiver.update", "waiver", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) GetGalleryAlbums(c *gin.Context) {
	albums, err := h.Service.ListGalleryAlbums(c.Request.Context())
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list albums", nil)
		return
	}

	c.JSON(http.StatusOK, albums)
}

func (h *Handler) GetGalleryAlbum(c *gin.Context) {
	var album models.GalleryAlbum
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("url_slug = ?", c.Param("slug")).First(&album).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "album not found", nil)
		return
	}

	var media []galleryMediaItem
	if err := h.Service.DB.WithContext(c.Request.Context()).
		Table("album_media").
		Select("album_media.sort_order, media.url, media.path, media.mime, media.alt_text, media.type").
		Joins("JOIN media ON media.id = album_media.media_id").
		Where("album_media.album_id = ?", album.ID).
		Order("album_media.sort_order asc").
		Scan(&media).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to load album media", nil)
		return
	}

	for i := range media {
		m := models.Media{URL: media[i].URL, Path: media[i].Path}
		m = withResolvedMediaURL(c.Request.Context(), h.Storage, h.Config.MediaDir, m)
		media[i].URL = m.URL
	}

	c.JSON(http.StatusOK, gin.H{"album": album, "media": media})
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
