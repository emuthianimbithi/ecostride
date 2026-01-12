package finance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/pdf"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Handler exposes finance HTTP handlers.
type Handler struct {
	Service *Service
	Audit   *audit.Service
	DB      *gorm.DB
	Config  config.Config
}

func NewHandler(service *Service, auditService *audit.Service, db *gorm.DB, cfg config.Config) *Handler {
	return &Handler{Service: service, Audit: auditService, DB: db, Config: cfg}
}

type dashboardResponse struct {
	From    *time.Time         `json:"from"`
	To      *time.Time         `json:"to"`
	Summary []PaymentAggregate `json:"summary"`
}

type bankImportMapping struct {
	Date        string `json:"date"`
	Amount      string `json:"amount"`
	Reference   string `json:"reference"`
	Description string `json:"description"`
	Currency    string `json:"currency"`
}

type reconcileMatchRequest struct {
	MatchSlug   string `json:"match_slug" binding:"required"`
	PaymentSlug string `json:"payment_slug" binding:"required"`
	Notes       string `json:"notes"`
}

type reconcileResolveRequest struct {
	MatchSlug string `json:"match_slug" binding:"required"`
	Status    string `json:"status"`
	Notes     string `json:"notes"`
}

type bankRow struct {
	RowNumber   int
	Date        string
	AmountMinor int
	Currency    string
	Reference   string
	Description string
	Hash        string
	MatchSlug   uuid.UUID
	Status      string
	PaymentSlug *uuid.UUID
}

func (h *Handler) Dashboard(c *gin.Context) {
	startAt, endAt, err := parseDateRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date range"})
		return
	}

	summary, err := h.Service.PaymentSummary(c.Request.Context(), startAt, endAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load summary"})
		return
	}

	c.JSON(http.StatusOK, dashboardResponse{From: startAt, To: endAt, Summary: summary})
}

func (h *Handler) Export(c *gin.Context) {
	format := strings.ToLower(c.DefaultQuery("format", "csv"))
	if format != "csv" && format != "xlsx" && format != "pdf" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported format"})
		return
	}

	startAt, endAt, err := parseDateRange(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date range"})
		return
	}

	filter := PaymentExportFilter{
		Status:   c.Query("status"),
		Provider: strings.ToUpper(c.Query("provider")),
		Currency: strings.ToUpper(c.Query("currency")),
		StartAt:  startAt,
		EndAt:    endAt,
	}

	rows, err := h.Service.ExportPayments(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to export payments"})
		return
	}

	headers := []string{
		"payment_slug",
		"provider",
		"status",
		"currency",
		"amount_minor",
		"provider_ref",
		"receipt_number",
		"registration_slug",
		"registration_email",
		"order_slug",
		"order_email",
		"created_at",
	}

	data := make([][]string, 0, len(rows)+1)
	data = append(data, headers)
	for _, row := range rows {
		data = append(data, []string{
			row.PaymentSlug,
			row.Provider,
			row.Status,
			row.Currency,
			strconv.Itoa(row.AmountMinor),
			row.ProviderRef,
			optionalString(row.ReceiptNumber),
			optionalString(row.RegistrationSlug),
			optionalString(row.RegistrationEmail),
			optionalString(row.OrderSlug),
			optionalString(row.OrderEmail),
			row.CreatedAt.Format(time.RFC3339),
		})
	}

	h.logAudit(c, "finance.export", "payments", "", nil, gin.H{"format": format})

	if format == "xlsx" {
		file := excelize.NewFile()
		sheet := "Payments"
		file.SetSheetName("Sheet1", sheet)
		for i, row := range data {
			cell, _ := excelize.CoordinatesToCellName(1, i+1)
			if err := file.SetSheetRow(sheet, cell, &row); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build xlsx"})
				return
			}
		}
		buf, err := file.WriteToBuffer()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build xlsx"})
			return
		}
		c.Header("Content-Disposition", "attachment; filename=payments-export.xlsx")
		c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf.Bytes())
		return
	}

	if format == "pdf" {
		lines := make([]string, 0, len(data))
		for _, row := range data {
			lines = append(lines, strings.Join(row, " | "))
		}
		pdfBytes := pdf.BuildSimplePDF(lines)
		c.Header("Content-Disposition", "attachment; filename=payments-export.pdf")
		c.Data(http.StatusOK, "application/pdf", pdfBytes)
		return
	}

	buffer := &bytes.Buffer{}
	writer := csv.NewWriter(buffer)
	if err := writer.WriteAll(data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build csv"})
		return
	}
	writer.Flush()

	c.Header("Content-Disposition", "attachment; filename=payments-export.csv")
	c.Data(http.StatusOK, "text/csv", buffer.Bytes())
}

func (h *Handler) ReconcileImport(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}

	var mapping bankImportMapping
	if mappingRaw := c.PostForm("mapping"); mappingRaw != "" {
		if err := json.Unmarshal([]byte(mappingRaw), &mapping); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mapping"})
			return
		}
	}

	if err := os.MkdirAll(h.Config.MediaDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare upload dir"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	filename := "bank-import-" + uuid.New().String() + ext
	filePath := filepath.Join(h.Config.MediaDir, filename)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	media := models.Media{
		Slug:      uuid.New(),
		Type:      "file",
		Path:      filePath,
		Mime:      file.Header.Get("Content-Type"),
		Size:      file.Size,
		CreatedBy: h.getActorID(c),
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&media).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record media"})
		return
	}

	headers, records, err := readBankImportRows(filePath, ext)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	columns, usedMapping, err := resolveMapping(headers, mapping)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	mappingPayload, _ := json.Marshal(usedMapping)
	bankImport := models.BankImport{
		Slug:        uuid.New(),
		ImportedBy:  h.getActorID(c),
		FileMediaID: media.ID,
		Mapping:     datatypes.JSON(mappingPayload),
		ImportedAt:  time.Now(),
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&bankImport).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record import"})
		return
	}

	var matches []models.ReconciliationMatch
	var rows []bankRow
	var errorsList []map[string]interface{}

	for i, record := range records {
		rowNumber := i + 2
		row, parseErr := buildBankRow(record, columns)
		if parseErr != nil {
			errorsList = append(errorsList, map[string]interface{}{
				"row":   rowNumber,
				"error": parseErr.Error(),
			})
			continue
		}

		row.RowNumber = rowNumber
		row.Hash = hashBankRow(row)

		var matchedPaymentID *uint
		if payment, err := findPaymentForReference(c.Request.Context(), h.DB, row.Reference); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to match payments"})
			return
		} else if payment != nil {
			row.Status = "matched"
			row.PaymentSlug = &payment.Slug
			matchedPaymentID = &payment.ID
		}
		if row.Status == "" {
			row.Status = "unmatched"
		}

		matchSlug := uuid.New()
		row.MatchSlug = matchSlug
		rowJSON, _ := json.Marshal(row)
		match := models.ReconciliationMatch{
			Slug:         matchSlug,
			BankImportID: bankImport.ID,
			BankRowHash:  row.Hash,
			Status:       row.Status,
			RowData:      datatypes.JSON(rowJSON),
		}
		if matchedPaymentID != nil {
			match.PaymentID = matchedPaymentID
		}
		matches = append(matches, match)
		rows = append(rows, row)
	}

	if len(matches) > 0 {
		if err := h.DB.WithContext(c.Request.Context()).Create(&matches).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record matches"})
			return
		}
	}

	matchedCount := 0
	for _, row := range rows {
		if row.Status == "matched" {
			matchedCount++
		}
	}

	h.logAudit(c, "finance.reconcile.import", "bank_import", bankImport.Slug.String(), nil, gin.H{
		"rows":    len(rows),
		"matches": matchedCount,
	})

	c.JSON(http.StatusOK, gin.H{
		"import_id": bankImport.Slug,
		"summary": gin.H{
			"total":     len(rows),
			"matched":   matchedCount,
			"unmatched": len(rows) - matchedCount,
			"errors":    len(errorsList),
		},
		"errors": errorsList,
		"rows":   rows,
	})
}

func (h *Handler) ReconcileMatch(c *gin.Context) {
	var req reconcileMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	matchSlug, err := uuid.Parse(req.MatchSlug)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid match slug"})
		return
	}

	var match models.ReconciliationMatch
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", matchSlug).First(&match).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "match not found"})
		return
	}

	paymentSlug, err := uuid.Parse(req.PaymentSlug)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payment slug"})
		return
	}

	var payment models.Payment
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", paymentSlug).First(&payment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "payment not found"})
		return
	}

	old := match
	match.PaymentID = &payment.ID
	match.Status = "matched"
	if req.Notes != "" {
		match.Notes = req.Notes
	}

	if err := h.DB.WithContext(c.Request.Context()).Save(&match).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update match"})
		return
	}

	h.logAudit(c, "finance.reconcile.match", "reconciliation_match", match.Slug.String(), old, match)
	c.JSON(http.StatusOK, match)
}

func (h *Handler) ReconcileResolve(c *gin.Context) {
	var req reconcileResolveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	matchSlug, err := uuid.Parse(req.MatchSlug)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid match slug"})
		return
	}

	var match models.ReconciliationMatch
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", matchSlug).First(&match).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "match not found"})
		return
	}

	old := match
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = "resolved"
	}
	match.Status = status
	if req.Notes != "" {
		match.Notes = req.Notes
	}
	actorID := h.getActorID(c)
	if actorID != 0 {
		match.ResolvedBy = &actorID
	}
	now := time.Now()
	match.ResolvedAt = &now

	if err := h.DB.WithContext(c.Request.Context()).Save(&match).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resolve match"})
		return
	}

	h.logAudit(c, "finance.reconcile.resolve", "reconciliation_match", match.Slug.String(), old, match)
	c.JSON(http.StatusOK, match)
}

func readBankImportRows(filePath, ext string) ([]string, [][]string, error) {
	switch ext {
	case ".xlsx", ".xls":
		file, err := excelize.OpenFile(filePath)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to read xlsx")
		}
		sheets := file.GetSheetList()
		if len(sheets) == 0 {
			return nil, nil, fmt.Errorf("missing sheet")
		}
		rows, err := file.GetRows(sheets[0])
		if err != nil {
			return nil, nil, fmt.Errorf("failed to read sheet")
		}
		if len(rows) < 2 {
			return nil, nil, fmt.Errorf("missing rows")
		}
		return rows[0], rows[1:], nil
	default:
		f, err := os.Open(filePath)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to read file")
		}
		defer f.Close()

		reader := csv.NewReader(f)
		reader.TrimLeadingSpace = true
		reader.FieldsPerRecord = -1
		records, err := reader.ReadAll()
		if err != nil && !errors.Is(err, io.EOF) {
			return nil, nil, fmt.Errorf("failed to parse csv")
		}
		if len(records) < 2 {
			return nil, nil, fmt.Errorf("missing rows")
		}
		return records[0], records[1:], nil
	}
}

type columnMap struct {
	Date        int
	Amount      int
	Reference   int
	Description int
	Currency    int
}

func resolveMapping(headers []string, mapping bankImportMapping) (columnMap, map[string]string, error) {
	headerIndex := map[string]int{}
	for i, header := range headers {
		headerIndex[normalizeHeader(header)] = i
	}

	resolve := func(value string, candidates []string) (int, string) {
		if value != "" {
			if idx, err := strconv.Atoi(value); err == nil {
				if idx > 0 && idx <= len(headers) {
					return idx - 1, headers[idx-1]
				}
			}
			if idx, ok := headerIndex[normalizeHeader(value)]; ok {
				return idx, headers[idx]
			}
		}
		for _, candidate := range candidates {
			if idx, ok := headerIndex[normalizeHeader(candidate)]; ok {
				return idx, headers[idx]
			}
		}
		return -1, ""
	}

	amountIdx, amountHeader := resolve(mapping.Amount, []string{"amount", "paid", "credit", "debit", "value"})
	refIdx, refHeader := resolve(mapping.Reference, []string{"reference", "ref", "transaction", "receipt", "code"})
	dateIdx, dateHeader := resolve(mapping.Date, []string{"date", "transaction date", "posted date", "value date"})
	descIdx, descHeader := resolve(mapping.Description, []string{"description", "details", "narration", "memo"})
	currencyIdx, currencyHeader := resolve(mapping.Currency, []string{"currency", "ccy"})

	if amountIdx < 0 || refIdx < 0 {
		return columnMap{}, nil, fmt.Errorf("amount and reference columns required")
	}

	used := map[string]string{
		"amount":    amountHeader,
		"reference": refHeader,
	}
	if dateIdx >= 0 {
		used["date"] = dateHeader
	}
	if descIdx >= 0 {
		used["description"] = descHeader
	}
	if currencyIdx >= 0 {
		used["currency"] = currencyHeader
	}

	return columnMap{
		Date:        dateIdx,
		Amount:      amountIdx,
		Reference:   refIdx,
		Description: descIdx,
		Currency:    currencyIdx,
	}, used, nil
}

func buildBankRow(record []string, columns columnMap) (bankRow, error) {
	valueAt := func(idx int) string {
		if idx < 0 || idx >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[idx])
	}

	amountValue := valueAt(columns.Amount)
	if amountValue == "" {
		return bankRow{}, fmt.Errorf("missing amount")
	}
	amountMinor, err := parseAmountMinor(amountValue)
	if err != nil {
		return bankRow{}, fmt.Errorf("invalid amount")
	}

	reference := valueAt(columns.Reference)
	if reference == "" {
		return bankRow{}, fmt.Errorf("missing reference")
	}

	currency := valueAt(columns.Currency)
	if currency == "" {
		currency = "KES"
	}

	return bankRow{
		Date:        valueAt(columns.Date),
		AmountMinor: amountMinor,
		Currency:    strings.ToUpper(currency),
		Reference:   reference,
		Description: valueAt(columns.Description),
	}, nil
}

func parseAmountMinor(value string) (int, error) {
	cleaned := strings.TrimSpace(value)
	if cleaned == "" {
		return 0, fmt.Errorf("empty amount")
	}
	negative := false
	if strings.HasPrefix(cleaned, "(") && strings.HasSuffix(cleaned, ")") {
		negative = true
		cleaned = strings.TrimSuffix(strings.TrimPrefix(cleaned, "("), ")")
	}
	builder := strings.Builder{}
	for _, r := range cleaned {
		if (r >= '0' && r <= '9') || r == '.' || r == '-' {
			builder.WriteRune(r)
		}
	}
	cleaned = builder.String()
	amount, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return 0, err
	}
	minor := int(mathRound(amount * 100))
	if negative {
		minor = -minor
	}
	return minor, nil
}

func mathRound(value float64) float64 {
	if value < 0 {
		return float64(int(value - 0.5))
	}
	return float64(int(value + 0.5))
}

func findPaymentForReference(ctx context.Context, db *gorm.DB, reference string) (*models.Payment, error) {
	if reference == "" {
		return nil, nil
	}

	var payment models.Payment
	if err := db.WithContext(ctx).
		Where("status = 'success' AND (provider_ref = ? OR metadata ->> 'mpesa_receipt' = ?)", reference, reference).
		First(&payment).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &payment, nil
}

func hashBankRow(row bankRow) string {
	payload := fmt.Sprintf("%s|%d|%s|%s|%s", row.Date, row.AmountMinor, row.Currency, row.Reference, row.Description)
	sum := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(sum[:])
}

func normalizeHeader(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func parseDateRange(c *gin.Context) (*time.Time, *time.Time, error) {
	var startAt *time.Time
	var endAt *time.Time
	if startRaw := c.Query("start"); startRaw != "" {
		parsed, err := time.Parse(time.RFC3339, startRaw)
		if err != nil {
			return nil, nil, err
		}
		startAt = &parsed
	}
	if endRaw := c.Query("end"); endRaw != "" {
		parsed, err := time.Parse(time.RFC3339, endRaw)
		if err != nil {
			return nil, nil, err
		}
		endAt = &parsed
	}
	return startAt, endAt, nil
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (h *Handler) logAudit(c *gin.Context, action, entityType, entityID string, oldValue interface{}, newValue interface{}) {
	actorID := h.getActorID(c)
	if actorID == 0 {
		return
	}

	oldJSON, _ := json.Marshal(oldValue)
	newJSON, _ := json.Marshal(newValue)

	_ = h.Audit.Log(c.Request.Context(), audit.Entry{
		ActorUserID: actorID,
		ActionKey:   action,
		EntityType:  entityType,
		EntityID:    entityID,
		OldJSON:     oldJSON,
		NewJSON:     newJSON,
		IP:          c.ClientIP(),
		UserAgent:   c.GetHeader("User-Agent"),
	})
}

func (h *Handler) getActorID(c *gin.Context) uint {
	claimsValue, exists := c.Get("authClaims")
	if !exists {
		return 0
	}
	claims, ok := claimsValue.(*auth.Claims)
	if !ok {
		return 0
	}
	return claims.UserID
}
