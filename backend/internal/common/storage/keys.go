package storage

import (
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

func extFromMime(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "application/pdf":
		return ".pdf"
	default:
		return ""
	}
}

func sanitizeExt(ext string) string {
	ext = strings.ToLower(strings.TrimSpace(ext))
	if ext == "" {
		return ""
	}
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	if len(ext) > 12 {
		return ""
	}
	for _, r := range ext[1:] {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return ""
		}
	}
	return ext
}

// GenerateObjectKey returns an unguessable object key with a date prefix, e.g. 2026/01/11/<uuid>.jpg.
func GenerateObjectKey(now time.Time, originalFilename, contentType string) string {
	originalFilename = sanitizeFilename(originalFilename)
	ext := sanitizeExt(filepath.Ext(originalFilename))
	if ext == "" {
		ext = extFromMime(contentType)
	}

	datePrefix := now.UTC().Format("2006/01/02")
	return datePrefix + "/" + uuid.New().String() + ext
}
