package finance

import (
	"context"
	"time"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Service handles finance operations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

type PaymentAggregate struct {
	Currency    string
	Status      string
	Count       int64
	AmountMinor int64
}

type PaymentExportRow struct {
	PaymentSlug       string
	Provider          string
	Status            string
	Currency          string
	AmountMinor       int
	ProviderRef       string
	CreatedAt         time.Time
	RegistrationSlug  *string
	RegistrationEmail *string
	OrderSlug         *string
	OrderEmail        *string
	ReceiptNumber     *string
}

type PaymentExportFilter struct {
	Status   string
	Provider string
	Currency string
	StartAt  *time.Time
	EndAt    *time.Time
}

func (s *Service) PaymentSummary(ctx context.Context, startAt, endAt *time.Time) ([]PaymentAggregate, error) {
	query := s.DB.WithContext(ctx).Model(&models.Payment{}).
		Select("currency, status, count(*) as count, COALESCE(sum(amount_minor), 0) as amount_minor").
		Group("currency, status").
		Order("currency asc, status asc")

	if startAt != nil {
		query = query.Where("created_at >= ?", *startAt)
	}
	if endAt != nil {
		query = query.Where("created_at <= ?", *endAt)
	}

	var rows []PaymentAggregate
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) ExportPayments(ctx context.Context, filter PaymentExportFilter) ([]PaymentExportRow, error) {
	query := s.DB.WithContext(ctx).
		Table("payments").
		Select(`
			payments.slug as payment_slug,
			payments.provider,
			payments.status,
			payments.currency,
			payments.amount_minor,
			payments.provider_ref,
			payments.created_at,
			registrations.slug as registration_slug,
			registrations.email as registration_email,
			orders.slug as order_slug,
			orders.email as order_email,
			receipts.receipt_number as receipt_number`).
		Joins("LEFT JOIN registrations ON registrations.id = payments.registration_id").
		Joins("LEFT JOIN orders ON orders.id = payments.order_id").
		Joins("LEFT JOIN receipts ON receipts.payment_id = payments.id")

	if filter.Status != "" {
		query = query.Where("payments.status = ?", filter.Status)
	}
	if filter.Provider != "" {
		query = query.Where("payments.provider = ?", filter.Provider)
	}
	if filter.Currency != "" {
		query = query.Where("payments.currency = ?", filter.Currency)
	}
	if filter.StartAt != nil {
		query = query.Where("payments.created_at >= ?", *filter.StartAt)
	}
	if filter.EndAt != nil {
		query = query.Where("payments.created_at <= ?", *filter.EndAt)
	}

	var rows []PaymentExportRow
	if err := query.Order("payments.created_at desc").Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
