package registrations

import (
	"context"
	"fmt"

	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/email"
	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// SendConfirmationEmail builds and sends a confirmation email for a registration.
func SendConfirmationEmail(ctx context.Context, cfg config.Config, db *gorm.DB, registrationID uint) error {
	var registration models.Registration
	if err := db.WithContext(ctx).Where("id = ?", registrationID).First(&registration).Error; err != nil {
		return err
	}

	var event models.Event
	if err := db.WithContext(ctx).Where("id = ?", registration.EventID).First(&event).Error; err != nil {
		return err
	}

	var categoryName string
	if registration.CategoryID != nil {
		var category models.EventCategory
		if err := db.WithContext(ctx).Where("id = ?", *registration.CategoryID).First(&category).Error; err == nil {
			categoryName = category.Name
		}
	}

	link := fmt.Sprintf("%s/api/v1/public/registrations/%s/confirmation.pdf", cfg.BaseURL, registration.Slug.String())

	subject := "EcoStride registration confirmation"
	body := fmt.Sprintf(
		"Thanks for registering!\n\nEvent: %s\nCategory: %s\nAthlete: %s\nStatus: %s\nConfirmation code: %s\n\nDownload confirmation PDF: %s\n",
		event.Title,
		categoryName,
		registration.AthleteName,
		registration.Status,
		registration.Slug.String(),
		link,
	)

	return email.Send(cfg, registration.Email, subject, body)
}
