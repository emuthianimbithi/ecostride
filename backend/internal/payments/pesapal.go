package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/url"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s *Service) SubmitPesaPal(ctx context.Context, payment models.Payment, data PaymentContext) (models.Payment, error) {
	billing := map[string]string{"email_address": data.Email}
	if data.Registration != nil {
		billing["phone_number"] = data.Registration.Phone
		billing["first_name"] = data.Registration.AthleteName
	}
	if data.Order != nil {
		billing["phone_number"] = data.Order.Phone
		billing["first_name"] = data.Order.BuyerName
	}
	description := []rune(data.Description)
	if len(description) > 100 {
		description = description[:100]
	}
	amount := json.Number(fmt.Sprintf("%d.%02d", payment.AmountMinor/100, payment.AmountMinor%100))
	request := map[string]interface{}{"id": payment.Slug.String(), "currency": payment.Currency, "amount": amount, "description": string(description), "callback_url": strings.TrimRight(s.Config.BaseURL, "/") + "/api/v1/public/payments/pesapal/callback", "notification_id": s.Config.PesaPalNotificationID, "billing_address": billing}
	var result pesaPalOrder
	err := s.PesaPal.call(ctx, "POST", "/Transactions/SubmitOrderRequest", request, &result)
	if err == nil {
		_, idErr := uuid.Parse(result.TrackingID)
		if result.Status != "200" || result.Reference != payment.Slug.String() || idErr != nil || !validPesaPalRedirect(result.RedirectURL) {
			err = errors.New("PesaPal order response could not be verified")
		}
	}
	if err != nil {
		// Never assume an error means the provider did not create the order.
		_, _ = s.UpdatePayment(ctx, payment, "", map[string]interface{}{"requires_review": true, "review_reason": "pesapal_submission_uncertain"})
		return payment, err
	}
	return s.UpdatePayment(ctx, payment, result.TrackingID, map[string]interface{}{"checkout_url": result.RedirectURL})
}

func amountMatches(raw json.Number, minor int) bool {
	value, ok := new(big.Rat).SetString(raw.String())
	if !ok {
		return false
	}
	value.Mul(value, big.NewRat(100, 1))
	return value.IsInt() && value.Num().IsInt64() && value.Num().Int64() == int64(minor)
}

// VerifyPesaPal trusts only the authenticated status response, never callback fields.
func (s *Service) VerifyPesaPal(ctx context.Context, payment models.Payment, tracking string, entry *audit.Entry) (models.Payment, error) {
	if payment.Provider != "PESAPAL" || !s.Config.PesaPalEnabled || extractMetadataString(payment.Metadata, "pesapal_environment") != s.Config.PesaPalEnvironment {
		return payment, errors.New("PesaPal verification unavailable")
	}
	if _, err := uuid.Parse(tracking); err != nil {
		return payment, errors.New("invalid tracking ID")
	}
	if payment.ProviderRef != "" && payment.ProviderRef != tracking {
		return payment, errors.New("tracking ID mismatch")
	}
	var status pesaPalStatus
	if err := s.PesaPal.call(ctx, "GET", "/Transactions/GetTransactionStatus?orderTrackingId="+url.QueryEscape(tracking), nil, &status); err != nil {
		return payment, err
	}
	if status.Status != "200" || status.Reference != payment.Slug.String() || !strings.EqualFold(status.Currency, payment.Currency) || !amountMatches(status.Amount, payment.AmountMinor) {
		return payment, errors.New("PesaPal status does not match the saved payment")
	}
	outcome := "pending"
	switch status.Code {
	case 0:
	case 1:
		if !strings.EqualFold(status.Description, "COMPLETED") {
			return payment, errors.New("inconsistent payment status")
		}
		outcome = "success"
	case 2:
		if !strings.EqualFold(status.Description, "FAILED") {
			return payment, errors.New("inconsistent payment status")
		}
		outcome = "failed"
	case 3:
		if !strings.EqualFold(status.Description, "REVERSED") {
			return payment, errors.New("inconsistent payment status")
		}
		outcome = "refunded"
	default:
		return payment, errors.New("unknown PesaPal status")
	}
	payload, _ := json.Marshal(map[string]interface{}{"status_code": status.Code, "currency": status.Currency, "amount": status.Amount, "merchant_reference": status.Reference})
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&payment, payment.ID).Error; err != nil {
			return err
		}
		if payment.ProviderRef != "" && payment.ProviderRef != tracking {
			return errors.New("tracking ID mismatch")
		}
		scoped := *s
		scoped.DB = tx
		var err error
		metadata := map[string]interface{}{"confirmation_code": status.Confirmation}
		reason := extractMetadataString(payment.Metadata, "review_reason")
		if reason == "pesapal_submission_uncertain" || reason == "pesapal_verification_failed" {
			metadata["requires_review"] = false
			metadata["review_reason"] = ""
		}
		payment, err = scoped.UpdatePayment(ctx, payment, tracking, metadata)
		if err != nil {
			return err
		}
		// Include outcome in identity so failure cannot suppress later settlement/reversal.
		payment, err = scoped.ProcessNotification(ctx, payment, fmt.Sprintf("PESAPAL:%s:%d", tracking, status.Code), "pesapal.status", payload, nil, outcome == "success", outcome)
		if err != nil {
			return err
		}
		now := time.Now()
		next := now.Add(5 * time.Minute)
		updates := map[string]interface{}{"last_checked_at": now, "next_check_at": nil}
		if payment.Status == "pending" {
			updates["next_check_at"] = next
		}
		if err := tx.Model(&payment).Updates(updates).Error; err != nil {
			return err
		}
		if entry != nil {
			return audit.NewService(tx).Log(ctx, *entry)
		}
		return nil
	})
	return payment, err
}

// RecoverPesaPal checks a bounded batch. The claim is committed before HTTP so
// multiple API processes do not continuously query the same order.
func (s *Service) RecoverPesaPal(ctx context.Context) error {
	if !s.Config.PesaPalEnabled {
		return nil
	}
	for i := 0; i < 20; i++ {
		var payment models.Payment
		err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).Where("provider = ? AND status = ? AND metadata->>'pesapal_environment' = ? AND provider_ref <> '' AND verification_attempts < 8 AND (next_check_at IS NULL OR next_check_at <= ?)", "PESAPAL", "pending", s.Config.PesaPalEnvironment, time.Now()).Order("created_at").Limit(1).Find(&payment).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			if err != nil {
				return err
			}
			if payment.ID == 0 {
				return nil
			}
			payment.VerificationAttempts++
			next := time.Now().Add(time.Duration(payment.VerificationAttempts) * 5 * time.Minute)
			payment.NextCheckAt = &next
			return tx.Save(&payment).Error
		})
		if err != nil {
			return err
		}
		if payment.ID == 0 {
			return nil
		}
		_, err = s.VerifyPesaPal(ctx, payment, payment.ProviderRef, nil)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if _, updateErr := s.UpdatePayment(ctx, payment, "", map[string]interface{}{"requires_review": true, "review_reason": "pesapal_verification_failed"}); updateErr != nil {
				return updateErr
			}
		}
	}
	return nil
}
func (s *Service) RunPesaPalRecovery(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run, cancel := context.WithTimeout(ctx, 45*time.Second)
			if err := s.RecoverPesaPal(run); err != nil {
				log.Printf("PesaPal recovery did not complete: %v", err)
			}
			cancel()
		}
	}
}
