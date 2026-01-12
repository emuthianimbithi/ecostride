package bibs

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
	"ecostride/backend/internal/common/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

// Handler exposes bib HTTP handlers.
type Handler struct {
	Service *Service
	Audit   *audit.Service
	DB      *gorm.DB
}

func NewHandler(service *Service, auditService *audit.Service, db *gorm.DB) *Handler {
	return &Handler{Service: service, Audit: auditService, DB: db}
}

type manualAssignRequest struct {
	RegistrationSlug string `json:"registration_slug" binding:"required"`
	BibNumber        int    `json:"bib_number" binding:"required"`
}

type lockRequest struct {
	RegistrationSlug string `json:"registration_slug" binding:"required"`
	LockReason       string `json:"lock_reason"`
}

type checkinRequest struct {
	CheckedIn     bool `json:"checked_in"`
	BibCollected  bool `json:"bib_collected"`
	PackCollected bool `json:"pack_collected"`
}

type startListRow struct {
	BibNumber    *int       `gorm:"column:bib_number"`
	AthleteName  string     `gorm:"column:athlete_name"`
	CategoryName string     `gorm:"column:category_name"`
	Gender       string     `gorm:"column:gender"`
	Dob          *time.Time `gorm:"column:dob"`
	Residence    string     `gorm:"column:residence"`
}

func (h *Handler) AutoAssign(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	var categories []models.EventCategory
	if err := h.DB.WithContext(c.Request.Context()).
		Where("event_id = ?", event.ID).
		Find(&categories).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load categories"})
		return
	}

	categoryMap := make(map[uint]*models.EventCategory)
	for i := range categories {
		categoryMap[categories[i].ID] = &categories[i]
	}

	assigned := 0
	err = h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		sub := tx.Model(&models.BibAssignment{}).Select("registration_id").Where("event_id = ?", event.ID)
		var registrations []models.Registration
		if err := tx.Where("event_id = ? AND status IN ('paid','confirmed')", event.ID).
			Where("id NOT IN (?)", sub).
			Find(&registrations).Error; err != nil {
			return err
		}

		for _, registration := range registrations {
			if registration.CategoryID == nil {
				continue
			}
			category, ok := categoryMap[*registration.CategoryID]
			if !ok {
				continue
			}
			if category.BibRangeStart == nil || category.BibRangeEnd == nil {
				continue
			}

			next := category.BibNext
			if next == nil {
				start := *category.BibRangeStart
				next = &start
			}

			if *next > *category.BibRangeEnd {
				return gorm.ErrInvalidData
			}

			assignment := models.BibAssignment{
				Slug:           uuid.New(),
				EventID:        event.ID,
				RegistrationID: registration.ID,
				BibNumber:      *next,
				AssignedAt:     time.Now(),
				AssignedBy:     pointerToUint(h.getActorID(c)),
			}

			if err := tx.Create(&assignment).Error; err != nil {
				return err
			}

			nextValue := *next + 1
			if err := tx.Model(&models.EventCategory{}).
				Where("id = ?", category.ID).
				Update("bib_next", nextValue).Error; err != nil {
				return err
			}

			assigned++
		}

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to auto-assign"})
		return
	}

	h.logAudit(c, "bib.assign.auto", "event", event.Slug.String(), nil, gin.H{"assigned": assigned})

	c.JSON(http.StatusOK, gin.H{"assigned": assigned})
}

func (h *Handler) ManualAssign(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	var req manualAssignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	regSlug, err := uuid.Parse(req.RegistrationSlug)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration slug"})
		return
	}

	var registration models.Registration
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ? AND event_id = ?", regSlug, event.ID).First(&registration).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	assignment := models.BibAssignment{
		Slug:           uuid.New(),
		EventID:        event.ID,
		RegistrationID: registration.ID,
		BibNumber:      req.BibNumber,
		AssignedAt:     time.Now(),
		AssignedBy:     pointerToUint(h.getActorID(c)),
	}

	created, err := h.Service.CreateAssignment(c.Request.Context(), assignment)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to assign bib"})
		return
	}

	h.logAudit(c, "bib.assign.manual", "bib_assignment", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, created)
}

func (h *Handler) LockBibs(c *gin.Context) {
	var req lockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	regSlug, err := uuid.Parse(req.RegistrationSlug)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration slug"})
		return
	}

	var assignment models.BibAssignment
	if err := h.DB.WithContext(c.Request.Context()).
		Joins("JOIN registrations ON registrations.id = bib_assignments.registration_id").
		Where("registrations.slug = ?", regSlug).
		First(&assignment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bib assignment not found"})
		return
	}

	old := assignment
	assignment.LockedAt = pointerToTime(time.Now())
	assignment.LockReason = req.LockReason

	updated, err := h.Service.UpdateAssignment(c.Request.Context(), assignment)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lock bib"})
		return
	}

	h.logAudit(c, "bib.lock", "bib_assignment", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) CheckIn(c *gin.Context) {
	regSlug, err := uuid.Parse(c.Param("registrationId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid registration id"})
		return
	}

	var registration models.Registration
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", regSlug).First(&registration).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "registration not found"})
		return
	}

	var checkin models.Checkin
	if err := h.DB.WithContext(c.Request.Context()).Where("registration_id = ?", registration.ID).First(&checkin).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			checkin = models.Checkin{Slug: uuid.New(), EventID: registration.EventID, RegistrationID: registration.ID}
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load check-in"})
			return
		}
	}

	var req checkinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	if req.CheckedIn {
		now := time.Now()
		checkin.CheckedInAt = &now
		checkin.CheckedByUserID = pointerToUint(h.getActorID(c))
	}
	if req.BibCollected {
		now := time.Now()
		checkin.BibCollectedAt = &now
	}
	if req.PackCollected {
		now := time.Now()
		checkin.PackCollectedAt = &now
	}

	if err := h.DB.WithContext(c.Request.Context()).Save(&checkin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update check-in"})
		return
	}

	c.JSON(http.StatusOK, checkin)
}

func (h *Handler) StartListExport(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	format := strings.ToLower(c.DefaultQuery("format", "csv"))
	if format != "csv" && format != "xlsx" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported format"})
		return
	}

	var rows []startListRow
	if err := h.DB.WithContext(c.Request.Context()).
		Table("registrations").
		Select("bib_assignments.bib_number, registrations.athlete_name, registrations.gender, registrations.dob, registrations.residence, event_categories.name as category_name").
		Joins("LEFT JOIN event_categories ON event_categories.id = registrations.category_id").
		Joins("LEFT JOIN bib_assignments ON bib_assignments.registration_id = registrations.id").
		Where("registrations.event_id = ? AND registrations.status IN ('paid','confirmed')", event.ID).
		Order("bib_assignments.bib_number asc NULLS LAST").
		Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load start list"})
		return
	}

	headers := []string{"bib_number", "athlete_name", "category_name", "gender", "age", "team"}
	data := make([][]string, 0, len(rows)+1)
	data = append(data, headers)

	for _, row := range rows {
		age := ""
		if row.Dob != nil {
			age = strconv.Itoa(calculateAge(*row.Dob))
		}
		bib := ""
		if row.BibNumber != nil {
			bib = strconv.Itoa(*row.BibNumber)
		}

		data = append(data, []string{
			bib,
			row.AthleteName,
			row.CategoryName,
			row.Gender,
			age,
			row.Residence,
		})
	}

	h.logAudit(c, "export.start_list", "event", event.Slug.String(), nil, gin.H{"format": format})

	if format == "xlsx" {
		file := excelize.NewFile()
		sheet := "StartList"
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
		c.Header("Content-Disposition", "attachment; filename=start-list.xlsx")
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

	c.Header("Content-Disposition", "attachment; filename=start-list.csv")
	c.Data(http.StatusOK, "text/csv", buffer.Bytes())
}

func (h *Handler) getEventBySlugParam(c *gin.Context) (models.Event, error) {
	eventSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event id"})
		return models.Event{}, err
	}

	var event models.Event
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", eventSlug).First(&event).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return models.Event{}, err
	}

	return event, nil
}

func pointerToUint(value uint) *uint {
	if value == 0 {
		return nil
	}
	return &value
}

func pointerToTime(value time.Time) *time.Time {
	return &value
}

func calculateAge(dob time.Time) int {
	now := time.Now()
	age := now.Year() - dob.Year()
	if now.YearDay() < dob.YearDay() {
		age--
	}
	if age < 0 {
		return 0
	}
	return age
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
