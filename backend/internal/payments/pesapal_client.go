package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"ecostride/backend/internal/common/config"
	"github.com/google/uuid"
)

var errPesaPalUnauthorized = errors.New("PesaPal authorization expired")

type PesaPalClient struct {
	BaseURL     string
	HTTP        *http.Client
	key, secret string
	mu          sync.Mutex
	token       string
	expires     time.Time
}

func NewPesaPalClient(cfg config.Config) *PesaPalClient {
	base := "https://cybqa.pesapal.com/pesapalv3/api"
	if cfg.PesaPalEnvironment == "live" {
		base = "https://pay.pesapal.com/v3/api"
	}
	return &PesaPalClient{BaseURL: base, key: cfg.PesaPalConsumerKey, secret: cfg.PesaPalConsumerSecret, HTTP: &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func ValidatePesaPalConfig(cfg config.Config) error {
	if !cfg.PesaPalEnabled {
		return nil
	}
	if cfg.PesaPalEnvironment != "sandbox" && cfg.PesaPalEnvironment != "live" {
		return errors.New("PESAPAL_ENVIRONMENT must be sandbox or live")
	}
	if cfg.PesaPalConsumerKey == "" || cfg.PesaPalConsumerSecret == "" {
		return errors.New("PesaPal credentials required when enabled")
	}
	if _, err := uuid.Parse(cfg.PesaPalNotificationID); err != nil {
		return errors.New("PESAPAL_NOTIFICATION_ID must be a registered IPN UUID")
	}
	for _, raw := range []string{cfg.BaseURL, cfg.PesaPalReturnURL} {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(cfg.PesaPalEnvironment == "sandbox" && u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))) {
			return errors.New("PesaPal callback/return URLs must be HTTPS (sandbox permits localhost HTTP), without credentials, query or fragment")
		}
	}
	return nil
}
func (c *PesaPalClient) request(ctx context.Context, method, path string, body interface{}, token string, out interface{}) error {
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return errors.New("PesaPal request unavailable or timed out")
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return errPesaPalUnauthorized
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("PesaPal returned HTTP %d", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out); err != nil {
		return errors.New("invalid PesaPal response")
	}
	return nil
}
func (c *PesaPalClient) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Now().Before(c.expires) {
		return c.token, nil
	}
	var result struct {
		Token  string `json:"token"`
		Expiry string `json:"expiryDate"`
		Status string `json:"status"`
	}
	if err := c.request(ctx, "POST", "/Auth/RequestToken", map[string]string{"consumer_key": c.key, "consumer_secret": c.secret}, "", &result); err != nil {
		return "", err
	}
	expiry, err := time.Parse(time.RFC3339Nano, result.Expiry)
	if err != nil || result.Token == "" || result.Status != "200" || time.Until(expiry) < 30*time.Second {
		return "", errors.New("PesaPal authentication failed")
	}
	c.token = result.Token
	c.expires = expiry.Add(-30 * time.Second)
	return c.token, nil
}
func (c *PesaPalClient) call(ctx context.Context, method, path string, body, out interface{}) error {
	token, err := c.accessToken(ctx)
	if err != nil {
		return err
	}
	// Only reads can be retried automatically after explicit token rejection.
	err = c.request(ctx, method, path, body, token, out)
	if errors.Is(err, errPesaPalUnauthorized) {
		c.mu.Lock()
		if c.token == token {
			c.token = ""
		}
		c.mu.Unlock()
		if method == http.MethodGet {
			token, refreshErr := c.accessToken(ctx)
			if refreshErr != nil {
				return refreshErr
			}
			return c.request(ctx, method, path, body, token, out)
		}
	}
	return err
}

type pesaPalOrder struct {
	TrackingID  string `json:"order_tracking_id"`
	Reference   string `json:"merchant_reference"`
	RedirectURL string `json:"redirect_url"`
	Status      string `json:"status"`
}
type pesaPalStatus struct {
	Reference    string      `json:"merchant_reference"`
	Amount       json.Number `json:"amount"`
	Currency     string      `json:"currency"`
	Code         int         `json:"status_code"`
	Description  string      `json:"payment_status_description"`
	Confirmation string      `json:"confirmation_code"`
	Status       string      `json:"status"`
}

func validPesaPalRedirect(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.User == nil && (u.Host == "pay.pesapal.com" || u.Host == "cybqa.pesapal.com")
}
