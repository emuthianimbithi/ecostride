package results

import (
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Handler exposes results HTTP handlers.
type Handler struct {
	Service *Service
	Audit   *audit.Service
	DB      *gorm.DB
	Config  config.Config
}

func NewHandler(service *Service, auditService *audit.Service, db *gorm.DB, cfg config.Config) *Handler {
	return &Handler{Service: service, Audit: auditService, DB: db, Config: cfg}
}

func (h *Handler) ListPublicResults(c *gin.Context) {
	event, err := h.findEventBySlug(c, c.Param("slug"))
	if err != nil {
		return
	}

	if !event.ResultsPublished {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "results not published", nil)
		return
	}

	results, err := h.Service.ListResults(c.Request.Context(), event.ID)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list results", nil)
		return
	}

	c.JSON(http.StatusOK, results)
}

func (h *Handler) SearchPublicResults(c *gin.Context) {
	event, err := h.findEventBySlug(c, c.Param("slug"))
	if err != nil {
		return
	}

	if !event.ResultsPublished {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "results not published", nil)
		return
	}

	var bib *int
	if bibParam := c.Query("bib"); bibParam != "" {
		if parsed, err := strconv.Atoi(bibParam); err == nil {
			bib = &parsed
		}
	}

	name := c.Query("name")
	category := c.Query("category")

	results, err := h.Service.SearchResults(c.Request.Context(), event.ID, bib, name, category)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to search results", nil)
		return
	}

	c.JSON(http.StatusOK, results)
}

func (h *Handler) Leaderboard(c *gin.Context) {
	event, err := h.findEventBySlug(c, c.Param("slug"))
	if err != nil {
		return
	}

	if !event.ResultsPublished {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "results not published", nil)
		return
	}

	group := c.Query("group")
	filter := c.Query("filter")
	if filter == "" {
		switch group {
		case "category":
			filter = c.Query("category")
		case "gender":
			filter = c.Query("gender")
		case "agegroup":
			filter = c.Query("agegroup")
		}
	}

	results, err := h.Service.Leaderboard(c.Request.Context(), event.ID, group, filter)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to load leaderboard", nil)
		return
	}

	c.JSON(http.StatusOK, results)
}

func (h *Handler) ImportResults(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "file required", nil)
		return
	}

	if err := os.MkdirAll(h.Config.MediaDir, 0755); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to prepare upload dir", nil)
		return
	}

	filename := "results-" + event.Slug.String() + "-" + time.Now().Format("20060102150405") + ".csv"
	filePath := filepath.Join(h.Config.MediaDir, filename)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to save file", nil)
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
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to record media", nil)
		return
	}

	f, err := os.Open(filePath)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to read file", nil)
		return
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.TrimLeadingSpace = true

	headers, err := reader.Read()
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid csv", nil)
		return
	}

	headerMap := make(map[string]int)
	for i, header := range headers {
		headerMap[strings.ToLower(strings.TrimSpace(header))] = i
	}

	required := []string{"bib_number", "name", "category_name", "gender", "age", "finish_seconds"}
	for _, field := range required {
		if _, ok := headerMap[field]; !ok {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "missing column: "+field, nil)
			return
		}
	}

	type rowError struct {
		Row     int    `json:"row"`
		Message string `json:"message"`
	}

	errorsList := []rowError{}
	results := []models.Result{}
	rowNumber := 1
	totalRows := 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			errorsList = append(errorsList, rowError{Row: rowNumber, Message: "invalid row"})
			rowNumber++
			break
		}
		rowNumber++
		totalRows++

		bib, err := strconv.Atoi(strings.TrimSpace(record[headerMap["bib_number"]]))
		if err != nil {
			errorsList = append(errorsList, rowError{Row: rowNumber, Message: "invalid bib_number"})
			continue
		}

		name := strings.TrimSpace(record[headerMap["name"]])
		if name == "" {
			errorsList = append(errorsList, rowError{Row: rowNumber, Message: "missing name"})
			continue
		}

		category := strings.TrimSpace(record[headerMap["category_name"]])
		gender := strings.TrimSpace(record[headerMap["gender"]])
		age, err := strconv.Atoi(strings.TrimSpace(record[headerMap["age"]]))
		if err != nil {
			errorsList = append(errorsList, rowError{Row: rowNumber, Message: "invalid age"})
			continue
		}
		finishSeconds, err := strconv.Atoi(strings.TrimSpace(record[headerMap["finish_seconds"]]))
		if err != nil {
			errorsList = append(errorsList, rowError{Row: rowNumber, Message: "invalid finish_seconds"})
			continue
		}

		results = append(results, models.Result{
			Slug:          uuid.New(),
			EventID:       event.ID,
			BibNumber:     bib,
			Name:          name,
			CategoryName:  category,
			Gender:        gender,
			Age:           &age,
			FinishSeconds: finishSeconds,
		})
	}

	importSummary := map[string]interface{}{
		"total_rows": totalRows,
		"imported":   len(results),
		"failed":     len(errorsList),
		"errors":     errorsList,
	}

	status := "imported"
	if len(results) == 0 && len(errorsList) > 0 {
		status = "failed"
	}

	importRecord := models.ResultImport{
		Slug:        uuid.New(),
		EventID:     event.ID,
		FileMediaID: media.ID,
		ImportedBy:  h.getActorID(c),
		ImportedAt:  time.Now(),
		Status:      status,
		Summary:     datatypes.JSON(mustJSON(importSummary)),
	}

	replace := c.Query("replace") == "true"

	if err := h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		if replace {
			if err := tx.Where("event_id = ?", event.ID).Delete(&models.Result{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Create(&importRecord).Error; err != nil {
			return err
		}
		if len(results) > 0 {
			if err := tx.Create(&results).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to import results", nil)
		return
	}

	h.logAudit(c, "results.import", "result_import", importRecord.Slug.String(), nil, importSummary)

	c.JSON(http.StatusOK, importSummary)
}

func (h *Handler) PublishResults(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	old := event
	event.ResultsPublished = true

	if err := h.DB.WithContext(c.Request.Context()).Save(&event).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to publish results", nil)
		return
	}

	h.logAudit(c, "results.publish", "event", event.Slug.String(), old, event)

	c.JSON(http.StatusOK, event)
}

func (h *Handler) UnpublishResults(c *gin.Context) {
	event, err := h.getEventBySlugParam(c)
	if err != nil {
		return
	}

	old := event
	event.ResultsPublished = false

	if err := h.DB.WithContext(c.Request.Context()).Save(&event).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to unpublish results", nil)
		return
	}

	h.logAudit(c, "results.unpublish", "event", event.Slug.String(), old, event)

	c.JSON(http.StatusOK, event)
}

func (h *Handler) findEventBySlug(c *gin.Context, slug string) (models.Event, error) {
	var event models.Event
	if err := h.DB.WithContext(c.Request.Context()).Where("url_slug = ?", slug).First(&event).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return models.Event{}, err
	}
	return event, nil
}

func (h *Handler) getEventBySlugParam(c *gin.Context) (models.Event, error) {
	eventSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid event id", nil)
		return models.Event{}, err
	}

	var event models.Event
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", eventSlug).First(&event).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "event not found", nil)
		return models.Event{}, err
	}

	return event, nil
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

func mustJSON(value interface{}) []byte {
	data, _ := json.Marshal(value)
	return data
}
