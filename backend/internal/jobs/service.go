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

	if err := handler(ctx, *job); err != nil {
		s.retryJob(ctx, *job, err)
		return
	}

	_ = s.DB.WithContext(ctx).Model(&models.Job{}).Where("id = ?", job.ID).Updates(map[string]interface{}{
		"status":    "completed",
		"run_at":    time.Now(),
		"locked_at": nil,
	}).Error
}

func (s *Service) nextJob(ctx context.Context) (*models.Job, error) {
	var job models.Job
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("status = ? AND run_at <= ?", "pending", time.Now()).
			Order("run_at asc").
			First(&job).Error; err != nil {
			return err
		}

		now := time.Now()
		job.Status = "processing"
		job.LockedAt = &now
		return tx.Save(&job).Error
	})

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (s *Service) retryJob(ctx context.Context, job models.Job, err error) {
	job.Attempts++
	job.LastError = err.Error()

	if job.Attempts >= 3 {
		job.Status = "failed"
		job.LockedAt = nil
		_ = s.DB.WithContext(ctx).Save(&job).Error
		return
	}

	job.Status = "pending"
	job.LockedAt = nil
	job.RunAt = time.Now().Add(1 * time.Minute)
	_ = s.DB.WithContext(ctx).Save(&job).Error
}

func (s *Service) failJob(ctx context.Context, job models.Job, err error) {
	job.Attempts++
	job.LastError = err.Error()
	job.Status = "failed"
	job.LockedAt = nil
	_ = s.DB.WithContext(ctx).Save(&job).Error
}
