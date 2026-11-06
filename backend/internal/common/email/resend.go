package email

import (
	"bytes"
	"context"
	"ecostride/backend/internal/common/config"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

var resendHTTP = &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

type idempotencyKey struct{}

func WithIdempotencyKey(ctx context.Context, key string) context.Context {
	return context.WithValue(ctx, idempotencyKey{}, key)
}

func ValidateConfig(cfg config.Config) error {
	switch cfg.EmailProvider {
	case "", "console", "smtp":
		return nil
	case "resend":
		if cfg.ResendAPIKey == "" || cfg.ResendFrom == "" {
			return fmt.Errorf("Resend requires RESEND_API_KEY and RESEND_FROM")
		}
		if strings.ContainsAny(cfg.ResendFrom, "\r\n") {
			return fmt.Errorf("invalid Resend sender")
		}
		if _, err := mail.ParseAddress(cfg.ResendFrom); err != nil {
			return fmt.Errorf("invalid Resend sender")
		}
		return nil
	default:
		return fmt.Errorf("EMAIL_PROVIDER must be console, smtp or resend")
	}
}

func sendResend(ctx context.Context, cfg config.Config, to, subject, textBody, htmlBody, endpoint string, client *http.Client, attachments ...Attachment) error {
	if cfg.ResendAPIKey == "" || cfg.ResendFrom == "" {
		return fmt.Errorf("Resend requires RESEND_API_KEY and RESEND_FROM")
	}
	if strings.ContainsAny(subject+to+cfg.ResendFrom, "\r\n") {
		return fmt.Errorf("invalid email headers")
	}
	if _, err := mail.ParseAddress(cfg.ResendFrom); err != nil {
		return fmt.Errorf("invalid Resend sender")
	}
	recipient, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("invalid email recipient")
	}
	body := map[string]interface{}{"from": cfg.ResendFrom, "to": []string{recipient.Address}, "subject": subject, "text": textBody}
	if htmlBody != "" {
		body["html"] = htmlBody
	}
	if len(attachments) > 0 {
		body["attachments"] = attachments
	}
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")
	if key, ok := ctx.Value(idempotencyKey{}).(string); ok && key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	response, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("Resend request unavailable or timed out")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("Resend returned HTTP %d", response.StatusCode)
	}
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result); err != nil || result.ID == "" {
		return fmt.Errorf("invalid Resend acceptance response")
	}
	return nil
}
