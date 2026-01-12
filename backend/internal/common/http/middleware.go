package http

import (
	"net/http"
	"strings"

	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/rbac"

	"github.com/gin-gonic/gin"
)

const authContextKey = "authClaims"

// RequireAuth validates JWT access tokens and injects claims into the request context.
func RequireAuth(manager *auth.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		authorization := c.GetHeader("Authorization")
		if authorization == "" {
			apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "missing authorization header", nil)
			return
		}

		parts := strings.SplitN(authorization, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid authorization header", nil)
			return
		}

		claims, err := manager.ParseAccessToken(parts[1])
		if err != nil {
			apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid token", nil)
			return
		}

		c.Set(authContextKey, claims)
		c.Next()
	}
}

// RequirePermission enforces RBAC permissions at the route level.
func RequirePermission(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claimsValue, exists := c.Get(authContextKey)
		if !exists {
			apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "missing auth context", nil)
			return
		}

		claims, ok := claimsValue.(*auth.Claims)
		if !ok {
			apierrors.AbortWithError(c, http.StatusUnauthorized, "UNAUTHORIZED", "invalid auth context", nil)
			return
		}

		if !rbac.HasPermission(claims.Permissions, permission) {
			apierrors.AbortWithError(c, http.StatusForbidden, "FORBIDDEN", "insufficient permissions", nil)
			return
		}

		c.Next()
	}
}
