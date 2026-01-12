package events

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles event operations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ListEvents(ctx context.Context, status string) ([]models.Event, error) {
	query := s.DB.WithContext(ctx).Order("start_at asc")
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var events []models.Event
	if err := query.Find(&events).Error; err != nil {
		return nil, err
	}

	return events, nil
}

func (s *Service) GetEventBySlug(ctx context.Context, slug string) (models.Event, error) {
	var event models.Event
	if err := s.DB.WithContext(ctx).Where("url_slug = ?", slug).First(&event).Error; err != nil {
		return models.Event{}, err
	}
	return event, nil
}

func (s *Service) CreateEvent(ctx context.Context, event models.Event) (models.Event, error) {
	if err := s.DB.WithContext(ctx).Create(&event).Error; err != nil {
		return models.Event{}, err
	}
	return event, nil
}

func (s *Service) UpdateEvent(ctx context.Context, event models.Event) (models.Event, error) {
	if err := s.DB.WithContext(ctx).Save(&event).Error; err != nil {
		return models.Event{}, err
	}
	return event, nil
}

func (s *Service) DeleteEvent(ctx context.Context, event models.Event) error {
	return s.DB.WithContext(ctx).Delete(&event).Error
}

func (s *Service) ListCategories(ctx context.Context, eventID uint) ([]models.EventCategory, error) {
	var categories []models.EventCategory
	if err := s.DB.WithContext(ctx).Where("event_id = ?", eventID).Order("created_at asc").Find(&categories).Error; err != nil {
		return nil, err
	}
	return categories, nil
}

func (s *Service) CreateCategory(ctx context.Context, category models.EventCategory) (models.EventCategory, error) {
	if err := s.DB.WithContext(ctx).Create(&category).Error; err != nil {
		return models.EventCategory{}, err
	}
	return category, nil
}

func (s *Service) UpdateCategory(ctx context.Context, category models.EventCategory) (models.EventCategory, error) {
	if err := s.DB.WithContext(ctx).Save(&category).Error; err != nil {
		return models.EventCategory{}, err
	}
	return category, nil
}

func (s *Service) DeleteCategory(ctx context.Context, category models.EventCategory) error {
	return s.DB.WithContext(ctx).Delete(&category).Error
}

func (s *Service) ListFormFields(ctx context.Context, eventID uint) ([]models.EventFormField, error) {
	var fields []models.EventFormField
	if err := s.DB.WithContext(ctx).Where("event_id = ?", eventID).Order("\"order\" asc").Find(&fields).Error; err != nil {
		return nil, err
	}
	return fields, nil
}

func (s *Service) CreateFormField(ctx context.Context, field models.EventFormField) (models.EventFormField, error) {
	if err := s.DB.WithContext(ctx).Create(&field).Error; err != nil {
		return models.EventFormField{}, err
	}
	return field, nil
}

func (s *Service) UpdateFormField(ctx context.Context, field models.EventFormField) (models.EventFormField, error) {
	if err := s.DB.WithContext(ctx).Save(&field).Error; err != nil {
		return models.EventFormField{}, err
	}
	return field, nil
}

func (s *Service) DeleteFormField(ctx context.Context, field models.EventFormField) error {
	return s.DB.WithContext(ctx).Delete(&field).Error
}
