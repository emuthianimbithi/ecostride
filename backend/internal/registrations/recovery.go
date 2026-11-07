package registrations

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/email"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/jobs"
	"ecostride/backend/internal/tickets"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type RecoveryEmailPayload struct {
	RecoveryID     uint   `json:"recovery_id"`
	EncryptedToken string `json:"encrypted_token"`
}

func recoveryCipher(secret string) (cipher.AEAD, error) {
	if secret == "" {
		return nil, errors.New("recovery encryption is not configured")
	}
	key := sha256.Sum256([]byte("ecostride/registration-recovery/" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func sealRecoveryToken(secret, token string) (string, error) {
	aead, err := recoveryCipher(secret)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(aead.Seal(nonce, nonce, []byte(token), nil)), nil
}
func openRecoveryToken(secret, encrypted string) (string, error) {
	aead, err := recoveryCipher(secret)
	if err != nil {
		return "", err
	}
	data, err := base64.RawURLEncoding.DecodeString(encrypted)
	if err != nil || len(data) < aead.NonceSize() {
		return "", errors.New("invalid recovery email payload")
	}
	plain, err := aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], nil)
	return string(plain), err
}

func recoveryHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func (h *Handler) RequestRecovery(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if (h.Config.EmailProvider != "resend" && h.Config.EmailProvider != "smtp") || h.Config.JWTSecret == "" {
		c.JSON(503, gin.H{"error": "email recovery is temporarily unavailable; please contact support"})
		return
	}
	var req struct {
		EventSlug string `json:"event_slug" binding:"required"`
		Email     string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "event and a valid email are required"})
		return
	}
	address := strings.ToLower(strings.TrimSpace(req.Email))
	err := h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		key := req.EventSlug + ":" + address
		if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 7))", key).Error; err != nil {
			return err
		}
		var reg models.Registration
		err := tx.Select("registrations.*").Joins("JOIN events ON events.id = registrations.event_id AND events.deleted_at IS NULL").Where("events.url_slug = ? AND LOWER(TRIM(registrations.email)) = ? AND registrations.status IN ?", req.EventSlug, address, []string{"created", "pending_payment", "paid", "confirmed", "failed"}).Order("registrations.created_at DESC").Limit(1).Find(&reg).Error
		if err != nil {
			return err
		}
		if reg.ID == 0 {
			return nil
		}
		var count int64
		if err := tx.Model(&models.RegistrationRecovery{}).Where("registration_id = ? AND created_at > ?", reg.ID, time.Now().Add(-time.Minute)).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return nil
		}
		if err := tx.Model(&models.RegistrationRecovery{}).Where("registration_id = ? AND created_at > ?", reg.ID, time.Now().Add(-time.Hour)).Count(&count).Error; err != nil {
			return err
		}
		if count >= 5 {
			return nil
		}
		var secret [32]byte
		if _, err := rand.Read(secret[:]); err != nil {
			return err
		}
		token := hex.EncodeToString(secret[:])
		record := models.RegistrationRecovery{RegistrationID: reg.ID, Email: address, TokenHash: recoveryHash(token), ExpiresAt: time.Now().Add(15 * time.Minute)}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		encrypted, err := sealRecoveryToken(h.Config.JWTSecret, token)
		if err != nil {
			return err
		}
		_, err = jobs.NewService(tx).Enqueue(c.Request.Context(), "registration.recovery", RecoveryEmailPayload{RecoveryID: record.ID, EncryptedToken: encrypted}, time.Now())
		return err
	})
	if err != nil {
		c.JSON(503, gin.H{"error": "unable to request a recovery email; please try again later"})
		return
	}
	c.JSON(202, gin.H{"message": "If an eligible registration matches, a secure link will be sent to that email. Check your inbox and spam folder."})
}

func SendRecoveryEmail(ctx context.Context, cfg config.Config, db *gorm.DB, payload RecoveryEmailPayload) error {
	if cfg.EmailProvider != "resend" && cfg.EmailProvider != "smtp" {
		return errors.New("recovery needs a configured email delivery provider")
	}
	var record models.RegistrationRecovery
	if err := db.WithContext(ctx).First(&record, payload.RecoveryID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if record.ConsumedAt != nil || time.Now().After(record.ExpiresAt) {
		return nil
	}
	token, err := openRecoveryToken(cfg.JWTSecret, payload.EncryptedToken)
	if err != nil {
		return err
	}
	if recoveryHash(token) != record.TokenHash {
		return nil
	}
	var reg models.Registration
	if err := db.WithContext(ctx).First(&reg, record.RegistrationID).Error; err != nil {
		return err
	}
	if strings.ToLower(strings.TrimSpace(reg.Email)) != record.Email {
		return nil
	}
	base := strings.TrimRight(cfg.BaseURL, "/")
	if u, err := url.Parse(cfg.PesaPalReturnURL); err == nil && u.Scheme != "" && u.Host != "" {
		base = u.Scheme + "://" + u.Host
	}
	link := base + "/registration-recovery#token=" + url.QueryEscape(token)
	text, html, err := email.RenderTransactional(email.TransactionalData{Eyebrow: "CONTINUE YOUR REGISTRATION", Title: "Pick up where you left off.", Name: reg.AthleteName, Intro: "Use this secure link to view your race entry and continue an unfinished payment. Opening it does not charge you or create another registration.", ReferenceLabel: "Link expires", Reference: "15 minutes after your request", Primary: email.Action{Label: "Continue your registration", URL: link}, Footer: "This link can be used once. If you did not request it, you can ignore this email.", ContactURL: base + "/contact"})
	if err != nil {
		return err
	}
	return email.SendRichContext(ctx, cfg, record.Email, "Continue your EcoStride registration", text, html)
}

func (h *Handler) VerifyRecovery(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	c.Header("Cache-Control", "private, no-store")
	var req struct {
		Token string `json:"token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Token) != 64 {
		c.JSON(400, gin.H{"error": "invalid or expired link; request a new email"})
		return
	}
	if _, err := hex.DecodeString(req.Token); err != nil {
		c.JSON(400, gin.H{"error": "invalid or expired link; request a new email"})
		return
	}
	invalid := errors.New("invalid recovery")
	var response gin.H
	err := h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var record models.RegistrationRecovery
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("token_hash = ?", recoveryHash(req.Token)).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid
			}
			return err
		}
		if record.ConsumedAt != nil || time.Now().After(record.ExpiresAt) {
			return invalid
		}
		ticket, err := tickets.Load(c.Request.Context(), tx, record.RegistrationID)
		if err != nil {
			return invalid
		}
		reg := ticket.Registration
		if strings.ToLower(strings.TrimSpace(reg.Email)) != record.Email {
			return invalid
		}
		action := "contact_support"
		paymentID := ""
		var payment models.Payment
		// A pending/settled attempt outranks failed attempts, even if a failed row is newer.
		if err := tx.Where("registration_id = ?", reg.ID).Order("CASE WHEN status IN ('success','paid','refunded','chargeback') THEN 0 WHEN status IN ('pending','processing') THEN 1 ELSE 2 END, created_at DESC, id DESC").Limit(1).Find(&payment).Error; err != nil {
			return err
		}
		if ticket.Eligible {
			action = "view_ticket"
		} else if reg.Status == "created" || reg.Status == "pending_payment" {
			if payment.ID == 0 || payment.Status == "failed" {
				action = "retry_payment"
			} else {
				action = "view_payment"
				paymentID = payment.Slug.String()
			}
		}
		if err := tx.Model(&record).Update("consumed_at", time.Now()).Error; err != nil {
			return err
		}
		response = gin.H{"registration_slug": reg.Slug, "event_title": ticket.Event.Title, "athlete_name": reg.AthleteName, "next_action": action, "payment_id": paymentID}
		return nil
	})
	if err != nil {
		code := 503
		if errors.Is(err, invalid) {
			code = 400
		}
		c.JSON(code, gin.H{"error": "invalid, used or expired link; request a new email"})
		return
	}
	c.JSON(200, response)
}

// DecodeRecoveryPayload keeps the worker payload type private from public APIs.
func DecodeRecoveryPayload(raw []byte) (RecoveryEmailPayload, error) {
	var p RecoveryEmailPayload
	err := json.Unmarshal(raw, &p)
	return p, err
}
