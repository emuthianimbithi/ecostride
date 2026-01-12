package cms

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"ecostride/backend/internal/common/models"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var ErrHeroStyleNotFound = errors.New("hero style not found")

func (s *Service) ListHeroStyles(ctx context.Context, activeOnly bool) ([]models.HeroStyle, error) {
	q := s.DB.WithContext(ctx).Order("created_at desc")
	if activeOnly {
		q = q.Where("is_active = true")
	}
	var styles []models.HeroStyle
	if err := q.Find(&styles).Error; err != nil {
		return nil, err
	}
	return styles, nil
}

func (s *Service) FindHeroStyleBySlug(ctx context.Context, slug uuid.UUID) (models.HeroStyle, error) {
	var style models.HeroStyle
	if err := s.DB.WithContext(ctx).Where("slug = ?", slug).First(&style).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.HeroStyle{}, ErrHeroStyleNotFound
		}
		return models.HeroStyle{}, err
	}
	return style, nil
}

func (s *Service) FindHeroStyleByKey(ctx context.Context, key string) (models.HeroStyle, error) {
	key = strings.TrimSpace(key)
	var style models.HeroStyle
	if err := s.DB.WithContext(ctx).Where("key = ?", key).First(&style).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.HeroStyle{}, ErrHeroStyleNotFound
		}
		return models.HeroStyle{}, err
	}
	return style, nil
}

func (s *Service) CreateHeroStyle(ctx context.Context, style models.HeroStyle) (models.HeroStyle, error) {
	if err := s.DB.WithContext(ctx).Create(&style).Error; err != nil {
		return models.HeroStyle{}, err
	}
	return style, nil
}

func (s *Service) UpdateHeroStyle(ctx context.Context, style models.HeroStyle) (models.HeroStyle, error) {
	if err := s.DB.WithContext(ctx).Save(&style).Error; err != nil {
		return models.HeroStyle{}, err
	}
	return style, nil
}

func (s *Service) DisableHeroStyle(ctx context.Context, style models.HeroStyle) (models.HeroStyle, error) {
	style.IsActive = false
	return s.UpdateHeroStyle(ctx, style)
}

const settingDefaultHeroStyleKey = "default_hero_style"

func (s *Service) GetDefaultHeroStyle(ctx context.Context) (*models.HeroStyle, error) {
	var setting models.Setting
	if err := s.DB.WithContext(ctx).Where("key = ?", settingDefaultHeroStyleKey).First(&setting).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	var payload struct {
		HeroStyleID *uint `json:"hero_style_id"`
	}
	if err := json.Unmarshal(setting.Value, &payload); err != nil {
		return nil, nil
	}
	if payload.HeroStyleID == nil {
		return nil, nil
	}
	var style models.HeroStyle
	if err := s.DB.WithContext(ctx).Where("id = ? AND is_active = true", *payload.HeroStyleID).First(&style).Error; err != nil {
		return nil, nil
	}
	return &style, nil
}

func (s *Service) SetDefaultHeroStyle(ctx context.Context, heroStyleID uint) error {
	payload := map[string]any{"hero_style_id": heroStyleID}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	var setting models.Setting
	setting.Key = settingDefaultHeroStyleKey
	setting.Value = datatypes.JSON(raw)

	return s.DB.WithContext(ctx).
		Where("key = ?", settingDefaultHeroStyleKey).
		Assign(setting).
		FirstOrCreate(&setting).Error
}
