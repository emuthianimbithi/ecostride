package http

import (
	"net/http"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/bibs"
	"ecostride/backend/internal/cms"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/storage"
	"ecostride/backend/internal/events"
	"ecostride/backend/internal/finance"
	"ecostride/backend/internal/payments"
	"ecostride/backend/internal/registrations"
	"ecostride/backend/internal/results"
	"ecostride/backend/internal/shop"
	"ecostride/backend/internal/sponsors"
	"ecostride/backend/internal/users"
	"ecostride/backend/internal/volunteers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Handlers bundles HTTP handlers for modules.
type Handlers struct {
	Auth          *auth.Handler
	CMS           *cms.Handler
	Events        *events.Handler
	Registrations *registrations.Handler
	Payments      *payments.Handler
	Finance       *finance.Handler
	Bibs          *bibs.Handler
	Results       *results.Handler
	Sponsors      *sponsors.Handler
	Volunteers    *volunteers.Handler
	Shop          *shop.Handler
	Users         *users.Handler
	Audit         *audit.Handler
}

// NewRouter builds the Gin engine with middleware and route registration.
func NewRouter(cfg config.Config, handlers Handlers, authManager *auth.Manager, storageProvider storage.StorageProvider) *gin.Engine {
	RegisterValidation()

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(apierrors.EnvelopeMiddleware())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CORSOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Idempotency-Key"},
		AllowCredentials: true,
	}))

	router.GET("/media/*key", NewMediaHandler(cfg, storageProvider).Serve)

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	registerAPIRoutes(router, handlers, authManager)

	return router
}
