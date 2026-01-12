package db

import (
	"ecostride/backend/internal/common/config"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Connect initializes a GORM connection.
func Connect(cfg config.Config) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
}
