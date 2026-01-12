package payments

import "strings"

// Canonical payment statuses shared with frontend.
const (
	PaymentStatusPending    = "pending"
	PaymentStatusSuccess    = "success"
	PaymentStatusFailed     = "failed"
	PaymentStatusRefunded   = "refunded"
	PaymentStatusChargeback = "chargeback"
)

func CanonicalizePaymentStatus(status string) string {
	s := strings.TrimSpace(strings.ToLower(status))
	switch s {
	case PaymentStatusPending, "processing":
		return PaymentStatusPending
	case PaymentStatusSuccess, "paid", "completed", "succeeded":
		return PaymentStatusSuccess
	case PaymentStatusFailed, "canceled", "cancelled", "error":
		return PaymentStatusFailed
	case PaymentStatusRefunded:
		return PaymentStatusRefunded
	case PaymentStatusChargeback:
		// Only used if upstream sets it explicitly.
		return PaymentStatusChargeback
	default:
		return s
	}
}
