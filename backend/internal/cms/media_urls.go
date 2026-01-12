package cms

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/storage"
)

func withResolvedMediaURL(ctx context.Context, provider storage.StorageProvider, mediaDir string, m models.Media) models.Media {
	if strings.TrimSpace(m.URL) != "" || strings.TrimSpace(m.Path) == "" {
		return m
	}

	objectKey := m.Path
	if isLocalProvider(provider) {
		objectKey = normalizeLegacyLocalPathToKey(mediaDir, objectKey)
	}

	m.URL = provider.GetPublicURL(ctx, objectKey)
	return m
}

func isLocalProvider(provider storage.StorageProvider) bool {
	_, ok := provider.(*storage.LocalProvider)
	return ok
}

func normalizeLegacyLocalPathToKey(mediaDir, pathOrKey string) string {
	pathOrKey = strings.TrimSpace(pathOrKey)
	if pathOrKey == "" || strings.TrimSpace(mediaDir) == "" {
		return pathOrKey
	}

	// New rows store the object key (e.g. 2026/01/11/<uuid>.png); keep it as-is.
	if strings.Contains(pathOrKey, "/") && !strings.Contains(pathOrKey, string(os.PathSeparator)) {
		return pathOrKey
	}

	// Older rows stored the filesystem path (e.g. ./uploads/media-<uuid>.png).
	if rel, err := filepath.Rel(mediaDir, pathOrKey); err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return filepath.ToSlash(rel)
	}

	// Best-effort: if it looks like "<mediaDir>/<filename>", strip the dir prefix.
	if strings.HasPrefix(filepath.Clean(pathOrKey), filepath.Clean(mediaDir)+string(filepath.Separator)) {
		rel := strings.TrimPrefix(filepath.Clean(pathOrKey), filepath.Clean(mediaDir)+string(filepath.Separator))
		return filepath.ToSlash(rel)
	}

	return filepath.ToSlash(pathOrKey)
}
