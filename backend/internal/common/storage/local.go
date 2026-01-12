package storage

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type LocalProvider struct {
	MediaDir string
	BaseURL  string
	Now      func() time.Time
}

func NewLocalProvider(mediaDir, baseURL string) *LocalProvider {
	now := func() time.Time { return time.Now() }
	return &LocalProvider{MediaDir: mediaDir, BaseURL: baseURL, Now: now}
}

func (p *LocalProvider) Save(ctx context.Context, fileStream io.Reader, originalFilename, contentType string) (StorageObject, error) {
	_ = ctx

	if strings.TrimSpace(p.MediaDir) == "" {
		return StorageObject{}, errors.New("MEDIA_DIR is required for local storage")
	}
	if p.Now == nil {
		p.Now = func() time.Time { return time.Now() }
	}

	key := GenerateObjectKey(p.Now(), originalFilename, contentType)
	relativePath := filepath.FromSlash(key)
	fullPath := filepath.Join(p.MediaDir, relativePath)

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return StorageObject{}, err
	}

	tmpPath := fullPath + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return StorageObject{}, err
	}
	defer f.Close()

	written, err := io.Copy(f, fileStream)
	if err != nil {
		_ = os.Remove(tmpPath)
		return StorageObject{}, err
	}

	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return StorageObject{}, err
	}
	if err := os.Rename(tmpPath, fullPath); err != nil {
		_ = os.Remove(tmpPath)
		return StorageObject{}, err
	}

	return StorageObject{
		Key:              key,
		Size:             written,
		ContentType:      contentType,
		OriginalFilename: sanitizeFilename(originalFilename),
		PublicURL:        p.GetPublicURL(context.Background(), key),
	}, nil
}

func (p *LocalProvider) Delete(ctx context.Context, objectKey string) error {
	_ = ctx
	fullPath, err := p.fullPathFromKey(objectKey)
	if err != nil {
		return err
	}
	if err := os.Remove(fullPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (p *LocalProvider) GetPublicURL(ctx context.Context, objectKey string) string {
	_ = ctx
	return joinPublicURL(strings.TrimRight(p.BaseURL, "/")+"/media", objectKey)
}

func (p *LocalProvider) GetSignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	_ = ctx
	_ = objectKey
	_ = expiry
	return "", ErrSignedURLNotSupported
}

func (p *LocalProvider) fullPathFromKey(objectKey string) (string, error) {
	objectKey = strings.TrimPrefix(objectKey, "/")
	if objectKey == "" {
		return "", errors.New("missing object key")
	}

	clean := filepath.Clean(filepath.FromSlash(objectKey))
	if clean == "." {
		return "", errors.New("invalid object key")
	}

	full := filepath.Join(p.MediaDir, clean)
	rel, err := filepath.Rel(p.MediaDir, full)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid object key")
	}

	return full, nil
}
