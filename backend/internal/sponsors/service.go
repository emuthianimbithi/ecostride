package sponsors

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles sponsor operations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ListTiers(ctx context.Context) ([]models.SponsorTier, error) {
	var tiers []models.SponsorTier
	if err := s.DB.WithContext(ctx).Order("priority asc").Find(&tiers).Error; err != nil {
		return nil, err
	}
	return tiers, nil
}

func (s *Service) CreateTier(ctx context.Context, tier models.SponsorTier) (models.SponsorTier, error) {
	if err := s.DB.WithContext(ctx).Create(&tier).Error; err != nil {
		return models.SponsorTier{}, err
	}
	return tier, nil
}

func (s *Service) UpdateTier(ctx context.Context, tier models.SponsorTier) (models.SponsorTier, error) {
	if err := s.DB.WithContext(ctx).Save(&tier).Error; err != nil {
		return models.SponsorTier{}, err
	}
	return tier, nil
}

func (s *Service) DeleteTier(ctx context.Context, tier models.SponsorTier) error {
	return s.DB.WithContext(ctx).Delete(&tier).Error
}

func (s *Service) ListSponsors(ctx context.Context) ([]models.Sponsor, error) {
	var sponsors []models.Sponsor
	if err := s.DB.WithContext(ctx).Order("display_order asc").Find(&sponsors).Error; err != nil {
		return nil, err
	}
	return sponsors, nil
}

func (s *Service) CreateSponsor(ctx context.Context, sponsor models.Sponsor) (models.Sponsor, error) {
	if err := s.DB.WithContext(ctx).Create(&sponsor).Error; err != nil {
		return models.Sponsor{}, err
	}
	return sponsor, nil
}

func (s *Service) UpdateSponsor(ctx context.Context, sponsor models.Sponsor) (models.Sponsor, error) {
	if err := s.DB.WithContext(ctx).Save(&sponsor).Error; err != nil {
		return models.Sponsor{}, err
	}
	return sponsor, nil
}

func (s *Service) DeleteSponsor(ctx context.Context, sponsor models.Sponsor) error {
	return s.DB.WithContext(ctx).Delete(&sponsor).Error
}
