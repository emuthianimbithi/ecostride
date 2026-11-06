package payments

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"ecostride/backend/internal/common/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrIdempotencyConflict = errors.New("idempotency key already used for another request")
var ErrPaymentInProgress = errors.New("a payment is already pending or settled for this entry")
var ErrIdempotencyRequired = errors.New("X-Idempotency-Key is required (maximum 200 characters)")

// ClaimPayment commits the attempt before contacting the provider. Only the caller
// receiving created=true may submit it. Uncertain submissions remain pending.
func (s *Service) ClaimPayment(ctx context.Context, provider string, data PaymentContext, key string, metadata map[string]interface{}) (payment models.Payment, created bool, err error) {
	if strings.TrimSpace(key) == "" || len(key) > 200 {
		return payment, false, ErrIdempotencyRequired
	}
	request := struct {
		Provider                string
		RegistrationID, OrderID uint
		Currency                string
		Amount                  int
		Metadata                map[string]interface{}
	}{Provider: provider, Currency: data.Currency, Amount: data.AmountMinor, Metadata: metadata}
	if data.Registration != nil {
		request.RegistrationID = data.Registration.ID
	}
	if data.Order != nil {
		request.OrderID = data.Order.ID
	}
	if (request.RegistrationID == 0) == (request.OrderID == 0) {
		return payment, false, errors.New("exactly one payment target required")
	}
	encoded, err := json.Marshal(request)
	if err != nil {
		return payment, false, err
	}
	sum := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(sum[:])
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Key lock serializes cross-target reuse as well as same-target retries.
		if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", key).Error; err != nil {
			return err
		}
		result := tx.Where("idempotency_key = ?", key).First(&payment)
		if result.Error == nil {
			if extractMetadataString(payment.Metadata, "request_fingerprint") != fingerprint {
				return ErrIdempotencyConflict
			}
			return nil
		}
		if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return result.Error
		}
		column := "registration_id"
		targetID := request.RegistrationID
		if targetID != 0 {
			var target models.Registration
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&target, targetID).Error; err != nil {
				return err
			}
			if target.Status != "pending_payment" && target.Status != "created" {
				return ErrPaymentInProgress
			}
		} else {
			column, targetID = "order_id", request.OrderID
			var target models.Order
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&target, targetID).Error; err != nil {
				return err
			}
			if target.Status == "paid" || target.Status == "refunded" || target.Status == "cancelled" || (target.ReservationExpiresAt != nil && time.Now().After(*target.ReservationExpiresAt)) {
				return ErrPaymentInProgress
			}
		}
		var count int64
		if err := tx.Model(&models.Payment{}).Where(fmt.Sprintf("%s = ? AND status IN ?", column), targetID, []string{"pending", "processing", "success", "paid", "refunded", "chargeback"}).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrPaymentInProgress
		}
		meta := make(map[string]interface{}, len(metadata)+1)
		for k, v := range metadata {
			meta[k] = v
		}
		meta["request_fingerprint"] = fingerprint
		scoped := *s
		scoped.DB = tx
		payment, err = scoped.CreatePayment(ctx, provider, data, key, meta)
		created = err == nil
		return err
	})
	return
}
