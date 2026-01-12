package receipts

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/email"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/pdf"
	"ecostride/backend/internal/jobs"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Service handles receipt issuance.
type Service struct {
	DB     *gorm.DB
	Config config.Config
	Jobs   *jobs.Service
}

func NewService(db *gorm.DB, cfg config.Config, jobsService *jobs.Service) *Service {
	return &Service{DB: db, Config: cfg, Jobs: jobsService}
}

func (s *Service) IssueReceipt(ctx context.Context, payment models.Payment, email string) (models.Receipt, error) {
	var existing models.Receipt
	if err := s.DB.WithContext(ctx).Where("payment_id = ?", payment.ID).First(&existing).Error; err == nil {
		return existing, nil
	}

	var receipt models.Receipt
	for attempts := 0; attempts < 3; attempts++ {
		receipt = models.Receipt{
			Slug:          uuid.New(),
			PaymentID:     payment.ID,
			ReceiptNumber: generateReceiptNumber(),
			IssuedAt:      time.Now(),
			EmailTo:       email,
		}

		if err := s.DB.WithContext(ctx).Create(&receipt).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				continue
			}
			return models.Receipt{}, err
		}
		break
	}

	if receipt.ID == 0 {
		return models.Receipt{}, fmt.Errorf("failed to allocate receipt number")
	}

	if s.Jobs != nil {
		payload := ReceiptJobPayload{
			ReceiptID: receipt.ID,
			PaymentID: payment.ID,
			Email:     email,
		}
		_, _ = s.Jobs.Enqueue(ctx, "receipt.email", payload, time.Now())
		_, _ = s.Jobs.Enqueue(ctx, "receipt.pdf", payload, time.Now())
		return receipt, nil
	}

	if s.Config.MediaStorage == "local" && s.Config.MediaDir != "" {
		if err := s.GenerateReceiptPDF(ctx, &receipt, payment); err == nil {
			_ = s.DB.WithContext(ctx).Save(&receipt).Error
		}
	}

	if email != "" {
		if err := s.SendReceiptEmail(ctx, receipt, payment, email); err == nil {
			now := time.Now()
			_ = s.DB.WithContext(ctx).Model(&receipt).Update("delivered_email_at", &now).Error
		}
	}

	return receipt, nil
}

type ReceiptJobPayload struct {
	ReceiptID uint   `json:"receipt_id"`
	PaymentID uint   `json:"payment_id"`
	Email     string `json:"email"`
}

func (s *Service) SendReceiptEmail(ctx context.Context, receipt models.Receipt, payment models.Payment, to string) error {
	details := s.buildReceiptDetails(ctx, receipt, payment)
	subject := "EcoStride receipt " + receipt.ReceiptNumber
	body := strings.Join(details.emailLines, "\n")
	return email.Send(s.Config, to, subject, body)
}

func (s *Service) GenerateReceiptPDF(ctx context.Context, receipt *models.Receipt, payment models.Payment) error {
	if err := os.MkdirAll(s.Config.MediaDir, 0755); err != nil {
		return err
	}

	filename := fmt.Sprintf("receipt-%s.pdf", strings.ToLower(receipt.ReceiptNumber))
	filename = strings.ReplaceAll(filename, " ", "-")
	filePath := filepath.Join(s.Config.MediaDir, filename)
	details := s.buildReceiptDetails(ctx, *receipt, payment)
	lines := details.pdfLines

	pdfBytes := pdf.BuildSimplePDF(lines)
	if err := os.WriteFile(filePath, pdfBytes, 0644); err != nil {
		return err
	}

	mediaURL := strings.TrimRight(s.Config.BaseURL, "/") + "/media/" + filename
	media := models.Media{
		Slug:      uuid.New(),
		Type:      "file",
		Path:      filePath,
		URL:       mediaURL,
		Mime:      "application/pdf",
		Size:      int64(len(pdfBytes)),
		CreatedBy: 0,
	}

	if err := s.DB.WithContext(ctx).Create(&media).Error; err != nil {
		return err
	}

	receipt.PDFMediaID = &media.ID
	return nil
}

type receiptDetails struct {
	emailLines []string
	pdfLines   []string
}

func (s *Service) buildReceiptDetails(ctx context.Context, receipt models.Receipt, payment models.Payment) receiptDetails {
	orgLine := "EcoStride Association • Malindi, Kenya"
	amountLine := fmt.Sprintf("Amount: %s", formatMoney(payment.Currency, payment.AmountMinor))
	providerLine := fmt.Sprintf("Provider: %s", payment.Provider)
	transactionID := payment.ProviderRef
	if transactionID == "" {
		transactionID = payment.Slug.String()
	}
	transactionLine := fmt.Sprintf("Transaction ID: %s", transactionID)

	payerName := ""
	payerEmail := receipt.EmailTo
	contextLines := []string{}

	if payment.RegistrationID != nil {
		var row struct {
			AthleteName  string
			Email        string
			EventTitle   string
			EventStartAt *time.Time
			CategoryName *string
		}
		_ = s.DB.WithContext(ctx).
			Table("registrations").
			Select(`registrations.athlete_name, registrations.email, events.title as event_title, events.start_at as event_start_at, event_categories.name as category_name`).
			Joins("LEFT JOIN events ON events.id = registrations.event_id").
			Joins("LEFT JOIN event_categories ON event_categories.id = registrations.category_id").
			Where("registrations.id = ?", *payment.RegistrationID).
			Scan(&row).Error
		payerName = row.AthleteName
		if row.Email != "" {
			payerEmail = row.Email
		}
		if row.EventTitle != "" {
			eventLine := fmt.Sprintf("Event: %s", row.EventTitle)
			if row.CategoryName != nil && *row.CategoryName != "" {
				eventLine = eventLine + fmt.Sprintf(" • %s", *row.CategoryName)
			}
			if row.EventStartAt != nil {
				eventLine = eventLine + fmt.Sprintf(" • %s", row.EventStartAt.Format("2006-01-02"))
			}
			contextLines = append(contextLines, eventLine)
		}
	}

	if payment.OrderID != nil {
		var order models.Order
		if err := s.DB.WithContext(ctx).Where("id = ?", *payment.OrderID).First(&order).Error; err == nil {
			payerName = order.BuyerName
			if order.Email != "" {
				payerEmail = order.Email
			}
		}

		type itemRow struct {
			ProductName string
			Qty         int
			LineTotal   int
		}
		var items []itemRow
		_ = s.DB.WithContext(ctx).
			Table("order_items").
			Select("products.name as product_name, order_items.qty, order_items.line_total_minor as line_total").
			Joins("LEFT JOIN products ON products.id = order_items.product_id").
			Where("order_items.order_id = ?", *payment.OrderID).
			Scan(&items).Error

		if len(items) > 0 {
			contextLines = append(contextLines, "Order items:")
			for _, item := range items {
				contextLines = append(contextLines, fmt.Sprintf("- %s x%d (%s)", item.ProductName, item.Qty, formatMoney(payment.Currency, item.LineTotal)))
			}
		}
	}

	payerLine := "Payer: " + payerName
	if payerEmail != "" {
		payerLine = payerLine + fmt.Sprintf(" <%s>", payerEmail)
	}

	emailLines := []string{
		orgLine,
		"Receipt: " + receipt.ReceiptNumber,
		"Issued: " + receipt.IssuedAt.Format(time.RFC3339),
		payerLine,
	}
	emailLines = append(emailLines, contextLines...)
	emailLines = append(emailLines, amountLine, providerLine, transactionLine, "Thank you for supporting EcoStride.")

	pdfLines := []string{
		"EcoStride Receipt",
		orgLine,
		fmt.Sprintf("Receipt: %s", receipt.ReceiptNumber),
		fmt.Sprintf("Issued: %s", receipt.IssuedAt.Format(time.RFC3339)),
		payerLine,
	}
	pdfLines = append(pdfLines, contextLines...)
	pdfLines = append(pdfLines, amountLine, providerLine, transactionLine)

	return receiptDetails{emailLines: emailLines, pdfLines: pdfLines}
}

func formatMoney(currency string, minor int) string {
	value := float64(minor) / 100
	return fmt.Sprintf("%s %.2f", currency, value)
}

func generateReceiptNumber() string {
	stamp := time.Now().Format("20060102")
	rnd := make([]byte, 4)
	_, _ = rand.Read(rnd)
	return fmt.Sprintf("ES-%s-%s", stamp, strings.ToUpper(hex.EncodeToString(rnd)))
}
