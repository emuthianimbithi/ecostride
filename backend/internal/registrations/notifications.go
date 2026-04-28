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
	textBody, htmlBody, err := email.RenderRegistrationConfirmation(email.RegistrationConfirmationData{
		EventTitle:         event.Title,
		CategoryName:       categoryName,
		AthleteName:        registration.AthleteName,
		Status:             registration.Status,
		ConfirmationCode:   registration.Slug.String(),
		ConfirmationPDFURL: link,
	})
	if err != nil {
		return err
	}

	return email.SendRich(cfg, registration.Email, subject, textBody, htmlBody)
}
