package payments

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/jobs"
	"ecostride/backend/internal/receipts"

	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/refund"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrPaymentNotFound     = errors.New("payment not found")
	ErrDuplicateEvent      = errors.New("duplicate payment event")
	ErrUnsupportedCurrency = errors.New("unsupported currency")
)

// Service handles payment operations.
type Service struct {
	PesaPal           *PesaPalClient
	DB                *gorm.DB
	Config            config.Config
	Receipts          *receipts.Service
	mpesaToken        string
	mpesaTokenExpires time.Time
	mpesaTokenMu      sync.Mutex
}

func NewService(db *gorm.DB, cfg config.Config, receiptsService *receipts.Service) *Service {
	return &Service{DB: db, Config: cfg, Receipts: receiptsService, PesaPal: NewPesaPalClient(cfg)}
}

type PaymentContext struct {
	Registration *models.Registration
	Order        *models.Order
	Category     *models.EventCategory
	Email        string
	AmountMinor  int
	Currency     string
	Description  string
}

type StripeSessionResult struct {
	SessionID   string
	CheckoutURL string
}

type MpesaSTKResult struct {
	MerchantRequestID string `json:"MerchantRequestID"`
	CheckoutRequestID string `json:"CheckoutRequestID"`
	ResponseCode      string `json:"ResponseCode"`
	ResponseDesc      string `json:"ResponseDescription"`
	CustomerMessage   string `json:"CustomerMessage"`
}

func (s *Service) FindPaymentBySlug(ctx context.Context, slug uuid.UUID) (models.Payment, error) {
	var payment models.Payment
	if err := s.DB.WithContext(ctx).Where("slug = ?", slug).First(&payment).Error; err != nil {
		return models.Payment{}, ErrPaymentNotFound
	}
	return payment, nil
}

func (s *Service) BuildRegistrationContext(ctx context.Context, registrationSlug uuid.UUID, currency string) (PaymentContext, error) {
	var registration models.Registration
	if err := s.DB.WithContext(ctx).Where("slug = ?", registrationSlug).First(&registration).Error; err != nil {
		return PaymentContext{}, fmt.Errorf("registration not found")
	}

	if registration.Status == "cancelled" || registration.Status == "refunded" {
		return PaymentContext{}, fmt.Errorf("registration not payable")
	}

	if registration.CategoryID == nil {
		return PaymentContext{}, fmt.Errorf("category required")
	}

	var category models.EventCategory
	if err := s.DB.WithContext(ctx).Where("id = ?", *registration.CategoryID).First(&category).Error; err != nil {
		return PaymentContext{}, fmt.Errorf("category not found")
	}

	currency = normalizeCurrency(currency)
	amount, err := categoryPrice(category, currency)
	if err != nil {
		return PaymentContext{}, err
	}

	return PaymentContext{
		Registration: &registration,
		Category:     &category,
		Email:        registration.Email,
		AmountMinor:  amount,
		Currency:     currency,
		Description:  fmt.Sprintf("%s - %s", category.Name, registration.AthleteName),
	}, nil
}

func (s *Service) BuildOrderContext(ctx context.Context, orderSlug uuid.UUID) (PaymentContext, error) {
	var order models.Order
	if err := s.DB.WithContext(ctx).Where("slug = ?", orderSlug).First(&order).Error; err != nil {
		return PaymentContext{}, fmt.Errorf("order not found")
	}

	// Eligibility is rechecked under a row lock when claiming a new attempt.

	currency, err := validateCurrency(order.Currency)
	if err != nil {
		return PaymentContext{}, err
	}

	return PaymentContext{
		Order:       &order,
		Email:       order.Email,
		AmountMinor: order.TotalMinor,
		Currency:    currency,
		Description: fmt.Sprintf("Order %s", order.Slug.String()),
	}, nil
}

func (s *Service) CreatePayment(ctx context.Context, provider string, ctxData PaymentContext, idempotencyKey string, metadata map[string]interface{}) (models.Payment, error) {
	payment := models.Payment{
		Slug:           uuid.New(),
		Provider:       provider,
		Currency:       ctxData.Currency,
		AmountMinor:    ctxData.AmountMinor,
		Status:         "pending",
		IdempotencyKey: optionalString(idempotencyKey),
		Metadata:       marshalMetadata(metadata),
	}

	if ctxData.Registration != nil {
		payment.RegistrationID = &ctxData.Registration.ID
	}
	if ctxData.Order != nil {
		payment.OrderID = &ctxData.Order.ID
	}

	if err := s.DB.WithContext(ctx).Create(&payment).Error; err != nil {
		return models.Payment{}, err
	}

	return payment, nil
}

func (s *Service) UpdatePayment(ctx context.Context, payment models.Payment, providerRef string, metadata map[string]interface{}) (models.Payment, error) {
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&payment, payment.ID).Error; err != nil {
			return err
		}
		if providerRef != "" {
			payment.ProviderRef = providerRef
		}
		if metadata != nil {
			payment.Metadata = mergeMetadata(payment.Metadata, metadata)
		}
		return tx.Save(&payment).Error
	})
	return payment, err
}

func (s *Service) CreateStripeSession(ctx context.Context, payment models.Payment, ctxData PaymentContext, successURL, cancelURL, idempotencyKey string) (StripeSessionResult, error) {
	if s.Config.StripeSecretKey == "" {
		return StripeSessionResult{}, errors.New("stripe not configured")
	}

	stripe.Key = s.Config.StripeSecretKey

	params := &stripe.CheckoutSessionParams{
		Mode:              stripe.String(string(stripe.CheckoutSessionModePayment)),
		SuccessURL:        stripe.String(successURL),
		CancelURL:         stripe.String(cancelURL),
		ClientReferenceID: stripe.String(payment.Slug.String()),
		Metadata: map[string]string{
			"payment_slug": payment.Slug.String(),
		},
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency:   stripe.String(strings.ToLower(ctxData.Currency)),
					UnitAmount: stripe.Int64(int64(ctxData.AmountMinor)),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name: stripe.String(ctxData.Description),
					},
				},
				Quantity: stripe.Int64(1),
			},
		},
	}
	if idempotencyKey != "" {
		params.Params.IdempotencyKey = stripe.String(idempotencyKey)
	}

	sessionObj, err := session.New(params)
	if err != nil {
		return StripeSessionResult{}, err
	}

	return StripeSessionResult{
		SessionID:   sessionObj.ID,
		CheckoutURL: sessionObj.URL,
	}, nil
}

func (s *Service) InitiateMpesaSTK(ctx context.Context, payment models.Payment, phone string) (MpesaSTKResult, error) {
	if s.Config.MPesaShortcode == "" || s.Config.MPesaPasskey == "" || s.Config.MPesaCallbackURL == "" {
		return MpesaSTKResult{}, errors.New("mpesa not configured")
	}

	token, err := s.MpesaAccessToken(ctx)
	if err != nil {
		return MpesaSTKResult{}, err
	}

	timestamp := time.Now().Format("20060102150405")
	amount := payment.AmountMinor / 100
	if amount < 1 {
		return MpesaSTKResult{}, errors.New("invalid amount")
	}

	payload := map[string]interface{}{
		"BusinessShortCode": s.Config.MPesaShortcode,
		"Password":          buildMpesaPassword(s.Config.MPesaShortcode, s.Config.MPesaPasskey, timestamp),
		"Timestamp":         timestamp,
		"TransactionType":   "CustomerPayBillOnline",
		"Amount":            amount,
		"PartyA":            phone,
		"PartyB":            s.Config.MPesaShortcode,
		"PhoneNumber":       phone,
		"CallBackURL":       s.Config.MPesaCallbackURL,
		"AccountReference":  payment.Slug.String(),
		"TransactionDesc":   "EcoStride payment",
	}

	encoded, _ := json.Marshal(payload)

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(s.Config.MPesaBaseURL, "/")+"/mpesa/stkpush/v1/processrequest", strings.NewReader(string(encoded)))
	if err != nil {
		return MpesaSTKResult{}, err
	}
	request.Header.Set("Authorization", mpesaAuthHeader(token))
	request.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(request)
	if err != nil {
		return MpesaSTKResult{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return MpesaSTKResult{}, errors.New("mpesa stk request failed")
	}

	var response MpesaSTKResult
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return MpesaSTKResult{}, err
	}

	if response.ResponseCode != "0" {
		return MpesaSTKResult{}, errors.New(response.ResponseDesc)
	}

	return response, nil
}

func (s *Service) MarkPaymentSuccess(ctx context.Context, payment models.Payment) (models.Payment, error) {
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&payment, payment.ID).Error; err != nil {
			return err
		}
		if payment.Status == "refunded" || payment.Status == "chargeback" {
			return nil
		}
		payment.Status = "success"
		email := ""
		if payment.RegistrationID != nil {
			var registration models.Registration
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&registration, *payment.RegistrationID).Error; err != nil {
				return err
			}
			email = registration.Email
			if registration.Status == "cancelled" || registration.Status == "refunded" {
				payment.Metadata = mergeMetadata(payment.Metadata, map[string]interface{}{"requires_review": true, "review_reason": "payment_received_for_ineligible_registration"})
			} else if registration.Status != "confirmed" {
				if err := tx.Model(&registration).Update("status", "confirmed").Error; err != nil {
					return err
				}
			}
		}
		if payment.OrderID != nil {
			var order models.Order
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, *payment.OrderID).Error; err != nil {
				return err
			}
			email = order.Email
			if order.Status == "cancelled" || order.Status == "refunded" || (order.Status == "pending" && order.ReservationExpiresAt != nil && time.Now().After(*order.ReservationExpiresAt)) {
				payment.Metadata = mergeMetadata(payment.Metadata, map[string]interface{}{"requires_review": true, "review_reason": "payment_received_for_ineligible_order"})
			} else if order.Status != "paid" {
				if err := tx.Model(&order).Update("status", "paid").Error; err != nil {
					return err
				}
			}
		}
		if err := tx.Save(&payment).Error; err != nil {
			return err
		}
		// Receipt and delivery jobs commit together with payment and eligibility.
		if s.Receipts != nil {
			service := receipts.NewService(tx, s.Receipts.Config, jobs.NewService(tx))
			if _, err := service.IssueReceipt(ctx, payment, email); err != nil {
				return err
			}
		}
		return nil
	})
	return payment, err
}

func (s *Service) MarkPaymentFailed(ctx context.Context, payment models.Payment) (models.Payment, error) {
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&payment, payment.ID).Error; err != nil {
			return err
		}
		if payment.Status != "pending" && payment.Status != "processing" {
			return nil
		}
		payment.Status = "failed"
		return tx.Save(&payment).Error
	})
	return payment, err
}

// ProcessNotification records completion only after every transactional effect
// succeeds. Old event rows lacking processed_at are safe to resume.
func (s *Service) ProcessNotification(ctx context.Context, payment models.Payment, eventID, eventType string, payload []byte, metadata map[string]interface{}, success bool, outcome ...string) (models.Payment, error) {
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&payment, payment.ID).Error; err != nil {
			return err
		}
		event := models.PaymentEvent{Slug: uuid.New(), PaymentID: payment.ID, ProviderEventID: eventID, Type: eventType, Payload: datatypes.JSON(payload), ReceivedAt: time.Now()}
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "provider_event_id"}}, DoNothing: true}).Create(&event).Error; err != nil {
			return err
		}
		if err := tx.Where("provider_event_id = ?", eventID).First(&event).Error; err != nil {
			return err
		}
		if event.PaymentID != payment.ID {
			return errors.New("payment event target mismatch")
		}
		if event.ProcessedAt != nil {
			return nil
		}
		scoped := *s
		scoped.DB = tx
		var err error
		payment, err = scoped.UpdatePayment(ctx, payment, "", metadata)
		if err != nil {
			return err
		}
		if len(outcome) > 0 && outcome[0] == "refunded" {
			payment, err = scoped.MarkPaymentRefunded(ctx, payment)
		} else if len(outcome) > 0 && outcome[0] == "pending" {
			// INVALID is not authoritative failure. Preserve current payment status.
		} else if success {
			payment, err = scoped.MarkPaymentSuccess(ctx, payment)
		} else {
			payment, err = scoped.MarkPaymentFailed(ctx, payment)
		}
		if err != nil {
			return err
		}
		return tx.Model(&event).Update("processed_at", time.Now()).Error
	})
	return payment, err
}

func (s *Service) MarkPaymentRefunded(ctx context.Context, payment models.Payment) (models.Payment, error) {
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&payment, payment.ID).Error; err != nil {
			return err
		}
		if payment.Status != "refunded" {
			payment.Status = "refunded"
			if err := tx.Save(&payment).Error; err != nil {
				return err
			}
		}

		if payment.RegistrationID != nil {
			var registration models.Registration
			if err := tx.Where("id = ?", *payment.RegistrationID).First(&registration).Error; err != nil {
				return err
			}
			if registration.Status != "refunded" {
				registration.Status = "refunded"
				if err := tx.Save(&registration).Error; err != nil {
					return err
				}
			}
		}

		if payment.OrderID != nil {
			var order models.Order
			if err := tx.Where("id = ?", *payment.OrderID).First(&order).Error; err != nil {
				return err
			}
			if order.Status != "refunded" {
				order.Status = "refunded"
				if err := tx.Save(&order).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})
	return payment, err
}

func (s *Service) RefundStripe(ctx context.Context, payment models.Payment, amountMinor *int, reason string) (string, map[string]interface{}, error) {
	if s.Config.StripeSecretKey == "" {
		return "", nil, errors.New("stripe not configured")
	}

	stripe.Key = s.Config.StripeSecretKey

	paymentIntent := extractMetadataString(payment.Metadata, "payment_intent")
	if paymentIntent == "" && payment.ProviderRef != "" {
		sessionObj, err := session.Get(payment.ProviderRef, &stripe.CheckoutSessionParams{
			Expand: stripe.StringSlice([]string{"payment_intent"}),
		})
		if err != nil {
			return "", nil, err
		}
		if sessionObj != nil && sessionObj.PaymentIntent != nil {
			paymentIntent = sessionObj.PaymentIntent.ID
		}
	}

	if paymentIntent == "" {
		return "", nil, errors.New("payment intent not found")
	}

	params := &stripe.RefundParams{
		PaymentIntent: stripe.String(paymentIntent),
	}
	if amountMinor != nil {
		params.Amount = stripe.Int64(int64(*amountMinor))
	}
	if reason != "" {
		switch strings.ToLower(reason) {
		case "duplicate", "fraudulent", "requested_by_customer":
			params.Reason = stripe.String(strings.ToLower(reason))
		}
	}

	refundObj, err := refund.New(params)
	if err != nil {
		return "", nil, err
	}

	meta := map[string]interface{}{
		"stripe_refund_id":    refundObj.ID,
		"refund_amount_minor": int(refundObj.Amount),
		"refund_reason":       reason,
		"payment_intent":      paymentIntent,
	}

	return refundObj.ID, meta, nil
}

func (s *Service) RecordEvent(ctx context.Context, paymentID uint, providerEventID, eventType string, payload []byte) error {
	entry := models.PaymentEvent{
		Slug:            uuid.New(),
		PaymentID:       paymentID,
		ProviderEventID: providerEventID,
		Type:            eventType,
		Payload:         datatypes.JSON(payload),
		ReceivedAt:      time.Now(),
	}

	if err := s.DB.WithContext(ctx).Create(&entry).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return ErrDuplicateEvent
		}
		return err
	}

	return nil
}

func (s *Service) MpesaAccessToken(ctx context.Context) (string, error) {
	if s.Config.MPesaConsumerKey == "" || s.Config.MPesaConsumerSecret == "" {
		return "", errors.New("mpesa not configured")
	}

	s.mpesaTokenMu.Lock()
	if s.mpesaToken != "" && time.Now().Before(s.mpesaTokenExpires) {
		token := s.mpesaToken
		s.mpesaTokenMu.Unlock()
		return token, nil
	}
	s.mpesaTokenMu.Unlock()

	endpoint := strings.TrimRight(s.Config.MPesaBaseURL, "/") + "/oauth/v1/generate?grant_type=client_credentials"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}

	auth := base64.StdEncoding.EncodeToString([]byte(s.Config.MPesaConsumerKey + ":" + s.Config.MPesaConsumerSecret))
	request.Header.Set("Authorization", "Basic "+auth)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("mpesa token request failed: %s", resp.Status)
	}

	var payload struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   string `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", err
	}

	if payload.AccessToken == "" {
		return "", errors.New("mpesa token missing")
	}
	// convert string to int
	expiresInt, err := strconv.Atoi(payload.ExpiresIn)
	if err != nil {
		return "", err
	}

	expires := time.Duration(expiresInt) * time.Second
	if expires > 30*time.Second {
		expires -= 30 * time.Second
	}

	s.mpesaTokenMu.Lock()
	s.mpesaToken = payload.AccessToken
	s.mpesaTokenExpires = time.Now().Add(expires)
	s.mpesaTokenMu.Unlock()

	return payload.AccessToken, nil
}

func normalizeCurrency(currency string) string {
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if currency == "" {
		return "KES"
	}
	return currency
}

func validateCurrency(currency string) (string, error) {
	currency = normalizeCurrency(currency)
	switch currency {
	case "KES", "USD", "EUR":
		return currency, nil
	default:
		return "", ErrUnsupportedCurrency
	}
}

func categoryPrice(category models.EventCategory, currency string) (int, error) {
	switch currency {
	case "KES":
		return category.PriceKESMinor, nil
	case "USD":
		if category.PriceUSDMinor == nil {
			return 0, ErrUnsupportedCurrency
		}
		return *category.PriceUSDMinor, nil
	case "EUR":
		if category.PriceEURMinor == nil {
			return 0, ErrUnsupportedCurrency
		}
		return *category.PriceEURMinor, nil
	default:
		return 0, ErrUnsupportedCurrency
	}
}

func mergeMetadata(existing datatypes.JSON, updates map[string]interface{}) datatypes.JSON {
	if updates == nil {
		return existing
	}

	data := make(map[string]interface{})
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &data)
	}

	for key, value := range updates {
		data[key] = value
	}

	return marshalMetadata(data)
}

func marshalMetadata(data map[string]interface{}) datatypes.JSON {
	if data == nil {
		return datatypes.JSON([]byte("{}"))
	}

	payload, _ := json.Marshal(data)
	return datatypes.JSON(payload)
}

func optionalString(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func buildMpesaPassword(shortcode, passkey, timestamp string) string {
	payload := shortcode + passkey + timestamp
	encoded := base64.StdEncoding.EncodeToString([]byte(payload))
	return encoded
}

func mpesaAuthHeader(token string) string {
	return "Bearer " + token
}

func extractMetadataString(metadata datatypes.JSON, key string) string {
	if len(metadata) == 0 {
		return ""
	}

	var data map[string]interface{}
	if err := json.Unmarshal(metadata, &data); err != nil {
		return ""
	}

	if value, ok := data[key]; ok {
		if str, ok := value.(string); ok {
			return str
		}
	}

	return ""
}
