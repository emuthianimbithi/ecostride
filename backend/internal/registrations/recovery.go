package registrations

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/apierrors"
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
	"github.com/google/uuid"
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

type recoveryCategory struct {
	Slug          uuid.UUID `json:"slug"`
	Name          string    `json:"name"`
	PriceKESMinor int       `json:"price_kes_minor"`
}

func (h *Handler) VerifyRecovery(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	c.Header("Cache-Control", "private, no-store")
	var req struct {
		Token        string `json:"token"`
		CategorySlug string `json:"category_slug"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Token) != 64 {
		apierrors.AbortWithError(c, 400, "RECOVERY_LINK_INVALID", "This link is incomplete. Request a new recovery email.", nil)
		return
	}
	if _, err := hex.DecodeString(req.Token); err != nil {
		apierrors.AbortWithError(c, 400, "RECOVERY_LINK_INVALID", "This link is invalid. Request a new recovery email.", nil)
		return
	}
	invalid, expired, used, unavailable, emailChanged, categoryConflict := errors.New("invalid"), errors.New("expired"), errors.New("used"), errors.New("entry unavailable"), errors.New("email changed"), errors.New("category conflict")
	var response gin.H
	err := h.DB.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
		var record models.RegistrationRecovery
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("token_hash = ?", recoveryHash(req.Token)).First(&record).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid
			}
			return err
		}
		if time.Now().After(record.ExpiresAt) {
			return expired
		}
		if record.ConsumedAt != nil {
			return used
		}
		// Lock existing attempts before the registration, matching settlement's lock
		// order. Re-read attempts after the registration lock to include new claims.
		var attempts []models.Payment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("registration_id = ?", record.RegistrationID).Order("id").Find(&attempts).Error; err != nil {
			return err
		}
		var reg models.Registration
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&reg, record.RegistrationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return unavailable
			}
			return err
		}
		if strings.ToLower(strings.TrimSpace(reg.Email)) != record.Email {
			return emailChanged
		}
		var event models.Event
		if err := tx.First(&event, reg.EventID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return unavailable
			}
			return err
		}
		var payment models.Payment
		if err := tx.Where("registration_id = ?", reg.ID).Order("CASE WHEN status IN ('success','paid','refunded','chargeback') THEN 0 WHEN status IN ('pending','processing') THEN 1 ELSE 2 END, created_at DESC, id DESC").Limit(1).Find(&payment).Error; err != nil {
			return err
		}
		base := gin.H{"registration_slug": reg.Slug, "event_title": event.Title, "athlete_name": reg.AthleteName, "next_action": "contact_support", "payment_id": ""}
		if payment.ID != 0 {
			base["payment_id"] = payment.Slug.String()
		}
		var category models.EventCategory
		if reg.CategoryID != nil {
			if err := tx.Where("id = ? AND event_id = ?", *reg.CategoryID, event.ID).Limit(1).Find(&category).Error; err != nil {
				return err
			}
		}
		var categoryCount int64
		if err := tx.Model(&models.EventCategory{}).Where("event_id = ?", event.ID).Count(&categoryCount).Error; err != nil {
			return err
		}
		missingCategory := (reg.CategoryID != nil && category.ID == 0) || (reg.CategoryID == nil && categoryCount > 0)
		unpaid := (reg.Status == "created" || reg.Status == "pending_payment") && (payment.ID == 0 || payment.Status == "failed")
		var assigned int64
		if err := tx.Model(&models.BibAssignment{}).Where("registration_id = ?", reg.ID).Count(&assigned).Error; err != nil {
			return err
		}
		if missingCategory && unpaid && assigned == 0 {
			var choices []recoveryCategory
			if err := tx.Model(&models.EventCategory{}).Select("slug, name, price_kes_minor").Where("event_id = ? AND (price_kes_minor > 0 OR (price_kes_minor = 0 AND COALESCE(price_usd_minor,0) = 0 AND COALESCE(price_eur_minor,0) = 0))", event.ID).Order("created_at, id").Find(&choices).Error; err != nil {
				return err
			}
			if req.CategorySlug == "" && len(choices) > 0 {
				base["next_action"] = "select_category"
				base["categories"] = choices
				base["message"] = "Your previous race category is no longer available. Choose a current category to continue your saved registration."
				response = base
				return nil // The verified link stays usable until selection.
			}
			if req.CategorySlug != "" {
				slug, err := uuid.Parse(req.CategorySlug)
				if err != nil {
					return categoryConflict
				}
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("slug = ? AND event_id = ?", slug, event.ID).First(&category).Error; err != nil {
					if errors.Is(err, gorm.ErrRecordNotFound) {
						return categoryConflict
					}
					return err
				}
				if category.PriceKESMinor < 0 || (category.PriceKESMinor == 0 && ((category.PriceUSDMinor != nil && *category.PriceUSDMinor > 0) || (category.PriceEURMinor != nil && *category.PriceEURMinor > 0))) {
					return categoryConflict
				}
				if category.Capacity != nil && *category.Capacity > 0 {
					var count int64
					if err := tx.Model(&models.Registration{}).Where("category_id = ? AND id <> ? AND status IN ?", category.ID, reg.ID, []string{"created", "pending_payment", "paid", "confirmed"}).Count(&count).Error; err != nil {
						return err
					}
					if count >= int64(*category.Capacity) {
						return categoryConflict
					}
				}
				previous := reg.CategoryID
				// A later correction of an old failed attempt must be reviewed, rather than
				// paying for a different category behind the customer's back.
				if err := tx.Model(&models.Payment{}).Where("registration_id = ? AND status = 'failed'", reg.ID).Update("metadata", gorm.Expr(`(CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END) || '{"category_superseded":true}'::jsonb`)).Error; err != nil {
					return err
				}
				reg.CategoryID = &category.ID
				updates := map[string]interface{}{"category_id": category.ID}
				if category.PriceKESMinor == 0 {
					reg.Status = "confirmed"
					updates["status"] = "confirmed"
				}
				if err := tx.Model(&reg).Updates(updates).Error; err != nil {
					return err
				}
				auditValue, _ := json.Marshal(gin.H{"previous_category_id": previous, "category_slug": category.Slug, "price_kes_minor": category.PriceKESMinor})
				if err := audit.NewService(tx).Log(c.Request.Context(), audit.Entry{ActionKey: "registration.category.recover", EntityType: "registration", EntityID: reg.Slug.String(), NewJSON: auditValue, IP: c.ClientIP(), UserAgent: c.GetHeader("User-Agent")}); err != nil {
					return err
				}
				if reg.Status == "confirmed" {
					if _, err := jobs.NewService(tx).Enqueue(c.Request.Context(), "registration.confirmation", registrationJobPayload{RegistrationID: reg.ID}, time.Now()); err != nil {
						return err
					}
				}
				missingCategory = false
			}
		} else if req.CategorySlug != "" {
			return categoryConflict
		}
		ticket, err := tickets.Load(c.Request.Context(), tx, reg.ID)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err == nil && ticket.Eligible {
			base["next_action"] = "view_ticket"
		} else if reg.Status == "created" || reg.Status == "pending_payment" {
			if payment.ID != 0 && payment.Status != "failed" {
				base["next_action"] = "view_payment"
			} else if !missingCategory && category.ID != 0 && category.PriceKESMinor > 0 {
				base["next_action"] = "retry_payment"
			}
		}
		if err := tx.Model(&record).Update("consumed_at", time.Now()).Error; err != nil {
			return err
		}
		response = base
		return nil
	})
	if err != nil {
		code, status, message := "RECOVERY_UNAVAILABLE", 503, "We couldn't check your registration right now. Please try again."
		switch {
		case errors.Is(err, invalid):
			code, status, message = "RECOVERY_LINK_INVALID", 400, "This link was not recognized. Request a new recovery email."
		case errors.Is(err, expired):
			code, status, message = "RECOVERY_LINK_EXPIRED", 400, "This recovery link has expired. Request a new email."
		case errors.Is(err, used):
			code, status, message = "RECOVERY_LINK_USED", 400, "This link has already been used. Request a new email to continue."
		case errors.Is(err, unavailable):
			code, status, message = "RECOVERY_ENTRY_UNAVAILABLE", 410, "This registration or event is no longer available. Contact the team for help."
		case errors.Is(err, emailChanged):
			code, status, message = "RECOVERY_EMAIL_CHANGED", 400, "The registration email has changed. Request a new link using the current email."
		case errors.Is(err, categoryConflict):
			code, status, message = "RECOVERY_CATEGORY_UNAVAILABLE", 409, "That category is unavailable or cannot be changed on this entry. Choose another option or contact the team."
		}
		apierrors.AbortWithError(c, status, code, message, nil)
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
