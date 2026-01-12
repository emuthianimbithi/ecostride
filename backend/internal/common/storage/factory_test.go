package storage

import (
	"context"
	"testing"

	"ecostride/backend/internal/common/config"
)

func TestNewStorageProviderFromEnv_DefaultsLocalInDev(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("STORAGE_PROVIDER", "")

	p, err := NewStorageProviderFromEnv(context.Background(), config.Config{MediaDir: t.TempDir(), BaseURL: "http://localhost:8080"})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if _, ok := p.(*LocalProvider); !ok {
		t.Fatalf("expected LocalProvider, got %T", p)
	}
}

func TestNewStorageProviderFromEnv_FailsInProdWhenMissing(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("STORAGE_PROVIDER", "")

	_, err := NewStorageProviderFromEnv(context.Background(), config.Config{MediaDir: t.TempDir(), BaseURL: "http://localhost:8080"})
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
}
