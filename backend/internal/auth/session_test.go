package auth

import (
	"context"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"github.com/google/uuid"
	"sync"
	"testing"
)

func TestRefreshRotationAndDisabledAccount(t *testing.T) {
	db := testhelpers.OpenTestDB(t)
	s := NewService(db, NewManager("access-test", "refresh-test"))
	user := models.User{Slug: uuid.New(), Email: "staff@example.com", IsActive: true}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	_, refresh, err := s.issueTokens(context.Background(), user, nil)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _, err := s.Refresh(context.Background(), refresh); results <- err }()
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("refresh reused concurrently: %d successes", successes)
	}
	_, refresh, err = s.issueTokens(context.Background(), user, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&user).Update("is_active", false).Error; err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Refresh(context.Background(), refresh); err == nil {
		t.Fatal("disabled account refreshed")
	}
	if _, err := s.Profile(context.Background(), user.ID); err == nil {
		t.Fatal("disabled account profile allowed")
	}
}
