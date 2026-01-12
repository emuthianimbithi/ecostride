package auth

import (
	"encoding/json"
	"net/http"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/common/apierrors"

	"github.com/gin-gonic/gin"
)

// Handler exposes auth HTTP handlers.
type Handler struct {
	Service *Service
	Audit   *audit.Service
}

func NewHandler(service *Service, auditService *audit.Service) *Handler {
	return &Handler{Service: service, Audit: auditService}
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type tokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	tokens, profile, err := h.Service.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", err.Error(), nil)
		return
	}

	h.logAudit(c, profile.ID, "auth.login", "user", profile.Slug, nil, profile)

	c.JSON(http.StatusOK, gin.H{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"user":          profile,
	})
}

func (h *Handler) Refresh(c *gin.Context) {
	var req tokenRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	tokens, profile, err := h.Service.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", err.Error(), nil)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"user":          profile,
	})
}

func (h *Handler) Logout(c *gin.Context) {
	var req tokenRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	userID, err := h.Service.Logout(c.Request.Context(), req.RefreshToken)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", err.Error(), nil)
		return
	}

	h.logAudit(c, userID, "auth.logout", "user", "", nil, gin.H{"status": "ok"})

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) Me(c *gin.Context) {
	claimsValue, exists := c.Get("authClaims")
	if !exists {
		apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "missing auth context", nil)
		return
	}

	claims, ok := claimsValue.(*Claims)
	if !ok {
		apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid auth context", nil)
		return
	}

	profile, err := h.Service.Profile(c.Request.Context(), claims.UserID)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "user not found", nil)
		return
	}

	c.JSON(http.StatusOK, profile)
}

func (h *Handler) logAudit(c *gin.Context, actorID uint, action, entityType, entityID string, oldValue interface{}, newValue interface{}) {
	if actorID == 0 || h.Audit == nil {
		return
	}

	oldJSON, _ := json.Marshal(oldValue)
	newJSON, _ := json.Marshal(newValue)

	_ = h.Audit.Log(c.Request.Context(), audit.Entry{
		ActorUserID: actorID,
		ActionKey:   action,
		EntityType:  entityType,
		EntityID:    entityID,
		OldJSON:     oldJSON,
		NewJSON:     newJSON,
		IP:          c.ClientIP(),
		UserAgent:   c.GetHeader("User-Agent"),
	})
}
