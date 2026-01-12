package audit

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
)

// Entry captures an audit log record.
type Entry struct {
	ActorUserID uint
	ActionKey   string
	EntityType  string
	EntityID    string
	OldJSON     []byte
	NewJSON     []byte
	IP          string
	UserAgent   string
}

// Service persists audit log entries.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) Log(ctx context.Context, entry Entry) error {
	logEntry := models.AuditLog{
		ActorUserID: entry.ActorUserID,
		ActionKey:   entry.ActionKey,
		EntityType:  entry.EntityType,
		EntityID:    entry.EntityID,
		OldJSON:     entry.OldJSON,
		NewJSON:     entry.NewJSON,
		IP:          entry.IP,
		UserAgent:   entry.UserAgent,
	}

	return s.DB.WithContext(ctx).Create(&logEntry).Error
}
