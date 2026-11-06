package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInactiveAccount    = errors.New("account inactive")
	ErrTokenInvalid       = errors.New("refresh token invalid")
)

// Tokens bundles access and refresh tokens.
type Tokens struct {
	AccessToken  string
	RefreshToken string
}

// Profile is the auth surface for the current user.
type Profile struct {
	ID          uint     `json:"id"`
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
}

// Service provides authentication flows.
type Service struct {
	DB  *gorm.DB
	JWT *Manager
}

func NewService(db *gorm.DB, manager *Manager) *Service {
	return &Service{DB: db, JWT: manager}
}

func (s *Service) Login(ctx context.Context, email, password string) (Tokens, Profile, error) {
	user, permissions, roles, err := s.loadUser(ctx, email)
	if err != nil {
		return Tokens{}, Profile{}, ErrInvalidCredentials
	}

	if !user.IsActive {
		return Tokens{}, Profile{}, ErrInactiveAccount
	}

	valid, err := VerifyPassword(user.PasswordHash, password)
	if err != nil || !valid {
		return Tokens{}, Profile{}, ErrInvalidCredentials
	}

	accessToken, refreshToken, err := s.issueTokens(ctx, user, permissions)
	if err != nil {
		return Tokens{}, Profile{}, err
	}

	return Tokens{AccessToken: accessToken, RefreshToken: refreshToken}, buildProfile(user, roles, permissions), nil
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (Tokens, Profile, error) {
	claims, err := s.JWT.ParseRefreshToken(refreshToken)
	if err != nil {
		return Tokens{}, Profile{}, ErrTokenInvalid
	}

	var tokens Tokens
	var profile Profile
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var stored models.RefreshToken
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND token_hash = ?", claims.UserID, hashToken(refreshToken)).First(&stored).Error; err != nil {
			return ErrTokenInvalid
		}
		if stored.RevokedAt != nil || time.Now().After(stored.ExpiresAt) {
			return ErrTokenInvalid
		}
		local := NewService(tx, s.JWT)
		user, permissions, roles, err := local.loadUserByID(ctx, claims.UserID)
		if err != nil || !user.IsActive || user.Slug != claims.UserSlug || user.AuthVersion != claims.AuthVersion {
			return ErrInactiveAccount
		}
		if err := tx.Model(&stored).Update("revoked_at", time.Now()).Error; err != nil {
			return err
		}
		access, refresh, err := local.issueTokens(ctx, user, permissions)
		if err != nil {
			return err
		}
		tokens = Tokens{AccessToken: access, RefreshToken: refresh}
		profile = buildProfile(user, roles, permissions)
		return nil
	})
	return tokens, profile, err
}

func (s *Service) Logout(ctx context.Context, refreshToken string) (uint, error) {
	claims, err := s.JWT.ParseRefreshToken(refreshToken)
	if err != nil {
		return 0, ErrTokenInvalid
	}

	refreshHash := hashToken(refreshToken)

	if err := s.DB.WithContext(ctx).
		Model(&models.RefreshToken{}).
		Where("user_id = ? AND token_hash = ? AND revoked_at IS NULL", claims.UserID, refreshHash).
		Update("revoked_at", time.Now()).
		Error; err != nil {
		return 0, err
	}

	return claims.UserID, nil
}

func (s *Service) Profile(ctx context.Context, userID uint) (Profile, error) {
	user, permissions, roles, err := s.loadUserByID(ctx, userID)
	if err != nil {
		return Profile{}, err
	}
	if !user.IsActive {
		return Profile{}, ErrInactiveAccount
	}

	return buildProfile(user, roles, permissions), nil
}

func (s *Service) ValidateAccess(ctx context.Context, claims *Claims) (Profile, error) {
	user, permissions, roles, err := s.loadUserByID(ctx, claims.UserID)
	if err != nil {
		return Profile{}, err
	}
	if !user.IsActive || user.Slug != claims.UserSlug || user.AuthVersion != claims.AuthVersion {
		return Profile{}, ErrInactiveAccount
	}
	return buildProfile(user, roles, permissions), nil
}

func (s *Service) issueTokens(ctx context.Context, user models.User, permissions []string) (string, string, error) {
	accessToken, err := s.JWT.SignAccessToken(user.ID, user.Slug, permissions, user.AuthVersion)
	if err != nil {
		return "", "", err
	}

	refreshToken, err := s.JWT.SignRefreshToken(user.ID, user.Slug, user.AuthVersion)
	if err != nil {
		return "", "", err
	}

	refreshHash := hashToken(refreshToken)
	stored := models.RefreshToken{
		UserID:    user.ID,
		TokenHash: refreshHash,
		ExpiresAt: time.Now().Add(s.JWT.RefreshTTL),
	}

	if err := s.DB.WithContext(ctx).Create(&stored).Error; err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

func (s *Service) loadUser(ctx context.Context, email string) (models.User, []string, []string, error) {
	var user models.User
	if err := s.DB.WithContext(ctx).
		Preload("Roles.Permissions").
		Where("email = ?", email).
		First(&user).Error; err != nil {
		return models.User{}, nil, nil, err
	}

	permissions, roles := extractPermissions(user)
	return user, permissions, roles, nil
}

func (s *Service) loadUserByID(ctx context.Context, id uint) (models.User, []string, []string, error) {
	var user models.User
	if err := s.DB.WithContext(ctx).
		Preload("Roles.Permissions").
		First(&user, id).Error; err != nil {
		return models.User{}, nil, nil, err
	}

	permissions, roles := extractPermissions(user)
	return user, permissions, roles, nil
}

func extractPermissions(user models.User) ([]string, []string) {
	permissionSet := make(map[string]struct{})
	roleNames := make([]string, 0, len(user.Roles))
	for _, role := range user.Roles {
		roleNames = append(roleNames, role.Name)
		for _, perm := range role.Permissions {
			permissionSet[perm.Key] = struct{}{}
		}
	}

	permissions := make([]string, 0, len(permissionSet))
	for perm := range permissionSet {
		permissions = append(permissions, perm)
	}

	return permissions, roleNames
}

func buildProfile(user models.User, roles []string, permissions []string) Profile {
	return Profile{
		ID:          user.ID,
		Slug:        user.Slug.String(),
		Name:        user.Name,
		Email:       user.Email,
		Roles:       roles,
		Permissions: permissions,
	}
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
