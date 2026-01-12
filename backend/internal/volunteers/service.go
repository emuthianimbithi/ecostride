package volunteers

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles volunteer operations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ListVolunteers(ctx context.Context) ([]models.Volunteer, error) {
	var volunteers []models.Volunteer
	if err := s.DB.WithContext(ctx).Order("created_at desc").Find(&volunteers).Error; err != nil {
		return nil, err
	}
	return volunteers, nil
}

func (s *Service) CreateVolunteer(ctx context.Context, volunteer models.Volunteer) (models.Volunteer, error) {
	if err := s.DB.WithContext(ctx).Create(&volunteer).Error; err != nil {
		return models.Volunteer{}, err
	}
	return volunteer, nil
}

func (s *Service) AssignVolunteer(ctx context.Context, assignment models.VolunteerAssignment) (models.VolunteerAssignment, error) {
	if err := s.DB.WithContext(ctx).Create(&assignment).Error; err != nil {
		return models.VolunteerAssignment{}, err
	}
	return assignment, nil
}
