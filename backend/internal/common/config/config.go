package config

import (
	"os"
	"strconv"
)

// Config contains runtime configuration loaded from environment variables.
type Config struct {
	Port                string
	DatabaseURL         string
	JWTSecret           string
	RefreshSecret       string
	CORSOrigin          string
	StripeSecretKey     string
	StripeWebhookSecret string
	StripeSuccessURL    string
	StripeCancelURL     string
	MPesaConsumerKey    string
	MPesaConsumerSecret string
	MPesaShortcode      string
	MPesaPasskey        string
	MPesaCallbackURL    string
	MPesaBaseURL        string
	MPesaWebhookToken   string
	MPesaAllowedIPs     string
	EmailProvider       string
	SMTPHost            string
	SMTPPort            string
	SMTPUser            string
	SMTPPass            string
	SMTPFrom            string
	MediaStorage        string
	MediaDir            string
	BaseURL             string
	MaxUploadMB         int
}

// Load reads configuration from environment variables.
func Load() Config {
	maxUploadMB := getenvInt("MAX_UPLOAD_MB", 10)
	return Config{
		Port:                getenv("PORT", "8080"),
		DatabaseURL:         getenv("DATABASE_URL", ""),
		JWTSecret:           getenv("JWT_SECRET", ""),
		RefreshSecret:       getenv("REFRESH_SECRET", ""),
		CORSOrigin:          getenv("CORS_ORIGIN", "http://localhost:3000"),
		StripeSecretKey:     getenv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret: getenv("STRIPE_WEBHOOK_SECRET", ""),
		StripeSuccessURL:    getenv("STRIPE_SUCCESS_URL", ""),
		StripeCancelURL:     getenv("STRIPE_CANCEL_URL", ""),
		MPesaConsumerKey:    getenv("MPESA_CONSUMER_KEY", ""),
		MPesaConsumerSecret: getenv("MPESA_CONSUMER_SECRET", ""),
		MPesaShortcode:      getenv("MPESA_SHORTCODE", ""),
		MPesaPasskey:        getenv("MPESA_PASSKEY", ""),
		MPesaCallbackURL:    getenv("MPESA_CALLBACK_URL", ""),
		MPesaBaseURL:        getenv("MPESA_BASE_URL", "https://sandbox.safaricom.co.ke"),
		MPesaWebhookToken:   getenv("MPESA_WEBHOOK_TOKEN", ""),
		MPesaAllowedIPs:     getenv("MPESA_ALLOWED_IPS", ""),
		EmailProvider:       getenv("EMAIL_PROVIDER", "console"),
		SMTPHost:            getenv("SMTP_HOST", ""),
		SMTPPort:            getenv("SMTP_PORT", "587"),
		SMTPUser:            getenv("SMTP_USER", ""),
		SMTPPass:            getenv("SMTP_PASS", ""),
		SMTPFrom:            getenv("SMTP_FROM", ""),
		MediaStorage:        getenv("MEDIA_STORAGE", "local"),
		MediaDir:            getenv("MEDIA_DIR", "./uploads"),
		BaseURL:             getenv("BASE_URL", "http://localhost:8080"),
		MaxUploadMB:         maxUploadMB,
	}
}

func getenv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}

	return fallback
}

func getenvInt(key string, fallback int) int {
	if raw := os.Getenv(key); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			return v
		}
	}
	return fallback
}
