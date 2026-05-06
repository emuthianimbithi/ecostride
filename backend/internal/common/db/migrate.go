package db

import (
	"ecostride/backend/internal/common/models"
	"fmt"

	"gorm.io/gorm"
)

// AutoMigrate runs GORM migrations for all models.
func AutoMigrate(db *gorm.DB) error {
	if err := db.Exec("CREATE EXTENSION IF NOT EXISTS pgcrypto;").Error; err != nil {
		return err
	}

	// Run AutoMigrate for all models
	if err := db.AutoMigrate(
		&models.User{},
		&models.Role{},
		&models.Permission{},
		&models.UserRole{},
		&models.RolePermission{},
		&models.RefreshToken{},
		&models.AuditLog{},
		&models.Media{},
		&models.Page{},
		&models.Post{},
		&models.HeroStyle{},
		&models.Setting{},
		&models.Category{},
		&models.Tag{},
		&models.PostCategory{},
		&models.PostTag{},
		&models.GalleryAlbum{},
		&models.AlbumMedia{},
		&models.WaiverVersion{},
		&models.Event{},
		&models.EventCategory{},
		&models.EventFormField{},
		&models.EventMedia{},
		&models.Registration{},
		&models.ConsentRecord{},
		&models.BibAssignment{},
		&models.Checkin{},
		&models.Payment{},
		&models.PaymentEvent{},
		&models.Receipt{},
		&models.ResultImport{},
		&models.Result{},
		&models.BankImport{},
		&models.ReconciliationMatch{},
		&models.SponsorTier{},
		&models.Sponsor{},
		&models.SponsorPlacement{},
		&models.SponsorView{},
		&models.Volunteer{},
		&models.VolunteerAssignment{},
		&models.VolunteerAttendance{},
		&models.Product{},
		&models.Order{},
		&models.OrderItem{},
		&models.Job{},
	); err != nil {
		return fmt.Errorf("auto migrate failed: %w", err)
	}

	// Create custom indexes that require special handling
	if err := createCustomIndexes(db); err != nil {
		return fmt.Errorf("failed to create custom indexes: %w", err)
	}

	return nil
}

// createCustomIndexes creates partial/conditional indexes that can't be defined in GORM tags
func createCustomIndexes(db *gorm.DB) error {
	indexes := []struct {
		name  string
		query string
	}{
		{
			name: "idx_reg_event_email_active",
			query: `
                CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_event_email_active 
                ON registrations (event_id, email) 
                WHERE status IN ('created', 'confirmed', 'pending')
            `,
		},
	}

	for _, idx := range indexes {
		if err := db.Exec(idx.query).Error; err != nil {
			return fmt.Errorf("failed to create index %s: %w", idx.name, err)
		}
	}

	return nil
}
