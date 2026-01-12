package main

import (
	"context"
	"encoding/json"
	"time"

	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/email"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/jobs"
	"ecostride/backend/internal/receipts"
	"ecostride/backend/internal/registrations"

	"gorm.io/gorm"
)

type volunteerBroadcastPayload struct {
	Subject string `json:"subject"`
	Message string `json:"message"`
}

func registerJobHandlers(jobService *jobs.Service, receiptService *receipts.Service, db *gorm.DB, cfg config.Config) {
	jobService.Register("receipt.email", func(ctx context.Context, job models.Job) error {
		var payload receipts.ReceiptJobPayload
		if err := json.Unmarshal(job.Payload, &payload); err != nil {
			return err
		}

		var receipt models.Receipt
		if err := db.WithContext(ctx).Where("id = ?", payload.ReceiptID).First(&receipt).Error; err != nil {
			return err
		}

		var payment models.Payment
		if err := db.WithContext(ctx).Where("id = ?", payload.PaymentID).First(&payment).Error; err != nil {
			return err
		}

		if payload.Email == "" {
			return nil
		}

		if err := receiptService.SendReceiptEmail(ctx, receipt, payment, payload.Email); err != nil {
			return err
		}

		now := time.Now()
		_ = db.WithContext(ctx).Model(&receipt).Update("delivered_email_at", &now).Error
		return nil
	})

	jobService.Register("receipt.pdf", func(ctx context.Context, job models.Job) error {
		var payload receipts.ReceiptJobPayload
		if err := json.Unmarshal(job.Payload, &payload); err != nil {
			return err
		}

		var receipt models.Receipt
		if err := db.WithContext(ctx).Where("id = ?", payload.ReceiptID).First(&receipt).Error; err != nil {
			return err
		}

		var payment models.Payment
		if err := db.WithContext(ctx).Where("id = ?", payload.PaymentID).First(&payment).Error; err != nil {
			return err
		}

		if err := receiptService.GenerateReceiptPDF(ctx, &receipt, payment); err != nil {
			return err
		}

		return db.WithContext(ctx).Save(&receipt).Error
	})

	jobService.Register("registration.confirmation", func(ctx context.Context, job models.Job) error {
		var payload struct {
			RegistrationID uint `json:"registration_id"`
		}
		if err := json.Unmarshal(job.Payload, &payload); err != nil {
			return err
		}

		return registrations.SendConfirmationEmail(ctx, cfg, db, payload.RegistrationID)
	})

	jobService.Register("volunteer.broadcast", func(ctx context.Context, job models.Job) error {
		var payload volunteerBroadcastPayload
		if err := json.Unmarshal(job.Payload, &payload); err != nil {
			return err
		}

		if payload.Subject == "" {
			payload.Subject = "EcoStride Volunteer Update"
		}

		var volunteers []models.Volunteer
		if err := db.WithContext(ctx).Find(&volunteers).Error; err != nil {
			return err
		}

		for _, volunteer := range volunteers {
			if volunteer.Email == "" {
				continue
			}
			if err := email.Send(cfg, volunteer.Email, payload.Subject, payload.Message); err != nil {
				return err
			}
		}

		return nil
	})
}
