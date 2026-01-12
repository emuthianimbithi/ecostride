package storage

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/storage"
	"google.golang.org/api/option"
)

type GCSProvider struct {
	Client        *storage.Client
	Bucket        string
	PublicBaseURL string
	Now           func() time.Time

	UseSignedURLs bool
	accessID      string
	privateKey    []byte
}

type GCSConfig struct {
	Bucket             string
	CredentialsPath    string
	PublicBaseURL      string
	UseSignedURLs      bool
	MakePublicOnUpload bool
}

func NewGCSProvider(ctx context.Context, cfg GCSConfig) (*GCSProvider, error) {
	if strings.TrimSpace(cfg.Bucket) == "" {
		return nil, errors.New("GCS_BUCKET is required")
	}

	var client *storage.Client
	var err error
	if strings.TrimSpace(cfg.CredentialsPath) != "" {
		client, err = storage.NewClient(ctx, option.WithCredentialsFile(cfg.CredentialsPath))
	} else {
		client, err = storage.NewClient(ctx)
	}
	if err != nil {
		return nil, err
	}

	publicBase := strings.TrimSpace(cfg.PublicBaseURL)
	if publicBase == "" {
		publicBase = "https://storage.googleapis.com/" + strings.TrimSpace(cfg.Bucket)
	}

	p := &GCSProvider{
		Client:        client,
		Bucket:        strings.TrimSpace(cfg.Bucket),
		PublicBaseURL: strings.TrimRight(publicBase, "/"),
		UseSignedURLs: cfg.UseSignedURLs,
		Now:           func() time.Time { return time.Now() },
	}

	if p.UseSignedURLs {
		if strings.TrimSpace(cfg.CredentialsPath) == "" {
			return nil, errors.New("signed URLs require GOOGLE_APPLICATION_CREDENTIALS pointing to a service account json file")
		}

		if err := p.loadSigningCredentials(cfg.CredentialsPath); err != nil {
			return nil, err
		}
	}

	return p, nil
}

func (p *GCSProvider) Save(ctx context.Context, fileStream io.Reader, originalFilename, contentType string) (StorageObject, error) {
	if p.Now == nil {
		p.Now = func() time.Time { return time.Now() }
	}
	key := GenerateObjectKey(p.Now(), originalFilename, contentType)

	obj := p.Client.Bucket(p.Bucket).Object(key)
	w := obj.NewWriter(ctx)
	w.ContentType = contentType

	written, err := io.Copy(w, fileStream)
	if closeErr := w.Close(); err == nil && closeErr != nil {
		err = closeErr
	}
	if err != nil {
		return StorageObject{}, err
	}

	if !p.UseSignedURLs {
		// Make object publicly readable by default.
		if err := obj.ACL().Set(ctx, storage.AllUsers, storage.RoleReader); err != nil {
			return StorageObject{}, err
		}
	}

	return StorageObject{
		Key:              key,
		Size:             written,
		ContentType:      contentType,
		OriginalFilename: sanitizeFilename(originalFilename),
		PublicURL:        p.GetPublicURL(ctx, key),
	}, nil
}

func (p *GCSProvider) Delete(ctx context.Context, objectKey string) error {
	return p.Client.Bucket(p.Bucket).Object(strings.TrimPrefix(objectKey, "/")).Delete(ctx)
}

func (p *GCSProvider) GetPublicURL(ctx context.Context, objectKey string) string {
	_ = ctx
	if p.UseSignedURLs {
		return ""
	}
	return joinPublicURL(p.PublicBaseURL, strings.TrimPrefix(objectKey, "/"))
}

func (p *GCSProvider) GetSignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	_ = ctx
	if !p.UseSignedURLs {
		return "", ErrSignedURLNotSupported
	}

	return storage.SignedURL(p.Bucket, strings.TrimPrefix(objectKey, "/"), &storage.SignedURLOptions{
		Method:         "GET",
		Expires:        time.Now().Add(expiry),
		GoogleAccessID: p.accessID,
		PrivateKey:     p.privateKey,
	})
}

func (p *GCSProvider) loadSigningCredentials(credentialsPath string) error {
	raw, err := os.ReadFile(credentialsPath)
	if err != nil {
		return err
	}

	var sa struct {
		ClientEmail string `json:"client_email"`
		PrivateKey  string `json:"private_key"`
	}
	if err := json.Unmarshal(raw, &sa); err != nil {
		return err
	}
	if strings.TrimSpace(sa.ClientEmail) == "" || strings.TrimSpace(sa.PrivateKey) == "" {
		return errors.New("invalid service account json for signing")
	}

	p.accessID = sa.ClientEmail
	p.privateKey = []byte(sa.PrivateKey)
	return nil
}
