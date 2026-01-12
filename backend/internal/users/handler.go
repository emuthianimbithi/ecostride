package users

import (
	"encoding/json"
	"net/http"
	"strings"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Handler exposes user and RBAC HTTP handlers.
type Handler struct {
	Service *Service
	Audit   *audit.Service
	DB      *gorm.DB
}

func NewHandler(service *Service, auditService *audit.Service, db *gorm.DB) *Handler {
	return &Handler{Service: service, Audit: auditService, DB: db}
}

type createUserRequest struct {
	Name      string   `json:"name" binding:"required"`
	Email     string   `json:"email" binding:"required,email"`
	Phone     string   `json:"phone" binding:"omitempty,phone"`
	Password  string   `json:"password" binding:"required"`
	IsActive  *bool    `json:"is_active"`
	RoleSlugs []string `json:"role_slugs"`
}

type updateUserRequest struct {
	Name     *string `json:"name"`
	Email    *string `json:"email"`
	Phone    *string `json:"phone" binding:"omitempty,phone"`
	Password *string `json:"password"`
	IsActive *bool   `json:"is_active"`
}

type roleRequest struct {
	Name           string   `json:"name" binding:"required"`
	Description    string   `json:"description"`
	PermissionKeys []string `json:"permission_keys"`
}

type userRolesRequest struct {
	RoleSlugs []string `json:"role_slugs"`
}

func (h *Handler) ListUsers(c *gin.Context) {
	users, err := h.Service.ListUsers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *Handler) CreateUser(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	user := models.User{
		Slug:         uuid.New(),
		Name:         req.Name,
		Email:        strings.ToLower(req.Email),
		Phone:        req.Phone,
		PasswordHash: passwordHash,
		IsActive:     isActive,
	}

	if err := h.DB.WithContext(c.Request.Context()).Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	if len(req.RoleSlugs) > 0 {
		var roles []models.Role
		if err := h.DB.WithContext(c.Request.Context()).Where("slug IN ?", req.RoleSlugs).Find(&roles).Error; err == nil && len(roles) > 0 {
			_ = h.DB.WithContext(c.Request.Context()).Model(&user).Association("Roles").Replace(&roles)
		}
	}

	h.logAudit(c, "user.create", "user", user.Slug.String(), nil, user)
	c.JSON(http.StatusCreated, user)
}

func (h *Handler) UpdateUser(c *gin.Context) {
	userSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var user models.User
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", userSlug).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	old := user

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	if req.Name != nil {
		user.Name = *req.Name
	}
	if req.Email != nil {
		user.Email = strings.ToLower(*req.Email)
	}
	if req.Phone != nil {
		user.Phone = *req.Phone
	}
	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}
	if req.Password != nil && *req.Password != "" {
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
		user.PasswordHash = hash
	}

	if err := h.DB.WithContext(c.Request.Context()).Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
		return
	}

	h.logAudit(c, "user.update", "user", user.Slug.String(), old, user)
	c.JSON(http.StatusOK, user)
}

func (h *Handler) UpdateUserRoles(c *gin.Context) {
	userSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var user models.User
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", userSlug).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var req userRolesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	var roles []models.Role
	if err := h.DB.WithContext(c.Request.Context()).Where("slug IN ?", req.RoleSlugs).Find(&roles).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load roles"})
		return
	}

	if err := h.DB.WithContext(c.Request.Context()).Model(&user).Association("Roles").Replace(&roles); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update roles"})
		return
	}

	h.logAudit(c, "user.roles.update", "user", user.Slug.String(), nil, req)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) ListRoles(c *gin.Context) {
	roles, err := h.Service.ListRoles(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list roles"})
		return
	}
	c.JSON(http.StatusOK, roles)
}

func (h *Handler) CreateRole(c *gin.Context) {
	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	role := models.Role{
		Slug:        uuid.New(),
		Name:        req.Name,
		Description: req.Description,
	}

	if err := h.DB.WithContext(c.Request.Context()).Create(&role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create role"})
		return
	}

	if len(req.PermissionKeys) > 0 {
		var permissions []models.Permission
		if err := h.DB.WithContext(c.Request.Context()).Where("key IN ?", req.PermissionKeys).Find(&permissions).Error; err == nil && len(permissions) > 0 {
			_ = h.DB.WithContext(c.Request.Context()).Model(&role).Association("Permissions").Replace(&permissions)
		}
	}

	h.logAudit(c, "role.create", "role", role.Slug.String(), nil, role)
	c.JSON(http.StatusCreated, role)
}

func (h *Handler) UpdateRole(c *gin.Context) {
	roleSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role id"})
		return
	}

	var role models.Role
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", roleSlug).First(&role).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "role not found"})
		return
	}

	old := role

	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	role.Name = req.Name
	role.Description = req.Description

	if err := h.DB.WithContext(c.Request.Context()).Save(&role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update role"})
		return
	}

	if req.PermissionKeys != nil {
		var permissions []models.Permission
		if len(req.PermissionKeys) > 0 {
			if err := h.DB.WithContext(c.Request.Context()).Where("key IN ?", req.PermissionKeys).Find(&permissions).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load permissions"})
				return
			}
		}
		if err := h.DB.WithContext(c.Request.Context()).Model(&role).Association("Permissions").Replace(&permissions); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update permissions"})
			return
		}
	}

	h.logAudit(c, "role.update", "role", role.Slug.String(), old, role)
	c.JSON(http.StatusOK, role)
}

func (h *Handler) ListPermissions(c *gin.Context) {
	permissions, err := h.Service.ListPermissions(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list permissions"})
		return
	}
	c.JSON(http.StatusOK, permissions)
}

func (h *Handler) logAudit(c *gin.Context, action, entityType, entityID string, oldValue interface{}, newValue interface{}) {
	actorID := h.getActorID(c)
	if actorID == 0 {
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

func (h *Handler) getActorID(c *gin.Context) uint {
	claimsValue, exists := c.Get("authClaims")
	if !exists {
		return 0
	}
	claims, ok := claimsValue.(*auth.Claims)
	if !ok {
		return 0
	}
	return claims.UserID
}
