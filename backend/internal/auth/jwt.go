package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Claims defines JWT claims used for authentication.
type Claims struct {
	UserID      uint      `json:"uid"`
	UserSlug    uuid.UUID `json:"slug"`
	Permissions []string  `json:"perms"`
	jwt.RegisteredClaims
}

// Manager handles JWT signing and verification.
type Manager struct {
	AccessSecret  []byte
	RefreshSecret []byte
	AccessTTL     time.Duration
	RefreshTTL    time.Duration
}

func NewManager(accessSecret, refreshSecret string) *Manager {
	return &Manager{
		AccessSecret:  []byte(accessSecret),
		RefreshSecret: []byte(refreshSecret),
		AccessTTL:     15 * time.Minute,
		RefreshTTL:    7 * 24 * time.Hour,
	}
}

func (m *Manager) SignAccessToken(userID uint, userSlug uuid.UUID, permissions []string) (string, error) {
	claims := Claims{
		UserID:      userID,
		UserSlug:    userSlug,
		Permissions: permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(m.AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   "access",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.AccessSecret)
}

func (m *Manager) SignRefreshToken(userID uint, userSlug uuid.UUID) (string, error) {
	claims := Claims{
		UserID:   userID,
		UserSlug: userSlug,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(m.RefreshTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   "refresh",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.RefreshSecret)
}

func (m *Manager) ParseAccessToken(tokenString string) (*Claims, error) {
	claims, err := parseToken(tokenString, m.AccessSecret)
	if err != nil {
		return nil, err
	}
	if claims.Subject != "access" {
		return nil, errors.New("invalid token subject")
	}
	return claims, nil
}

func (m *Manager) ParseRefreshToken(tokenString string) (*Claims, error) {
	claims, err := parseToken(tokenString, m.RefreshSecret)
	if err != nil {
		return nil, err
	}
	if claims.Subject != "refresh" {
		return nil, errors.New("invalid token subject")
	}
	return claims, nil
}

func parseToken(tokenString string, secret []byte) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}
