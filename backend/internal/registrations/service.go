package registrations

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles registrations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) CreateRegistration(ctx context.Context, registration models.Registration, consent models.ConsentRecord) (models.Registration, error) {
	return registration, s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&registration).Error; err != nil {
			return err
		}

		consent.RegistrationID = registration.ID
		if err := tx.Create(&consent).Error; err != nil {
			return err
		}

		return nil
	})
}

func (s *Service) GetRegistrationBySlug(ctx context.Context, slug string) (models.Registration, error) {
	var registration models.Registration
	if err := s.DB.WithContext(ctx).Where("slug = ?", slug).First(&registration).Error; err != nil {
		return models.Registration{}, err
	}
	return registration, nil
}

func (s *Service) ListRegistrations(ctx context.Context, eventID *uint, status string) ([]models.Registration, error) {
	query := s.DB.WithContext(ctx).Order("created_at desc")
	if eventID != nil {
		query = query.Where("event_id = ?", *eventID)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var registrations []models.Registration
	if err := query.Find(&registrations).Error; err != nil {
		return nil, err
	}

	return registrations, nil
}

func (s *Service) UpdateRegistration(ctx context.Context, registration models.Registration) (models.Registration, error) {
	if err := s.DB.WithContext(ctx).Save(&registration).Error; err != nil {
		return models.Registration{}, err
	}
	return registration, nil
}

func (s *Service) CancelRegistration(ctx context.Context, registration models.Registration) (models.Registration, error) {
	registration.Status = "cancelled"
	if err := s.DB.WithContext(ctx).Save(&registration).Error; err != nil {
		return models.Registration{}, err
	}
	return registration, nil
}
