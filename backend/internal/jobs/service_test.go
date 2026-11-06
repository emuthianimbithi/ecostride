package jobs

import (
	"context"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"errors"
	"testing"
	"time"
)

func TestExpiredLeaseRecoveryAndFencing(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	s := NewService(db)
	ctx := context.Background()
	queued, err := s.Enqueue(ctx, "test", map[string]string{}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	first, err := s.nextJob(ctx)
	if err != nil || first == nil || first.Attempts != 1 {
		t.Fatalf("first claim: %+v %v", first, err)
	}
	if next, err := s.nextJob(ctx); err != nil || next != nil {
		t.Fatalf("live lease reclaimed: %+v %v", next, err)
	}
	expired := time.Now().Add(-3 * time.Minute)
	if err := db.Model(&models.Job{}).Where("id = ?", queued.ID).Update("locked_at", expired).Error; err != nil {
		t.Fatal(err)
	}
	second, err := s.nextJob(ctx)
	if err != nil || second == nil || second.Attempts != 2 {
		t.Fatalf("reclaim: %+v %v", second, err)
	}
	s.retryJob(ctx, *first, errors.New("late worker"))
	var row models.Job
	db.First(&row, queued.ID)
	if row.Status != "processing" || row.Attempts != 2 {
		t.Fatal("old worker overwrote new claim")
	}
	s.updateClaim(ctx, *second, map[string]interface{}{"status": "completed", "locked_at": nil})
	db.First(&row, queued.ID)
	if row.Status != "completed" {
		t.Fatal("current worker cannot complete")
	}
}

func TestCrashedLastAttemptBecomesFailed(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	s := NewService(db)
	ctx := context.Background()
	job, err := s.Enqueue(ctx, "test", nil, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	db.Model(&job).Updates(map[string]interface{}{"status": "processing", "attempts": 3, "locked_at": time.Now().Add(-3 * time.Minute)})
	if next, err := s.nextJob(ctx); err != nil || next != nil {
		t.Fatalf("exhausted job reclaimed: %+v %v", next, err)
	}
	var reloaded models.Job
	if err := db.First(&reloaded, job.ID).Error; err != nil {
		t.Fatal(err)
	}
	if reloaded.Status != "failed" || reloaded.LockedAt != nil {
		t.Fatalf("exhausted lease stranded: %+v", reloaded)
	}
}
