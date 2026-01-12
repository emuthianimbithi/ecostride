package cms

import (
	"context"
	"encoding/json"
	"time"

	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/storage"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type HeroStyleDTO struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Key            string          `json:"key"`
	Description    string          `json:"description"`
	LayoutType     string          `json:"layout_type"`
	AspectRatio    string          `json:"aspect_ratio"`
	Overlay        json.RawMessage `json:"overlay"`
	FocalPoint     json.RawMessage `json:"focal_point,omitempty"`
	TextPlacement  string          `json:"text_placement"`
	PaddingVariant string          `json:"padding_variant"`
	IsActive       bool            `json:"is_active"`
}

type PostDTO struct {
	ID                   uint          `json:"id"`
	Slug                 uuid.UUID     `json:"slug"`
	URLSlug              string        `json:"url_slug"`
	Title                string        `json:"title"`
	Content              any           `json:"content"`
	Excerpt              string        `json:"excerpt"`
	FeaturedImageMediaID *uint         `json:"featured_image_media_id"`
	FeaturedImageURL     string        `json:"featured_image_url"`
	HeroStyleID          *string       `json:"hero_style_id"`
	HeroStyle            *HeroStyleDTO `json:"hero_style"`
	HeroShowTitle        bool          `json:"hero_show_title"`
	Status               string        `json:"status"`
	PublishedAt          *time.Time    `json:"published_at,omitempty"`
	UpdatedAt            time.Time     `json:"updated_at"`
	CreatedAt            time.Time     `json:"created_at"`
}

func buildPostDTO(ctx context.Context, db *gorm.DB, provider storage.StorageProvider, mediaDir string, post models.Post) (PostDTO, error) {
	dto := PostDTO{
		ID:                   post.ID,
		Slug:                 post.Slug,
		URLSlug:              post.URLSlug,
		Title:                post.Title,
		Content:              post.Content,
		Excerpt:              post.Excerpt,
		FeaturedImageMediaID: post.FeaturedImageMediaID,
		HeroShowTitle:        post.HeroShowTitle,
		Status:               post.Status,
		PublishedAt:          post.PublishedAt,
		UpdatedAt:            post.UpdatedAt,
		CreatedAt:            post.CreatedAt,
	}

	if post.FeaturedImageMediaID != nil {
		var media models.Media
		if err := db.WithContext(ctx).Where("id = ?", *post.FeaturedImageMediaID).First(&media).Error; err == nil {
			media = withResolvedMediaURL(ctx, provider, mediaDir, media)
			dto.FeaturedImageURL = media.URL
		}
	}

	if post.HeroStyleID != nil {
		var style models.HeroStyle
		if err := db.WithContext(ctx).Where("id = ?", *post.HeroStyleID).First(&style).Error; err == nil {
			slug := style.Slug.String()
			dto.HeroStyleID = &slug
			dto.HeroStyle = &HeroStyleDTO{
				ID:             slug,
				Name:           style.Name,
				Key:            style.Key,
				Description:    style.Description,
				LayoutType:     style.LayoutType,
				AspectRatio:    style.AspectRatio,
				Overlay:        json.RawMessage(style.Overlay),
				FocalPoint:     json.RawMessage(style.FocalPoint),
				TextPlacement:  style.TextPlacement,
				PaddingVariant: style.PaddingVariant,
				IsActive:       style.IsActive,
			}
		}
	}

	return dto, nil
}
