package volunteers

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/dto"
	"ecostride/backend/internal/common/email"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/jobs"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

func canonicalizeVolunteerPreferences(raw json.RawMessage) datatypes.JSON {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		normalized, _ := json.Marshal(map[string]any{"roles": []string{}, "event_slug": nil})
		return datatypes.JSON(normalized)
	}

	// If client sent an array (legacy), treat it as roles.
	if strings.HasPrefix(trimmed, "[") {
		var roles []string
		if err := json.Unmarshal(raw, &roles); err == nil {
			normalized, _ := json.Marshal(map[string]any{"roles": roles, "event_slug": nil})
			return datatypes.JSON(normalized)
		}
	}

	// If client sent object (preferred).
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err == nil {
		rolesVal, _ := obj["roles"].([]any)
		roles := make([]string, 0)
		for _, v := range rolesVal {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				roles = append(roles, s)
			}
		}
		eventSlug, _ := obj["event_slug"].(string)
		if strings.TrimSpace(eventSlug) == "" {
			eventSlug = ""
		}
		var eventSlugPtr any = nil
		if strings.TrimSpace(eventSlug) != "" {
			eventSlugPtr = eventSlug
		}
		normalized, _ := json.Marshal(map[string]any{"roles": roles, "event_slug": eventSlugPtr})
		return datatypes.JSON(normalized)
	}

	normalized, _ := json.Marshal(map[string]any{"roles": []string{}, "event_slug": nil})
	return datatypes.JSON(normalized)
}

// Handler exposes volunteer HTTP handlers.
type Handler struct {
	Service *Service
	Audit   *audit.Service
	DB      *gorm.DB
	Config  config.Config
	Jobs    *jobs.Service
}

func NewHandler(service *Service, auditService *audit.Service, db *gorm.DB, cfg config.Config, jobsService *jobs.Service) *Handler {
	return &Handler{Service: service, Audit: auditService, DB: db, Config: cfg, Jobs: jobsService}
}

type volunteerRequest struct {
	Name        string          `json:"name" binding:"required"`
	Email       string          `json:"email" binding:"required,email"`
	Phone       string          `json:"phone" binding:"omitempty,phone"`
	Preferences json.RawMessage `json:"preferences"`
	Notes       string          `json:"notes"`
}

type assignmentRequest struct {
	EventSlug  *string    `json:"event_slug"`
	RoleName   string     `json:"role_name" binding:"required"`
	ShiftStart *time.Time `json:"shift_start"`
	ShiftEnd   *time.Time `json:"shift_end"`
	Location   string     `json:"location"`
	Status     string     `json:"status"`
}

type broadcastRequest struct {
	Subject string `json:"subject"`
	Message string `json:"message" binding:"required"`
}

type volunteerExportRow struct {
	VolunteerSlug string
	Name          string
	Email         string
	Phone         string
	EventTitle    *string
	RoleName      *string
	Status        *string
	ShiftStart    *time.Time
	ShiftEnd      *time.Time
	Location      *string
}

func (h *Handler) CreatePublicVolunteer(c *gin.Context) {
	var req volunteerRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	volunteer := models.Volunteer{
		Slug:        uuid.New(),
		Name:        req.Name,
		Email:       req.Email,
		Phone:       req.Phone,
		Preferences: canonicalizeVolunteerPreferences(req.Preferences),
		Notes:       req.Notes,
	}

	created, err := h.Service.CreateVolunteer(c.Request.Context(), volunteer)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create volunteer", nil)
		return
	}

	c.JSON(http.StatusCreated, dto.VolunteerFromModel(created))
}

func (h *Handler) ListVolunteers(c *gin.Context) {
	type assignmentItem struct {
		RoleName   string     `json:"role_name"`
		Status     string     `json:"status"`
		EventTitle *string    `json:"event_title"`
		EventSlug  *string    `json:"event_slug"`
		ShiftStart *time.Time `json:"shift_start"`
		ShiftEnd   *time.Time `json:"shift_end"`
		Location   string     `json:"location"`
	}

	type volunteerItem struct {
		Slug        string           `json:"slug"`
		Name        string           `json:"name"`
		Email       string           `json:"email"`
		Phone       string           `json:"phone"`
		Preferences datatypes.JSON   `json:"preferences"`
		Notes       string           `json:"notes"`
		CreatedAt   time.Time        `json:"created_at"`
		Assignments []assignmentItem `json:"assignments"`
	}

	volunteers, err := h.Service.ListVolunteers(c.Request.Context())
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list volunteers", nil)
		return
	}
	if len(volunteers) == 0 {
		c.JSON(http.StatusOK, []volunteerItem{})
		return
	}

	volunteerIDs := make([]uint, 0, len(volunteers))
	index := map[uint]int{}
	items := make([]volunteerItem, 0, len(volunteers))
	for i, volunteer := range volunteers {
		volunteerIDs = append(volunteerIDs, volunteer.ID)
		index[volunteer.ID] = i
		items = append(items, volunteerItem{
			Slug:        volunteer.Slug.String(),
			Name:        volunteer.Name,
			Email:       volunteer.Email,
			Phone:       volunteer.Phone,
			Preferences: canonicalizeVolunteerPreferences(json.RawMessage(volunteer.Preferences)),
			Notes:       volunteer.Notes,
			CreatedAt:   volunteer.CreatedAt,
			Assignments: []assignmentItem{},
		})
	}

	type assignmentRow struct {
		VolunteerID uint
		RoleName    string
		Status      string
		EventTitle  *string
		EventSlug   *string
		ShiftStart  *time.Time
		ShiftEnd    *time.Time
		Location    string
	}

	var assignments []assignmentRow
	if err := h.DB.WithContext(c.Request.Context()).
		Table("volunteer_assignments").
		Select(`
			volunteer_assignments.volunteer_id,
			volunteer_assignments.role_name,
			volunteer_assignments.status,
			volunteer_assignments.shift_start,
			volunteer_assignments.shift_end,
			volunteer_assignments.location,
			events.title as event_title,
			events.url_slug as event_slug
		`).
		Joins("LEFT JOIN events ON events.id = volunteer_assignments.event_id").
		Where("volunteer_assignments.volunteer_id IN ?", volunteerIDs).
		Order("volunteer_assignments.created_at desc").
		Scan(&assignments).Error; err == nil {
		for _, assignment := range assignments {
			pos, ok := index[assignment.VolunteerID]
			if !ok {
				continue
			}
			items[pos].Assignments = append(items[pos].Assignments, assignmentItem{
				RoleName:   assignment.RoleName,
				Status:     assignment.Status,
				EventTitle: assignment.EventTitle,
				EventSlug:  assignment.EventSlug,
				ShiftStart: assignment.ShiftStart,
				ShiftEnd:   assignment.ShiftEnd,
				Location:   assignment.Location,
			})
		}
	}

	c.JSON(http.StatusOK, items)
}

func (h *Handler) AssignVolunteer(c *gin.Context) {
	volunteerSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid volunteer id", nil)
		return
	}

	var volunteer models.Volunteer
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", volunteerSlug).First(&volunteer).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "volunteer not found", nil)
		return
	}

	var req assignmentRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	var eventID *uint
	if req.EventSlug != nil {
		var event models.Event
		if err := h.DB.WithContext(c.Request.Context()).Where("url_slug = ?", *req.EventSlug).First(&event).Error; err == nil {
			eventID = &event.ID
		}
	}

	assignment := models.VolunteerAssignment{
		Slug:        uuid.New(),
		VolunteerID: volunteer.ID,
		EventID:     eventID,
		RoleName:    req.RoleName,
		ShiftStart:  req.ShiftStart,
		ShiftEnd:    req.ShiftEnd,
		Location:    req.Location,
		Status:      req.Status,
	}

	created, err := h.Service.AssignVolunteer(c.Request.Context(), assignment)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to assign volunteer", nil)
		return
	}

	h.logAudit(c, "volunteer.assign", "volunteer_assignment", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, dto.VolunteerAssignmentFromModel(created))
}

func (h *Handler) Communicate(c *gin.Context) {
	var req broadcastRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	payload := map[string]string{
		"subject": req.Subject,
		"message": req.Message,
	}

	if h.Jobs != nil {
		_, _ = h.Jobs.Enqueue(c.Request.Context(), "volunteer.broadcast", payload, time.Now())
	} else {
		var volunteers []models.Volunteer
		if err := h.DB.WithContext(c.Request.Context()).Find(&volunteers).Error; err != nil {
			apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to load volunteers", nil)
			return
		}
		subject := req.Subject
		if subject == "" {
			subject = "EcoStride Volunteer Update"
		}
		for _, volunteer := range volunteers {
			if volunteer.Email == "" {
				continue
			}
			if err := email.Send(h.Config, volunteer.Email, subject, req.Message); err != nil {
				apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to send broadcast", nil)
				return
			}
		}
	}

	h.logAudit(c, "volunteer.communicate", "volunteer", "", nil, payload)
	c.JSON(http.StatusOK, dto.SuccessResponse{Status: "queued"})
}

func (h *Handler) Export(c *gin.Context) {
	format := strings.ToLower(c.DefaultQuery("format", "csv"))
	if format != "csv" && format != "xlsx" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "unsupported format", nil)
		return
	}

	var rows []volunteerExportRow
	if err := h.DB.WithContext(c.Request.Context()).
		Table("volunteers").
		Select(`
			volunteers.slug as volunteer_slug,
			volunteers.name,
			volunteers.email,
			volunteers.phone,
			events.title as event_title,
			volunteer_assignments.role_name,
			volunteer_assignments.status,
			volunteer_assignments.shift_start,
			volunteer_assignments.shift_end,
			volunteer_assignments.location`).
		Joins("LEFT JOIN volunteer_assignments ON volunteer_assignments.volunteer_id = volunteers.id").
		Joins("LEFT JOIN events ON events.id = volunteer_assignments.event_id").
		Order("volunteers.created_at desc").
		Scan(&rows).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to export volunteers", nil)
		return
	}

	headers := []string{
		"volunteer_slug",
		"name",
		"email",
		"phone",
		"event_title",
		"role_name",
		"status",
		"shift_start",
		"shift_end",
		"location",
	}

	data := make([][]string, 0, len(rows)+1)
	data = append(data, headers)
	for _, row := range rows {
		data = append(data, []string{
			row.VolunteerSlug,
			row.Name,
			row.Email,
			row.Phone,
			optionalString(row.EventTitle),
			optionalString(row.RoleName),
			optionalString(row.Status),
			formatTime(row.ShiftStart),
			formatTime(row.ShiftEnd),
			optionalString(row.Location),
		})
	}

	h.logAudit(c, "volunteer.export", "volunteer", "", nil, gin.H{"format": format, "rows": strconv.Itoa(len(rows))})

	if format == "xlsx" {
		file := excelize.NewFile()
		sheet := "Volunteers"
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
		c.Header("Content-Disposition", "attachment; filename=volunteers-export.xlsx")
		c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf.Bytes())
		return
	}

	buffer := &bytes.Buffer{}
	writer := csv.NewWriter(buffer)
	if err := writer.WriteAll(data); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to build csv", nil)
		return
	}
	writer.Flush()

	c.Header("Content-Disposition", "attachment; filename=volunteers-export.csv")
	c.Data(http.StatusOK, "text/csv", buffer.Bytes())
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

func formatTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.Format(time.RFC3339)
}
