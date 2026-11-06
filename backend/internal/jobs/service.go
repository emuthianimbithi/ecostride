package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"ecostride/backend/internal/common/models"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// HandlerFunc processes a job payload.
const leaseDuration = 2 * time.Minute
const handlerTimeout = 90 * time.Second
const maxAttempts = 3

type HandlerFunc func(ctx context.Context, job models.Job) error

// Service manages background jobs.
type Service struct {
	DB       *gorm.DB
	handlers map[string]HandlerFunc
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db, handlers: make(map[string]HandlerFunc)}
}

func (s *Service) Register(jobType string, handler HandlerFunc) {
	s.handlers[jobType] = handler
}

func (s *Service) Enqueue(ctx context.Context, jobType string, payload interface{}, runAt time.Time) (models.Job, error) {
	if runAt.IsZero() {
		runAt = time.Now()
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return models.Job{}, err
	}

	job := models.Job{
		Slug:    uuid.New(),
		Type:    jobType,
		Status:  "pending",
		Payload: datatypes.JSON(encoded),
		RunAt:   runAt,
	}

	if err := s.DB.WithContext(ctx).Create(&job).Error; err != nil {
		return models.Job{}, err
	}

	return job, nil
}

func (s *Service) RunWorker(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 2 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.processNext(ctx)
		}
	}
}

func (s *Service) processNext(ctx context.Context) {
	job, err := s.nextJob(ctx)
	if err != nil || job == nil {
		return
	}

	handler := s.handlers[job.Type]
	if handler == nil {
		s.failJob(ctx, *job, errors.New("no handler registered"))
		return
	}

	runCtx, cancel := context.WithTimeout(ctx, handlerTimeout)
	defer cancel()
	if err := handler(runCtx, *job); err != nil {
		s.retryJob(ctx, *job, err)
		return
	}

	_ = s.DB.WithContext(ctx).Model(&models.Job{}).Where("id = ? AND status = ? AND locked_at = ? AND attempts = ?", job.ID, "processing", job.LockedAt, job.Attempts).Updates(map[string]interface{}{
		"status":    "completed",
		"run_at":    time.Now(),
		"locked_at": nil,
	}).Error
}

func (s *Service) nextJob(ctx context.Context) (*models.Job, error) {
	var job models.Job
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		// Exhausted leases cannot remain processing forever after worker crashes.
		if err := tx.Model(&models.Job{}).Where("status = ? AND (locked_at IS NULL OR locked_at < ?) AND attempts >= ?", "processing", now.Add(-leaseDuration), maxAttempts).Updates(map[string]interface{}{"status": "failed", "locked_at": nil, "last_error": "worker lease expired after retry limit"}).Error; err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("attempts < ? AND ((status = ? AND run_at <= ?) OR (status = ? AND (locked_at IS NULL OR locked_at < ?)))", maxAttempts, "pending", now, "processing", now.Add(-leaseDuration)).
			Order("run_at asc").
			Limit(1).Find(&job).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}

		if job.ID == 0 {
			return nil
		}
		job.Attempts++
		job.Status = "processing"
		job.LockedAt = &now
		return tx.Save(&job).Error
	})

	if err == nil && job.ID == 0 {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

// Completion and retry updates are fenced to this exact claim. An expired
// worker cannot overwrite the newer worker's result.
func (s *Service) updateClaim(ctx context.Context, job models.Job, values map[string]interface{}) {
	_ = s.DB.WithContext(ctx).Model(&models.Job{}).Where("id = ? AND status = ? AND locked_at = ? AND attempts = ?", job.ID, "processing", job.LockedAt, job.Attempts).Updates(values).Error
}

func (s *Service) retryJob(ctx context.Context, job models.Job, err error) {
	status := "pending"
	if job.Attempts >= maxAttempts {
		status = "failed"
	}
	s.updateClaim(ctx, job, map[string]interface{}{"status": status, "last_error": err.Error(), "locked_at": nil, "run_at": time.Now().Add(time.Minute)})
}

func (s *Service) failJob(ctx context.Context, job models.Job, err error) {
	s.updateClaim(ctx, job, map[string]interface{}{"status": "failed", "last_error": err.Error(), "locked_at": nil})
}
