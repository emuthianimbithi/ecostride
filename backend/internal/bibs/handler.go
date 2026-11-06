package bibs

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
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
	"gorm.io/gorm/clause"
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

	assigned := 0
	err = h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		// Serialize allocation for this event and read counters under the lock.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&event, event.ID).Error; err != nil {
			return err
		}
		var categories []models.EventCategory
		if err := tx.Where("event_id = ?", event.ID).Find(&categories).Error; err != nil {
			return err
		}
		categoryMap := make(map[uint]*models.EventCategory)
		for i := range categories {
			categoryMap[categories[i].ID] = &categories[i]
		}
		var existing []models.BibAssignment
		if err := tx.Where("event_id = ?", event.ID).Find(&existing).Error; err != nil {
			return err
		}
		occupied := make(map[int]bool)
		for _, assignment := range existing {
			occupied[assignment.BibNumber] = true
		}
		sub := tx.Model(&models.BibAssignment{}).Select("registration_id").Where("event_id = ?", event.ID)
		var registrations []models.Registration
		if err := tx.Where("event_id = ? AND status IN ('paid','confirmed')", event.ID).
			Where("id NOT IN (?)", sub).
			Order("created_at, id").
			Find(&registrations).Error; err != nil {
			return err
		}

		for _, registration := range registrations {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&registration, registration.ID).Error; err != nil {
				return err
			}
			eligible, err := eligibleForRace(tx, registration)
			if err != nil {
				return err
			}
			if !eligible {
				continue
			}
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

			for *next <= *category.BibRangeEnd && occupied[*next] {
				*next++
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

			occupied[*next] = true
			nextValue := *next + 1
			category.BibNext = &nextValue
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

	var assignment models.BibAssignment
	created := false
	err = h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&event, event.ID).Error; err != nil {
			return err
		}
		var registration models.Registration
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("slug = ? AND event_id = ?", regSlug, event.ID).First(&registration).Error; err != nil {
			return err
		}
		eligible, err := eligibleForRace(tx, registration)
		if err != nil {
			return err
		}
		if !eligible {
			return errBibConflict
		}
		if registration.CategoryID == nil || req.BibNumber <= 0 {
			return errBibConflict
		}
		var category models.EventCategory
		if err := tx.Where("id = ? AND event_id = ?", *registration.CategoryID, event.ID).First(&category).Error; err != nil {
			return err
		}
		if category.BibRangeStart == nil || category.BibRangeEnd == nil || req.BibNumber < *category.BibRangeStart || req.BibNumber > *category.BibRangeEnd {
			return errBibConflict
		}
		if err := tx.Where("registration_id = ?", registration.ID).Limit(1).Find(&assignment).Error; err != nil {
			return err
		}
		if assignment.ID != 0 {
			if assignment.EventID != event.ID || assignment.BibNumber != req.BibNumber {
				return errBibConflict
			}
			return nil
		}
		var count int64
		if err := tx.Model(&models.BibAssignment{}).Where("event_id = ? AND bib_number = ?", event.ID, req.BibNumber).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return errBibConflict
		}
		assignment = models.BibAssignment{Slug: uuid.New(), EventID: event.ID, RegistrationID: registration.ID, BibNumber: req.BibNumber, AssignedAt: time.Now(), AssignedBy: pointerToUint(h.getActorID(c))}
		if err := tx.Create(&assignment).Error; err != nil {
			return err
		}
		created = true
		value, _ := json.Marshal(assignment)
		return audit.NewService(tx).Log(c.Request.Context(), audit.Entry{ActorUserID: h.getActorID(c), ActionKey: "bib.assign.manual", EntityType: "bib_assignment", EntityID: assignment.Slug.String(), NewJSON: value, IP: c.ClientIP(), UserAgent: c.GetHeader("User-Agent")})
	})
	if err != nil {
		code, message := 500, "failed to assign bib"
		if errors.Is(err, errBibConflict) {
			code, message = 409, "bib requires an eligible entry, an available number in its category range, and no existing different assignment"
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			code, message = 404, "registration or category not found in this event"
		}
		c.JSON(code, gin.H{"error": message})
		return
	}
	code := http.StatusOK
	if created {
		code = http.StatusCreated
	}
	c.JSON(code, assignment)
}

var errBibConflict = errors.New("bib assignment conflict")

func eligibleForRace(tx *gorm.DB, registration models.Registration) (bool, error) {
	if registration.Status != "paid" && registration.Status != "confirmed" {
		return false, nil
	}
	if registration.CategoryID == nil {
		return true, nil
	}
	var category models.EventCategory
	if err := tx.Where("id = ? AND event_id = ?", *registration.CategoryID, registration.EventID).First(&category).Error; err != nil {
		return false, err
	}
	paid := category.PriceKESMinor != 0 || (category.PriceUSDMinor != nil && *category.PriceUSDMinor != 0) || (category.PriceEURMinor != nil && *category.PriceEURMinor != 0)
	if !paid {
		return true, nil
	}
	var count int64
	err := tx.Model(&models.Payment{}).Where("registration_id = ? AND status = ? AND amount_minor > 0", registration.ID, "success").Count(&count).Error
	return count > 0, err
}

func (h *Handler) LockBibs(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}
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
	err = h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Joins("JOIN registrations ON registrations.id = bib_assignments.registration_id AND registrations.deleted_at IS NULL").
			Where("registrations.slug = ? AND bib_assignments.event_id = ? AND registrations.event_id = ?", regSlug, event.ID, event.ID).
			First(&assignment).Error; err != nil {
			return err
		}
		if assignment.LockedAt != nil {
			return nil
		}
		old, _ := json.Marshal(assignment)
		assignment.LockedAt = pointerToTime(time.Now())
		assignment.LockReason = req.LockReason
		if err := tx.Model(&assignment).Select("locked_at", "lock_reason").Updates(&assignment).Error; err != nil {
			return err
		}
		value, _ := json.Marshal(assignment)
		return audit.NewService(tx).Log(c.Request.Context(), audit.Entry{ActorUserID: h.getActorID(c), ActionKey: "bib.lock", EntityType: "bib_assignment", EntityID: assignment.Slug.String(), OldJSON: old, NewJSON: value, IP: c.ClientIP(), UserAgent: c.GetHeader("User-Agent")})
	})
	if err != nil {
		code, message := 500, "failed to lock bib"
		if errors.Is(err, gorm.ErrRecordNotFound) {
			code, message = 404, "bib assignment not found in this event"
		}
		c.JSON(code, gin.H{"error": message})
		return
	}
	c.JSON(http.StatusOK, assignment)
}

func (h *Handler) CheckIn(c *gin.Context) {
	slug, err := uuid.Parse(c.Param("registrationId"))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid registration ID"})
		return
	}
	var req checkinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid check-in request"})
		return
	}
	var checkin models.Checkin
	ineligible := errors.New("registration is not eligible for check-in")
	noBib := errors.New("assign a bib before recording its collection")
	err = h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var registration models.Registration
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("slug = ?", slug).First(&registration).Error; err != nil {
			return err
		}
		eligible, err := eligibleForRace(tx, registration)
		if err != nil {
			return err
		}
		if !eligible {
			return ineligible
		}
		if req.BibCollected {
			var count int64
			if err := tx.Model(&models.BibAssignment{}).Where("registration_id = ? AND event_id = ?", registration.ID, registration.EventID).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return noBib
			}
		}
		if err := tx.Where("registration_id = ?", registration.ID).First(&checkin).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			checkin = models.Checkin{Slug: uuid.New(), RegistrationID: registration.ID, EventID: registration.EventID}
		}
		changed := false
		now := time.Now()
		if req.CheckedIn && checkin.CheckedInAt == nil {
			checkin.CheckedInAt = &now
			checkin.CheckedByUserID = pointerToUint(h.getActorID(c))
			changed = true
		}
		if req.BibCollected && checkin.BibCollectedAt == nil {
			checkin.BibCollectedAt = &now
			changed = true
		}
		if req.PackCollected && checkin.PackCollectedAt == nil {
			checkin.PackCollectedAt = &now
			changed = true
		}
		if !changed {
			return nil
		}
		if err := tx.Save(&checkin).Error; err != nil {
			return err
		}
		value, _ := json.Marshal(checkin)
		return audit.NewService(tx).Log(c.Request.Context(), audit.Entry{ActorUserID: h.getActorID(c), ActionKey: "registration.checkin", EntityType: "registration", EntityID: slug.String(), NewJSON: value, IP: c.ClientIP(), UserAgent: c.GetHeader("User-Agent")})
	})
	if err != nil {
		status, message := 500, "unable to record check-in"
		if errors.Is(err, ineligible) || errors.Is(err, noBib) {
			status, message = 409, err.Error()
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			status, message = 404, "registration or category not found"
		}
		c.JSON(status, gin.H{"error": message})
		return
	}
	c.JSON(200, checkin)
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
