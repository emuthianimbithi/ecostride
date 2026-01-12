package storage

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"ecostride/backend/internal/common/config"
)

func NewStorageProviderFromEnv(ctx context.Context, cfg config.Config) (StorageProvider, error) {
	provider := strings.TrimSpace(os.Getenv("STORAGE_PROVIDER"))
	if provider == "" {
		if isProductionEnv() {
			return nil, errors.New("STORAGE_PROVIDER is required in production (allowed: local, spaces, gcs)")
		}
		provider = "local"
	}

	switch provider {
	case "local":
		return NewLocalProvider(cfg.MediaDir, cfg.BaseURL), nil
	case "spaces":
		publicRead, _ := strconv.ParseBool(getenv("SPACES_PUBLIC_READ", "true"))
		return NewSpacesProvider(ctx, SpacesConfig{
			Endpoint:      getenv("SPACES_ENDPOINT", ""),
			Region:        getenv("SPACES_REGION", ""),
			Bucket:        getenv("SPACES_BUCKET", ""),
			AccessKey:     getenv("SPACES_ACCESS_KEY", ""),
			SecretKey:     getenv("SPACES_SECRET_KEY", ""),
			PublicBaseURL: getenv("SPACES_PUBLIC_BASE_URL", ""),
			PublicReadACL: publicRead,
		})
	case "gcs":
		useSigned, _ := strconv.ParseBool(getenv("GCS_USE_SIGNED_URLS", "false"))
		return NewGCSProvider(ctx, GCSConfig{
			Bucket:          getenv("GCS_BUCKET", ""),
			CredentialsPath: os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"),
			PublicBaseURL:   getenv("GCS_PUBLIC_BASE_URL", ""),
			UseSignedURLs:   useSigned,
		})
	default:
		return nil, fmt.Errorf("invalid STORAGE_PROVIDER=%q (allowed: local, spaces, gcs)", provider)
	}
}

func isProductionEnv() bool {
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if appEnv == "prod" || appEnv == "production" {
		return true
	}
	// Common convention: Gin release mode is treated as production.
	return strings.ToLower(strings.TrimSpace(os.Getenv("GIN_MODE"))) == "release"
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
