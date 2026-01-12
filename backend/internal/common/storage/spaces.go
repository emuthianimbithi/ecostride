package storage

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type SpacesProvider struct {
	Client         *s3.Client
	Bucket         string
	PublicBaseURL  string
	Now            func() time.Time
	PublicReadable bool
}

type SpacesConfig struct {
	Endpoint      string
	Region        string
	Bucket        string
	AccessKey     string
	SecretKey     string
	PublicBaseURL string
	PublicReadACL bool
}

func NewSpacesProvider(ctx context.Context, cfg SpacesConfig) (*SpacesProvider, error) {
	if strings.TrimSpace(cfg.Endpoint) == "" ||
		strings.TrimSpace(cfg.Region) == "" ||
		strings.TrimSpace(cfg.Bucket) == "" ||
		strings.TrimSpace(cfg.AccessKey) == "" ||
		strings.TrimSpace(cfg.SecretKey) == "" {
		return nil, errors.New("missing required Spaces configuration")
	}

	endpoint := strings.TrimSpace(cfg.Endpoint)
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "https://" + endpoint
	}

	awsCfg, err := config.LoadDefaultConfig(
		ctx,
		config.WithRegion(strings.TrimSpace(cfg.Region)),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, "")),
	)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
	})

	publicBase := strings.TrimSpace(cfg.PublicBaseURL)
	if publicBase == "" {
		// DigitalOcean Spaces virtual-hosted style URL:
		// https://<bucket>.<endpoint>
		publicBase = "https://" + cfg.Bucket + "." + strings.TrimPrefix(endpoint, "https://")
		publicBase = strings.TrimPrefix(publicBase, "http://")
		publicBase = "https://" + publicBase
	}

	now := func() time.Time { return time.Now() }
	return &SpacesProvider{
		Client:         client,
		Bucket:         strings.TrimSpace(cfg.Bucket),
		PublicBaseURL:  strings.TrimRight(publicBase, "/"),
		Now:            now,
		PublicReadable: cfg.PublicReadACL,
	}, nil
}

func (p *SpacesProvider) Save(ctx context.Context, fileStream io.Reader, originalFilename, contentType string) (StorageObject, error) {
	if p.Now == nil {
		p.Now = func() time.Time { return time.Now() }
	}
	key := GenerateObjectKey(p.Now(), originalFilename, contentType)

	input := &s3.PutObjectInput{
		Bucket:      aws.String(p.Bucket),
		Key:         aws.String(key),
		Body:        fileStream,
		ContentType: aws.String(contentType),
	}
	if p.PublicReadable {
		input.ACL = types.ObjectCannedACLPublicRead
	}

	if _, err := p.Client.PutObject(ctx, input); err != nil {
		return StorageObject{}, err
	}

	obj := StorageObject{
		Key:              key,
		ContentType:      contentType,
		OriginalFilename: sanitizeFilename(originalFilename),
		PublicURL:        p.GetPublicURL(ctx, key),
	}
	return obj, nil
}

func (p *SpacesProvider) Delete(ctx context.Context, objectKey string) error {
	_, err := p.Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(p.Bucket),
		Key:    aws.String(strings.TrimPrefix(objectKey, "/")),
	})
	return err
}

func (p *SpacesProvider) GetPublicURL(ctx context.Context, objectKey string) string {
	_ = ctx
	if strings.TrimSpace(p.PublicBaseURL) == "" || strings.TrimSpace(objectKey) == "" {
		return ""
	}
	return joinPublicURL(p.PublicBaseURL, strings.TrimPrefix(objectKey, "/"))
}

func (p *SpacesProvider) GetSignedURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error) {
	_ = ctx
	_ = objectKey
	_ = expiry
	return "", ErrSignedURLNotSupported
}
