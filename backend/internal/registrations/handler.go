package registrations

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/pdf"
	"ecostride/backend/internal/jobs"
	"ecostride/backend/internal/receipts"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Handler exposes registration HTTP handlers.
type Handler struct {
	Service  *Service
	Audit    *audit.Service
	DB       *gorm.DB
	Config   config.Config
	Jobs     *jobs.Service
	Receipts *receipts.Service
}

func NewHandler(service *Service, auditService *audit.Service, db *gorm.DB, cfg config.Config, jobsService *jobs.Service, receiptService *receipts.Service) *Handler {
	return &Handler{Service: service, Audit: auditService, DB: db, Config: cfg, Jobs: jobsService, Receipts: receiptService}
}

type createRequest struct {
	EventSlug          string          `json:"event_slug" binding:"required"`
	CategorySlug       *string         `json:"category_slug"`
	AthleteName        string          `json:"athlete_name" binding:"required"`
	Email              string          `json:"email" binding:"required,email"`
	Phone              string          `json:"phone" binding:"required,phone"`
	Dob                *time.Time      `json:"dob"`
	Gender             string          `json:"gender"`
	Nationality        string          `json:"nationality"`
	Residence          string          `json:"residence"`
	TshirtSize         string          `json:"tshirt_size"`
	EmergencyName      string          `json:"emergency_name"`
	EmergencyPhone     string          `json:"emergency_phone" binding:"omitempty,phone"`
	MedicalDeclaration string          `json:"medical_declaration"`
	Experience         string          `json:"experience"`
	Extras             json.RawMessage `json:"extras"`
}

type updateRequest struct {
	AthleteName    *string    `json:"athlete_name"`
	Email          *string    `json:"email"`
	Phone          *string    `json:"phone"`
	TshirtSize     *string    `json:"tshirt_size"`
	EmergencyName  *string    `json:"emergency_name"`
	EmergencyPhone *string    `json:"emergency_phone"`
	Status         *string    `json:"status"`
	Dob            *time.Time `json:"dob"`
	Gender         *string    `json:"gender"`
	Nationality    *string    `json:"nationality"`
	Residence      *string    `json:"residence"`
	Experience     *string    `json:"experience"`
}

type registrationExportRow struct {
	RegistrationSlug string    `json:"registration_slug"`
	EventTitle       string    `json:"event_title"`
	CategoryName     *string   `json:"category_name"`
	AthleteName      string    `json:"athlete_name"`
	Email            string    `json:"email"`
	Phone            string    `json:"phone"`
	Gender           string    `json:"gender"`
	Nationality      string    `json:"nationality"`
	Residence        string    `json:"residence"`
	Status           string    `json:"status"`
	BibNumber        *int      `json:"bib_number"`
	CreatedAt        time.Time `json:"created_at"`
}

type registrationJobPayload struct {
	RegistrationID uint `json:"registration_id"`
}

type registrationPublicDetail struct {
	Slug         string    `json:"slug"`
	AthleteName  string    `json:"athlete_name"`
	Email        string    `json:"email"`
	Status       string    `json:"status"`
	EventSlug    string    `json:"event_slug"`
	EventTitle   string    `json:"event_title"`
	EventStartAt time.Time `json:"event_start_at"`
	CategoryName *string   `json:"category_name"`
	CreatedAt    time.Time `json:"created_at"`
}

type registrationListItem struct {
	Slug               string     `json:"slug"`
	AthleteName        string     `json:"athlete_name"`
	Email              string     `json:"email"`
	Phone              string     `json:"phone"`
	Status             string     `json:"status"`
	EventSlug          string     `json:"event_slug"`
	EventTitle         string     `json:"event_title"`
	EventStartAt       time.Time  `json:"event_start_at"`
	EventType          string     `json:"event_type"`
	CategoryName       *string    `json:"category_name"`
	BibNumber          *int       `json:"bib_number"`
	PaymentStatus      *string    `json:"payment_status"`
	PaymentAmountMinor *int       `json:"payment_amount_minor"`
	PaymentCurrency    *string    `json:"payment_currency"`
	PaymentProvider    *string    `json:"payment_provider"`
	CheckedInAt        *time.Time `json:"checked_in_at"`
	BibCollectedAt     *time.Time `json:"bib_collected_at"`
	PackCollectedAt    *time.Time `json:"pack_collected_at"`
	CreatedAt          time.Time  `json:"created_at"`
}

func (h *Handler) CreatePublicRegistration(c *gin.Context) {
	var req createRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	event, err := h.findEventBySlug(c, req.EventSlug)
	if err != nil {
		return
	}

	if event.Status != "published" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "registration not available"})
		return
	}

	if !registrationWindowOpen(event) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "registration closed"})
		return
	}

	category, err := h.resolveCategory(c, event.ID, req.CategorySlug)
	if err != nil {
		return
	}

	if err := h.ensureNoDuplicate(c, event.ID, req.Email); err != nil {
		return
	}

	waiver, err := h.currentWaiver(c, event.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "waiver not available"})
		return
	}

	extrasPayload := map[string]interface{}{}
	if len(req.Extras) > 0 {
		if err := json.Unmarshal(req.Extras, &extrasPayload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid extras"})
			return
		}
	}
	if err := h.validateFormFields(c.Request.Context(), event.ID, extrasPayload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := "pending_payment"
	if category == nil || isCategoryFree(*category) {
		status = "confirmed"
	}

	var extrasJSON datatypes.JSON
	if len(req.Extras) > 0 {
		extrasJSON = datatypes.JSON(req.Extras)
	} else {
		extrasJSON = datatypes.JSON([]byte("{}"))
	}

	var categoryID *uint
	if category != nil {
		categoryID = &category.ID
	}

	registration := models.Registration{
		Slug:               uuid.New(),
		EventID:            event.ID,
		CategoryID:         categoryID,
		AthleteName:        req.AthleteName,
		Email:              req.Email,
		Phone:              req.Phone,
		Dob:                req.Dob,
		Gender:             req.Gender,
		Nationality:        req.Nationality,
		Residence:          req.Residence,
		TshirtSize:         req.TshirtSize,
		EmergencyName:      req.EmergencyName,
		EmergencyPhone:     req.EmergencyPhone,
		MedicalDeclaration: req.MedicalDeclaration,
		Experience:         req.Experience,
		Extras:             extrasJSON,
		Status:             status,
	}

	consent := models.ConsentRecord{
		Slug:            uuid.New(),
		WaiverVersionID: waiver.ID,
		AcceptedAt:      time.Now(),
		IP:              c.ClientIP(),
		UserAgent:       c.GetHeader("User-Agent"),
	}

	created, err := h.Service.CreateRegistration(c.Request.Context(), registration, consent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create registration"})
		return
	}

	if h.Jobs != nil {
		payload := registrationJobPayload{RegistrationID: created.ID}
		_, _ = h.Jobs.Enqueue(c.Request.Context(), "registration.confirmation", payload, time.Now())
	} else {
		_ = SendConfirmationEmail(c.Request.Context(), h.Config, h.DB, created.ID)
	}

	c.JSON(http.StatusCreated, created)
}

func (h *Handler) GetPublicRegistration(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration id"})
		return
	}

	var detail registrationPublicDetail
	query := h.DB.WithContext(c.Request.Context()).
		Table("registrations").
		Select(`
			registrations.slug,
			registrations.athlete_name,
			registrations.email,
			registrations.status,
			registrations.created_at,
			events.url_slug as event_slug,
			events.title as event_title,
			events.start_at as event_start_at,
			event_categories.name as category_name
		`).
		Joins("LEFT JOIN events ON events.id = registrations.event_id").
		Joins("LEFT JOIN event_categories ON event_categories.id = registrations.category_id").
		Where("registrations.slug = ?", slug).
		Scan(&detail)
	if query.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load registration"})
		return
	}
	if query.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	c.JSON(http.StatusOK, detail)
}

func (h *Handler) GetPublicConfirmationPDF(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration id"})
		return
	}

	registration, err := h.Service.GetRegistrationBySlug(c.Request.Context(), slug.String())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	var event models.Event
	if err := h.DB.WithContext(c.Request.Context()).Where("id = ?", registration.EventID).First(&event).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "event not found"})
		return
	}

	var category *models.EventCategory
	if registration.CategoryID != nil {
		var cat models.EventCategory
		if err := h.DB.WithContext(c.Request.Context()).Where("id = ?", *registration.CategoryID).First(&cat).Error; err == nil {
			category = &cat
		}
	}

	pdfBytes, err := buildConfirmationPDF(registration, event, category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build pdf"})
		return
	}

	filename := fmt.Sprintf("registration-%s.pdf", registration.Slug.String())
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Data(http.StatusOK, "application/pdf", pdfBytes)
}

func (h *Handler) ListRegistrations(c *gin.Context) {
	var eventID *uint
	if eventSlug := c.Query("event_slug"); eventSlug != "" {
		event, err := h.findEventBySlug(c, eventSlug)
		if err != nil {
			return
		}
		eventID = &event.ID
	}

	status := c.Query("status")
	paymentsSub := h.DB.WithContext(c.Request.Context()).
		Table("payments").
		Select("DISTINCT ON (registration_id) registration_id, status, amount_minor, currency, provider").
		Where("registration_id IS NOT NULL").
		Order("registration_id, created_at desc")

	query := h.DB.WithContext(c.Request.Context()).
		Table("registrations").
		Select(`
			registrations.slug,
			registrations.athlete_name,
			registrations.email,
			registrations.phone,
			registrations.status,
			registrations.created_at,
			events.slug as event_slug,
			events.title as event_title,
			events.start_at as event_start_at,
			events.type as event_type,
			event_categories.name as category_name,
			bib_assignments.bib_number,
			checkins.checked_in_at,
			checkins.bib_collected_at,
			checkins.pack_collected_at,
			payments.status as payment_status,
			payments.amount_minor as payment_amount_minor,
			payments.currency as payment_currency,
			payments.provider as payment_provider
		`).
		Joins("LEFT JOIN events ON events.id = registrations.event_id").
		Joins("LEFT JOIN event_categories ON event_categories.id = registrations.category_id").
		Joins("LEFT JOIN bib_assignments ON bib_assignments.registration_id = registrations.id").
		Joins("LEFT JOIN checkins ON checkins.registration_id = registrations.id").
		Joins("LEFT JOIN (?) AS payments ON payments.registration_id = registrations.id", paymentsSub)

	if eventID != nil {
		query = query.Where("registrations.event_id = ?", *eventID)
	}
	if status != "" {
		query = query.Where("registrations.status = ?", status)
	}

	var registrations []registrationListItem
	if err := query.Order("registrations.created_at desc").Scan(&registrations).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list registrations"})
		return
	}

	c.JSON(http.StatusOK, registrations)
}

func (h *Handler) ExportRegistrations(c *gin.Context) {
	format := strings.ToLower(c.DefaultQuery("format", "csv"))
	if format != "csv" && format != "xlsx" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported format"})
		return
	}

	query := h.DB.WithContext(c.Request.Context()).
		Table("registrations").
		Select(`
			registrations.slug as registration_slug,
			events.title as event_title,
			event_categories.name as category_name,
			registrations.athlete_name,
			registrations.email,
			registrations.phone,
			registrations.gender,
			registrations.nationality,
			registrations.residence,
			registrations.status,
			bib_assignments.bib_number,
			registrations.created_at`).
		Joins("LEFT JOIN events ON events.id = registrations.event_id").
		Joins("LEFT JOIN event_categories ON event_categories.id = registrations.category_id").
		Joins("LEFT JOIN bib_assignments ON bib_assignments.registration_id = registrations.id")

	if eventSlug := c.Query("event_slug"); eventSlug != "" {
		event, err := h.findEventBySlug(c, eventSlug)
		if err != nil {
			return
		}
		query = query.Where("registrations.event_id = ?", event.ID)
	}

	if status := c.Query("status"); status != "" {
		query = query.Where("registrations.status = ?", status)
	}

	var rows []registrationExportRow
	if err := query.Order("registrations.created_at desc").Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to export registrations"})
		return
	}

	headers := []string{
		"registration_slug",
		"event_title",
		"category_name",
		"athlete_name",
		"email",
		"phone",
		"gender",
		"nationality",
		"residence",
		"status",
		"bib_number",
		"created_at",
	}

	data := make([][]string, 0, len(rows)+1)
	data = append(data, headers)
	for _, row := range rows {
		bib := ""
		if row.BibNumber != nil {
			bib = strconv.Itoa(*row.BibNumber)
		}

		data = append(data, []string{
			row.RegistrationSlug,
			row.EventTitle,
			optionalString(row.CategoryName),
			row.AthleteName,
			row.Email,
			row.Phone,
			row.Gender,
			row.Nationality,
			row.Residence,
			row.Status,
			bib,
			row.CreatedAt.Format(time.RFC3339),
		})
	}

	h.logAudit(c, "registration.export", "registration", "", nil, gin.H{"format": format, "rows": len(rows)})

	if format == "xlsx" {
		file := excelize.NewFile()
		sheet := "Registrations"
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
		c.Header("Content-Disposition", "attachment; filename=registrations-export.xlsx")
		c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf.Bytes())
		return
	}

	buffer := &bytes.Buffer{}
	writer := csv.NewWriter(buffer)
	if err := writer.WriteAll(data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build csv"})
		return
	}
	writer.Flush()

	c.Header("Content-Disposition", "attachment; filename=registrations-export.csv")
	c.Data(http.StatusOK, "text/csv", buffer.Bytes())
}

func (h *Handler) GetRegistration(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration id"})
		return
	}

	registration, err := h.Service.GetRegistrationBySlug(c.Request.Context(), slug.String())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	c.JSON(http.StatusOK, registration)
}

func (h *Handler) UpdateRegistration(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration id"})
		return
	}

	registration, err := h.Service.GetRegistrationBySlug(c.Request.Context(), slug.String())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	old := registration

	var req updateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	if req.AthleteName != nil {
		registration.AthleteName = *req.AthleteName
	}
	if req.Email != nil {
		registration.Email = *req.Email
	}
	if req.Phone != nil {
		registration.Phone = *req.Phone
	}
	if req.TshirtSize != nil {
		registration.TshirtSize = *req.TshirtSize
	}
	if req.EmergencyName != nil {
		registration.EmergencyName = *req.EmergencyName
	}
	if req.EmergencyPhone != nil {
		registration.EmergencyPhone = *req.EmergencyPhone
	}
	if req.Status != nil {
		registration.Status = *req.Status
	}
	if req.Dob != nil {
		registration.Dob = req.Dob
	}
	if req.Gender != nil {
		registration.Gender = *req.Gender
	}
	if req.Nationality != nil {
		registration.Nationality = *req.Nationality
	}
	if req.Residence != nil {
		registration.Residence = *req.Residence
	}
	if req.Experience != nil {
		registration.Experience = *req.Experience
	}

	updated, err := h.Service.UpdateRegistration(c.Request.Context(), registration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update registration"})
		return
	}

	h.logAudit(c, "registration.update", "registration", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) CancelRegistration(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration id"})
		return
	}

	registration, err := h.Service.GetRegistrationBySlug(c.Request.Context(), slug.String())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	old := registration

	updated, err := h.Service.CancelRegistration(c.Request.Context(), registration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel registration"})
		return
	}

	h.logAudit(c, "registration.cancel", "registration", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) ResendConfirmation(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration id"})
		return
	}

	registration, err := h.Service.GetRegistrationBySlug(c.Request.Context(), slug.String())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	if h.Jobs != nil {
		payload := registrationJobPayload{RegistrationID: registration.ID}
		_, _ = h.Jobs.Enqueue(c.Request.Context(), "registration.confirmation", payload, time.Now())
	} else {
		_ = SendConfirmationEmail(c.Request.Context(), h.Config, h.DB, registration.ID)
	}

	h.logAudit(c, "registration.resend.confirmation", "registration", registration.Slug.String(), nil, gin.H{"status": "queued"})
	c.JSON(http.StatusOK, gin.H{"status": "queued"})
}

func (h *Handler) ResendReceipt(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration id"})
		return
	}

	registration, err := h.Service.GetRegistrationBySlug(c.Request.Context(), slug.String())
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	var payment models.Payment
	if err := h.DB.WithContext(c.Request.Context()).
		Where("registration_id = ? AND status = 'success'", registration.ID).
		Order("created_at desc").
		First(&payment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "payment not found"})
		return
	}

	if h.Receipts == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "receipt service unavailable"})
		return
	}

	if _, err := h.Receipts.IssueReceipt(c.Request.Context(), payment, registration.Email); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to queue receipt"})
		return
	}

	h.logAudit(c, "registration.resend.receipt", "registration", registration.Slug.String(), nil, gin.H{"status": "queued"})
	c.JSON(http.StatusOK, gin.H{"status": "queued"})
}

func (h *Handler) findEventBySlug(c *gin.Context, slug string) (models.Event, error) {
	var event models.Event
	if err := h.DB.WithContext(c.Request.Context()).Where("url_slug = ?", slug).First(&event).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return models.Event{}, err
	}
	return event, nil
}

func (h *Handler) resolveCategory(c *gin.Context, eventID uint, slug *string) (*models.EventCategory, error) {
	if slug == nil {
		return nil, nil
	}

	parsed, err := uuid.Parse(*slug)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category slug"})
		return nil, err
	}

	var category models.EventCategory
	if err := h.DB.WithContext(c.Request.Context()).
		Where("slug = ? AND event_id = ?", parsed, eventID).
		First(&category).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "category not found"})
		return nil, err
	}

	return &category, nil
}

func (h *Handler) currentWaiver(c *gin.Context, eventID uint) (models.WaiverVersion, error) {
	var waiver models.WaiverVersion

	err := h.DB.WithContext(c.Request.Context()).
		Where("scope = ? AND event_id = ? AND is_current = true", "EVENT", eventID).
		First(&waiver).Error
	if err == nil {
		return waiver, nil
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.WaiverVersion{}, err
	}

	if err := h.DB.WithContext(c.Request.Context()).
		Where("scope = ? AND event_id IS NULL AND is_current = true", "GLOBAL").
		First(&waiver).Error; err != nil {
		return models.WaiverVersion{}, err
	}

	return waiver, nil
}

func (h *Handler) ensureNoDuplicate(c *gin.Context, eventID uint, email string) error {
	var existing models.Registration
	if err := h.DB.WithContext(c.Request.Context()).
		Where("event_id = ? AND email = ? AND status IN ('created','pending_payment','paid','confirmed')", eventID, email).
		First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "registration already exists"})
		return errors.New("duplicate")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate registration"})
		return err
	}

	return nil
}

func registrationWindowOpen(event models.Event) bool {
	now := time.Now()
	if event.RegOpenAt != nil && now.Before(*event.RegOpenAt) {
		return false
	}
	if event.RegCloseAt != nil && now.After(*event.RegCloseAt) {
		return false
	}
	return true
}

func (h *Handler) validateFormFields(ctx context.Context, eventID uint, extras map[string]interface{}) error {
	var fields []models.EventFormField
	if err := h.DB.WithContext(ctx).Where("event_id = ?", eventID).Order(`"order" asc`).Find(&fields).Error; err != nil {
		return fmt.Errorf("failed to validate form fields")
	}
	if len(fields) == 0 {
		return nil
	}

	formValues := map[string]interface{}{}
	if raw, ok := extras["form_fields"]; ok {
		if cast, ok := raw.(map[string]interface{}); ok {
			formValues = cast
		}
	}

	missing := make([]string, 0)
	for _, field := range fields {
		if !field.Required {
			continue
		}
		value, ok := formValues[field.Key]
		if !ok || formFieldValueEmpty(value, field.Type) {
			if field.Label != "" {
				missing = append(missing, field.Label)
			} else {
				missing = append(missing, field.Key)
			}
		}
	}

	if len(missing) > 0 {
		return fmt.Errorf("missing required fields: %s", strings.Join(missing, ", "))
	}

	return nil
}

func formFieldValueEmpty(value interface{}, fieldType string) bool {
	switch v := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(v) == ""
	case bool:
		if fieldType == "checkbox" {
			return !v
		}
		return false
	case float64:
		return false
	case int:
		return false
	case []interface{}:
		return len(v) == 0
	default:
		return false
	}
}

func isCategoryFree(category models.EventCategory) bool {
	if category.PriceKESMinor != 0 {
		return false
	}
	if category.PriceUSDMinor != nil && *category.PriceUSDMinor != 0 {
		return false
	}
	if category.PriceEURMinor != nil && *category.PriceEURMinor != 0 {
		return false
	}
	return true
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

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func buildConfirmationPDF(registration models.Registration, event models.Event, category *models.EventCategory) ([]byte, error) {
	lines := []string{
		"EcoStride Registration Confirmation",
		fmt.Sprintf("Event: %s", event.Title),
		fmt.Sprintf("Date: %s", event.StartAt.Format("2006-01-02 15:04")),
		fmt.Sprintf("Athlete: %s", registration.AthleteName),
		fmt.Sprintf("Email: %s", registration.Email),
		fmt.Sprintf("Status: %s", registration.Status),
		fmt.Sprintf("Confirmation Code: %s", registration.Slug.String()),
	}
	if category != nil {
		lines = append(lines, fmt.Sprintf("Category: %s", category.Name))
	}

	return pdf.BuildSimplePDF(lines), nil
}
