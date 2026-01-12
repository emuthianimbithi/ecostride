package bibs

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles bib operations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) CreateAssignment(ctx context.Context, assignment models.BibAssignment) (models.BibAssignment, error) {
	if err := s.DB.WithContext(ctx).Create(&assignment).Error; err != nil {
		return models.BibAssignment{}, err
	}
	return assignment, nil
}

func (s *Service) UpdateAssignment(ctx context.Context, assignment models.BibAssignment) (models.BibAssignment, error) {
	if err := s.DB.WithContext(ctx).Save(&assignment).Error; err != nil {
		return models.BibAssignment{}, err
	}
	return assignment, nil
}
