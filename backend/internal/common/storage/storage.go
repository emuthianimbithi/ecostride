package storage

import (
	"context"
	"errors"
	"io"
	"path"
	"strings"
	"time"
)

var ErrSignedURLNotSupported = errors.New("signed URLs not supported")

type StorageObject struct {
	Key              string
	Size             int64
	ContentType      string
	OriginalFilename string
	PublicURL        string
}

type StorageProvider interface {
	Save(ctx context.Context, fileStream io.Reader, originalFilename, contentType string) (StorageObject, error)
	Delete(ctx context.Context, objectKey string) error
	GetPublicURL(ctx context.Context, objectKey string) string
	GetSignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error)
}

func sanitizeFilename(filename string) string {
	filename = strings.TrimSpace(filename)
	filename = path.Base(filename)
	if filename == "." || filename == "/" {
		return ""
	}
	return filename
}
