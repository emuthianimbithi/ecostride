package testhelpers

import (
	"os"
	"testing"

	commondb "ecostride/backend/internal/common/db"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// OpenTestDB resets the public schema and runs migrations for tests.
func OpenTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	if err := db.Exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;").Error; err != nil {
		t.Fatalf("reset schema: %v", err)
	}

	if err := commondb.AutoMigrate(db); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	return db
}
