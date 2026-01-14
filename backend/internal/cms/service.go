package cms

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles CMS operations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ListPages(ctx context.Context, status string) ([]models.Page, error) {
	query := s.DB.WithContext(ctx).Order("created_at desc")
	if status != "" {
		query = query.Where("status = ?", strings.ToLower(status))
	}

	var pages []models.Page
	if err := query.Find(&pages).Error; err != nil {
		return nil, err
	}

	return pages, nil
}

func (s *Service) GetPublishedPageBySlug(ctx context.Context, slug string) (models.Page, error) {
	var page models.Page
	if err := s.DB.WithContext(ctx).
		Where("(slug = ? or url_slug = ?) AND status = ?", slug, slug, "published").
		First(&page).Error; err != nil {
		return models.Page{}, err
	}

	return page, nil
}

func (s *Service) CreatePage(ctx context.Context, page models.Page) (models.Page, error) {
	if err := s.DB.WithContext(ctx).Create(&page).Error; err != nil {
		return models.Page{}, err
	}
	return page, nil
}

func (s *Service) UpdatePage(ctx context.Context, page models.Page) (models.Page, error) {
	if err := s.DB.WithContext(ctx).Save(&page).Error; err != nil {
		return models.Page{}, err
	}
	return page, nil
}

func (s *Service) DeletePage(ctx context.Context, page models.Page) error {
	return s.DB.WithContext(ctx).Delete(&page).Error
}

func (s *Service) ListPosts(ctx context.Context, status string) ([]models.Post, error) {
	query := s.DB.WithContext(ctx).Order("created_at desc")
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var posts []models.Post
	if err := query.Find(&posts).Error; err != nil {
		return nil, err
	}

	return posts, nil
}

func (s *Service) GetPublishedPostBySlug(ctx context.Context, slug string) (models.Post, error) {
	var post models.Post
	if err := s.DB.WithContext(ctx).
		Where("url_slug = ? AND status = ?", slug, "published").
		First(&post).Error; err != nil {
		return models.Post{}, err
	}

	return post, nil
}

func (s *Service) CreatePost(ctx context.Context, post models.Post) (models.Post, error) {
	if err := s.DB.WithContext(ctx).Create(&post).Error; err != nil {
		return models.Post{}, err
	}
	return post, nil
}

func (s *Service) UpdatePost(ctx context.Context, post models.Post) (models.Post, error) {
	if err := s.DB.WithContext(ctx).Save(&post).Error; err != nil {
		return models.Post{}, err
	}
	return post, nil
}

func (s *Service) DeletePost(ctx context.Context, post models.Post) error {
	return s.DB.WithContext(ctx).Delete(&post).Error
}

func (s *Service) ListMedia(ctx context.Context) ([]models.Media, error) {
	var media []models.Media
	if err := s.DB.WithContext(ctx).Order("created_at desc").Find(&media).Error; err != nil {
		return nil, err
	}
	return media, nil
}

func (s *Service) CreateMedia(ctx context.Context, media models.Media) (models.Media, error) {
	if err := s.DB.WithContext(ctx).Create(&media).Error; err != nil {
		return models.Media{}, err
	}
	return media, nil
}

func (s *Service) ListWaivers(ctx context.Context, scope string) ([]models.WaiverVersion, error) {
	query := s.DB.WithContext(ctx).Order("version desc")
	if scope != "" {
		query = query.Where("scope = ?", scope)
	}

	var waivers []models.WaiverVersion
	if err := query.Find(&waivers).Error; err != nil {
		return nil, err
	}
	return waivers, nil
}

func (s *Service) CreateWaiver(ctx context.Context, waiver models.WaiverVersion) (models.WaiverVersion, error) {
	waiver.ContentHash = hashContent(waiver.Content)
	if waiver.EffectiveAt.IsZero() {
		waiver.EffectiveAt = time.Now()
	}

	if waiver.IsCurrent {
		if err := s.DB.WithContext(ctx).
			Model(&models.WaiverVersion{}).
			Where("scope = ? AND (event_id IS NOT DISTINCT FROM ?)", waiver.Scope, waiver.EventID).
			Update("is_current", false).Error; err != nil {
			return models.WaiverVersion{}, err
		}
	}

	if err := s.DB.WithContext(ctx).Create(&waiver).Error; err != nil {
		return models.WaiverVersion{}, err
	}
	return waiver, nil
}

func (s *Service) UpdateWaiver(ctx context.Context, waiver models.WaiverVersion) (models.WaiverVersion, error) {
	waiver.ContentHash = hashContent(waiver.Content)
	if waiver.IsCurrent {
		if err := s.DB.WithContext(ctx).
			Model(&models.WaiverVersion{}).
			Where("scope = ? AND (event_id IS NOT DISTINCT FROM ?) AND id <> ?", waiver.Scope, waiver.EventID, waiver.ID).
			Update("is_current", false).Error; err != nil {
			return models.WaiverVersion{}, err
		}
	}

	if err := s.DB.WithContext(ctx).Save(&waiver).Error; err != nil {
		return models.WaiverVersion{}, err
	}
	return waiver, nil
}

func (s *Service) GetCurrentWaiver(ctx context.Context, scope string, eventID *uint) (models.WaiverVersion, error) {
	var waiver models.WaiverVersion
	query := s.DB.WithContext(ctx).
		Where("scope = ? AND is_current = true", scope)
	if eventID != nil {
		query = query.Where("event_id = ?", *eventID)
	} else {
		query = query.Where("event_id IS NULL")
	}

	if err := query.First(&waiver).Error; err != nil {
		return models.WaiverVersion{}, err
	}

	return waiver, nil
}

func (s *Service) ListGalleryAlbums(ctx context.Context) ([]models.GalleryAlbum, error) {
	var albums []models.GalleryAlbum
	if err := s.DB.WithContext(ctx).Order("created_at desc").Find(&albums).Error; err != nil {
		return nil, err
	}
	return albums, nil
}

func (s *Service) GetGalleryAlbum(ctx context.Context, slug string) (models.GalleryAlbum, []models.AlbumMedia, error) {
	var album models.GalleryAlbum
	if err := s.DB.WithContext(ctx).Where("url_slug = ?", slug).First(&album).Error; err != nil {
		return models.GalleryAlbum{}, nil, err
	}

	var media []models.AlbumMedia
	if err := s.DB.WithContext(ctx).
		Where("album_id = ?", album.ID).
		Order("sort_order asc").
		Find(&media).Error; err != nil {
		return models.GalleryAlbum{}, nil, err
	}

	return album, media, nil
}

func hashContent(content string) string {
	result := sha256.Sum256([]byte(content))
	return hex.EncodeToString(result[:])
}
