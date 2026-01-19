package main

import (
	"context"
	"log"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/bibs"
	"ecostride/backend/internal/cms"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/db"
	httpserver "ecostride/backend/internal/common/http"
	"ecostride/backend/internal/common/storage"
	"ecostride/backend/internal/events"
	"ecostride/backend/internal/finance"
	"ecostride/backend/internal/jobs"
	"ecostride/backend/internal/payments"
	"ecostride/backend/internal/receipts"
	"ecostride/backend/internal/registrations"
	"ecostride/backend/internal/results"
	"ecostride/backend/internal/shop"
	"ecostride/backend/internal/sponsors"
	"ecostride/backend/internal/users"
	"ecostride/backend/internal/volunteers"

	"github.com/joho/godotenv"
)

func init() {
	err := godotenv.Load()
	if err != nil {
		return
	} // loads .env file
}

func main() {
	cfg := config.Load()
	conn, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("db connect failed: %v", err)
	}

	storageProvider, err := storage.NewStorageProviderFromEnv(context.Background(), cfg)
	if err != nil {
		log.Fatalf("storage init failed: %v", err)
	}

	authManager := auth.NewManager(cfg.JWTSecret, cfg.RefreshSecret)
	authService := auth.NewService(conn, authManager)
	auditService := audit.NewService(conn)
	authHandler := auth.NewHandler(authService, auditService)
	auditHandler := audit.NewHandler(conn)
	jobsService := jobs.NewService(conn)
	receiptService := receipts.NewService(conn, cfg, jobsService)
	cmsService := cms.NewService(conn)
	cmsHandler := cms.NewHandler(cmsService, auditService, cfg, storageProvider)
	eventsService := events.NewService(conn)
	eventsHandler := events.NewHandler(eventsService, cmsService, auditService)
	registrationService := registrations.NewService(conn)
	registrationsHandler := registrations.NewHandler(registrationService, auditService, conn, cfg, jobsService, receiptService)
	paymentsService := payments.NewService(conn, cfg, receiptService)
	paymentsHandler := payments.NewHandler(paymentsService, cfg, auditService, conn)
	financeService := finance.NewService(conn)
	financeHandler := finance.NewHandler(financeService, auditService, conn, cfg)
	bibsService := bibs.NewService(conn)
	bibsHandler := bibs.NewHandler(bibsService, auditService, conn)
	resultsService := results.NewService(conn)
	resultsHandler := results.NewHandler(resultsService, auditService, conn, cfg)
	sponsorsService := sponsors.NewService(conn)
	sponsorsHandler := sponsors.NewHandler(sponsorsService, auditService, conn, cfg, storageProvider)
	volunteersService := volunteers.NewService(conn)
	volunteersHandler := volunteers.NewHandler(volunteersService, auditService, conn, cfg, jobsService)
	shopService := shop.NewService(conn)
	shopHandler := shop.NewHandler(shopService, auditService, conn, paymentsService, cfg, storageProvider)
	usersService := users.NewService(conn)
	usersHandler := users.NewHandler(usersService, auditService, conn)

	registerJobHandlers(jobsService, receiptService, conn, cfg)
	go jobsService.RunWorker(context.Background(), 2*time.Second)

	handlers := httpserver.Handlers{
		Auth:          authHandler,
		CMS:           cmsHandler,
		Events:        eventsHandler,
		Registrations: registrationsHandler,
		Payments:      paymentsHandler,
		Finance:       financeHandler,
		Bibs:          bibsHandler,
		Results:       resultsHandler,
		Sponsors:      sponsorsHandler,
		Volunteers:    volunteersHandler,
		Shop:          shopHandler,
		Users:         usersHandler,
		Audit:         auditHandler,
	}

	router := httpserver.NewRouter(cfg, handlers, authManager, storageProvider)

	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
