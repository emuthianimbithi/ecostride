package results

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles results operations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ListResults(ctx context.Context, eventID uint) ([]models.Result, error) {
	var results []models.Result
	if err := s.DB.WithContext(ctx).
		Where("event_id = ?", eventID).
		Order("finish_seconds asc").
		Find(&results).Error; err != nil {
		return nil, err
	}
	return results, nil
}

func (s *Service) SearchResults(ctx context.Context, eventID uint, bib *int, name, category string) ([]models.Result, error) {
	query := s.DB.WithContext(ctx).Where("event_id = ?", eventID)
	if bib != nil {
		query = query.Where("bib_number = ?", *bib)
	}
	if name != "" {
		query = query.Where("name ILIKE ?", "%"+name+"%")
	}
	if category != "" {
		query = query.Where("category_name = ?", category)
	}

	var results []models.Result
	if err := query.Order("finish_seconds asc").Find(&results).Error; err != nil {
		return nil, err
	}
	return results, nil
}

func (s *Service) Leaderboard(ctx context.Context, eventID uint, group string, filter string) ([]models.Result, error) {
	query := s.DB.WithContext(ctx).Where("event_id = ?", eventID)

	switch group {
	case "category":
		if filter != "" {
			query = query.Where("category_name = ?", filter)
		}
	case "gender":
		if filter != "" {
			query = query.Where("gender = ?", filter)
		}
	case "agegroup":
		if filter != "" {
			query = query.Where("age_group = ?", filter)
		}
	}

	var results []models.Result
	if err := query.Order("finish_seconds asc").Limit(50).Find(&results).Error; err != nil {
		return nil, err
	}
	return results, nil
}
