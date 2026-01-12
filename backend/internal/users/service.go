package users

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles user and role management.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ListUsers(ctx context.Context) ([]models.User, error) {
	var users []models.User
	if err := s.DB.WithContext(ctx).Preload("Roles").Order("created_at desc").Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func (s *Service) ListRoles(ctx context.Context) ([]models.Role, error) {
	var roles []models.Role
	if err := s.DB.WithContext(ctx).Preload("Permissions").Order("created_at desc").Find(&roles).Error; err != nil {
		return nil, err
	}
	return roles, nil
}

func (s *Service) ListPermissions(ctx context.Context) ([]models.Permission, error) {
	var permissions []models.Permission
	if err := s.DB.WithContext(ctx).Order("key asc").Find(&permissions).Error; err != nil {
		return nil, err
	}
	return permissions, nil
}
