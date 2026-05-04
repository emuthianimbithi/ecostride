package cms

import (
	"net/http"
	"strings"
	"time"

	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type galleryAlbumRequest struct {
	Title       string `json:"title" binding:"required"`
	URLSlug     string `json:"url_slug" binding:"required"`
	Description string `json:"description"`
}

type albumMediaSetRequest struct {
	MediaIDs []uint `json:"media_ids"`
}

type galleryAlbumListItem struct {
	ID          string    `json:"id"`
	Slug        string    `json:"slug"`
	Title       string    `json:"title"`
	URLSlug     string    `json:"url_slug"`
	Description string    `json:"description"`
	MediaCount  int       `json:"media_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type galleryAlbumDetailMedia struct {
	MediaID   uint   `json:"media_id"`
	URL       string `json:"url"`
	Path      string `json:"path"`
	Type      string `json:"type"`
	Mime      string `json:"mime"`
	AltText   string `json:"alt_text"`
	SortOrder int    `json:"sort_order"`
}

type galleryAlbumDetail struct {
	galleryAlbumListItem
	Media []galleryAlbumDetailMedia `json:"media"`
}

func (h *Handler) parseAlbumSlug(c *gin.Context) (uuid.UUID, bool) {
	slug, err := uuid.Parse(c.Param("slug"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid album slug", nil)
		return uuid.Nil, false
	}
	return slug, true
}

func (h *Handler) findAlbumBySlug(c *gin.Context, slug uuid.UUID) (models.GalleryAlbum, bool) {
	var album models.GalleryAlbum
	if err := h.Service.DB.WithContext(c.Request.Context()).Where("slug = ?", slug).First(&album).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "album not found", nil)
		return models.GalleryAlbum{}, false
	}
	return album, true
}

func toGalleryAlbumListItem(a models.GalleryAlbum, mediaCount int) galleryAlbumListItem {
	slug := a.Slug.String()
	return galleryAlbumListItem{
		ID:          slug,
		Slug:        slug,
		Title:       a.Title,
		URLSlug:     a.URLSlug,
		Description: a.Description,
		MediaCount:  mediaCount,
		CreatedAt:   a.CreatedAt,
		UpdatedAt:   a.UpdatedAt,
	}
}

// ListAdminGalleryAlbums returns all albums with their media counts.
func (h *Handler) ListAdminGalleryAlbums(c *gin.Context) {
	albums, err := h.Service.ListGalleryAlbums(c.Request.Context())
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list albums", nil)
		return
	}

	// Counts per album_id in one query.
	type rowCount struct {
		AlbumID uint
		N       int
	}
	var rows []rowCount
	if len(albums) > 0 {
		ids := make([]uint, 0, len(albums))
		for _, a := range albums {
			ids = append(ids, a.ID)
		}
		if err := h.Service.DB.WithContext(c.Request.Context()).
			Table("album_media").
			Select("album_id, count(*) as n").
			Where("album_id IN ?", ids).
			Group("album_id").
			Scan(&rows).Error; err != nil {
			apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to count album media", nil)
			return
		}
	}
	countByAlbum := map[uint]int{}
	for _, r := range rows {
		countByAlbum[r.AlbumID] = r.N
	}

	out := make([]galleryAlbumListItem, 0, len(albums))
	for _, a := range albums {
		out = append(out, toGalleryAlbumListItem(a, countByAlbum[a.ID]))
	}
	c.JSON(http.StatusOK, out)
}

// GetAdminGalleryAlbum returns one album with full media list.
func (h *Handler) GetAdminGalleryAlbum(c *gin.Context) {
	slug, ok := h.parseAlbumSlug(c)
	if !ok {
		return
	}
	album, ok := h.findAlbumBySlug(c, slug)
	if !ok {
		return
	}

	type row struct {
		MediaID   uint
		URL       string
		Path      string
		Type      string
		Mime      string
		AltText   string
		SortOrder int
	}
	var rows []row
	if err := h.Service.DB.WithContext(c.Request.Context()).
		Table("album_media").
		Select("album_media.media_id, album_media.sort_order, media.url, media.path, media.type, media.mime, media.alt_text").
		Joins("JOIN media ON media.id = album_media.media_id").
		Where("album_media.album_id = ?", album.ID).
		Order("album_media.sort_order asc").
		Scan(&rows).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to load album media", nil)
		return
	}

	mediaOut := make([]galleryAlbumDetailMedia, 0, len(rows))
	for _, r := range rows {
		m := models.Media{URL: r.URL, Path: r.Path}
		m = withResolvedMediaURL(c.Request.Context(), h.Storage, h.Config.MediaDir, m)
		mediaOut = append(mediaOut, galleryAlbumDetailMedia{
			MediaID:   r.MediaID,
			URL:       m.URL,
			Path:      r.Path,
			Type:      r.Type,
			Mime:      r.Mime,
			AltText:   r.AltText,
			SortOrder: r.SortOrder,
		})
	}

	detail := galleryAlbumDetail{
		galleryAlbumListItem: toGalleryAlbumListItem(album, len(mediaOut)),
		Media:                mediaOut,
	}
	c.JSON(http.StatusOK, detail)
}

func (h *Handler) CreateGalleryAlbum(c *gin.Context) {
	var req galleryAlbumRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	album := models.GalleryAlbum{
		Slug:        uuid.New(),
		Title:       strings.TrimSpace(req.Title),
		URLSlug:     strings.TrimSpace(req.URLSlug),
		Description: strings.TrimSpace(req.Description),
	}
	if err := h.Service.DB.WithContext(c.Request.Context()).Create(&album).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create album", nil)
		return
	}

	h.logAudit(c, "cms.gallery.album.create", "gallery_album", album.Slug.String(), nil, album)
	c.JSON(http.StatusCreated, toGalleryAlbumListItem(album, 0))
}

func (h *Handler) UpdateGalleryAlbum(c *gin.Context) {
	slug, ok := h.parseAlbumSlug(c)
	if !ok {
		return
	}
	album, ok := h.findAlbumBySlug(c, slug)
	if !ok {
		return
	}

	var req galleryAlbumRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	old := album
	album.Title = strings.TrimSpace(req.Title)
	album.URLSlug = strings.TrimSpace(req.URLSlug)
	album.Description = strings.TrimSpace(req.Description)
	if err := h.Service.DB.WithContext(c.Request.Context()).Save(&album).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update album", nil)
		return
	}

	var n int64
	h.Service.DB.WithContext(c.Request.Context()).Table("album_media").Where("album_id = ?", album.ID).Count(&n)

	h.logAudit(c, "cms.gallery.album.update", "gallery_album", album.Slug.String(), old, album)
	c.JSON(http.StatusOK, toGalleryAlbumListItem(album, int(n)))
}

func (h *Handler) DeleteGalleryAlbum(c *gin.Context) {
	slug, ok := h.parseAlbumSlug(c)
	if !ok {
		return
	}
	album, ok := h.findAlbumBySlug(c, slug)
	if !ok {
		return
	}

	tx := h.Service.DB.WithContext(c.Request.Context()).Begin()
	if err := tx.Where("album_id = ?", album.ID).Delete(&models.AlbumMedia{}).Error; err != nil {
		tx.Rollback()
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete album media links", nil)
		return
	}
	if err := tx.Delete(&album).Error; err != nil {
		tx.Rollback()
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete album", nil)
		return
	}
	if err := tx.Commit().Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to commit", nil)
		return
	}

	h.logAudit(c, "cms.gallery.album.delete", "gallery_album", album.Slug.String(), album, nil)
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// SetAlbumMedia replaces the album's media list with the given ordered list of media IDs.
func (h *Handler) SetAlbumMedia(c *gin.Context) {
	slug, ok := h.parseAlbumSlug(c)
	if !ok {
		return
	}
	album, ok := h.findAlbumBySlug(c, slug)
	if !ok {
		return
	}

	var req albumMediaSetRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	// Validate that all referenced media exist.
	if len(req.MediaIDs) > 0 {
		var existing int64
		if err := h.Service.DB.WithContext(c.Request.Context()).
			Model(&models.Media{}).
			Where("id IN ?", req.MediaIDs).
			Count(&existing).Error; err != nil {
			apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to verify media", nil)
			return
		}
		if int(existing) != uniqueLen(req.MediaIDs) {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "one or more media_ids do not exist", nil)
			return
		}
	}

	tx := h.Service.DB.WithContext(c.Request.Context()).Begin()
	if err := tx.Where("album_id = ?", album.ID).Delete(&models.AlbumMedia{}).Error; err != nil {
		tx.Rollback()
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to clear album media", nil)
		return
	}
	for i, mid := range req.MediaIDs {
		link := models.AlbumMedia{
			Slug:      uuid.New(),
			AlbumID:   album.ID,
			MediaID:   mid,
			SortOrder: i,
		}
		if err := tx.Create(&link).Error; err != nil {
			tx.Rollback()
			apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to attach media", nil)
			return
		}
	}
	if err := tx.Commit().Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to commit", nil)
		return
	}

	h.logAudit(c, "cms.gallery.album.set_media", "gallery_album", album.Slug.String(), nil, gin.H{"media_ids": req.MediaIDs})
	c.JSON(http.StatusOK, gin.H{"album_id": album.Slug.String(), "media_count": len(req.MediaIDs)})
}

func uniqueLen(ids []uint) int {
	seen := make(map[uint]struct{}, len(ids))
	for _, id := range ids {
		seen[id] = struct{}{}
	}
	return len(seen)
}
