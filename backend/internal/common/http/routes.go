package http

import (
	"net/http"
	"time"

	"ecostride/backend/internal/auth"

	"github.com/gin-gonic/gin"
)

func registerAPIRoutes(router *gin.Engine, handlers Handlers, authManager *auth.Manager) {
	api := router.Group("/api/v1")

	// Auth
	authGroup := api.Group("/auth")
	authGroup.POST("/login", RateLimit("auth.login", 5, time.Minute), handlers.Auth.Login)
	authGroup.POST("/refresh", handlers.Auth.Refresh)
	authGroup.POST("/logout", handlers.Auth.Logout)
	api.GET("/me", RequireAuth(authManager), handlers.Auth.Me)

	// Public CMS + site
	public := api.Group("/public")
	public.GET("/pages/:slug", handlers.CMS.GetPublishedPage)
	public.GET("/pages", handlers.CMS.ListPages)
	public.GET("/posts", handlers.CMS.ListPublicPosts)
	public.GET("/posts/:slug", handlers.CMS.GetPublishedPost)
	public.GET("x:slug", handlers.CMS.GetPublishedPost)
	public.GET("/hero-styles", handlers.CMS.ListHeroStyles)
	public.GET("/gallery/albums", handlers.CMS.GetGalleryAlbums)
	public.GET("/gallery/albums/:slug", handlers.CMS.GetGalleryAlbum)
	public.GET("/sponsors", handlers.Sponsors.ListPublicSponsors)
	public.POST("/sponsors/:slug/view", handlers.Sponsors.RecordView)

	// Public events
	public.GET("/events", handlers.Events.ListPublicEvents)
	public.GET("/events/:slug", handlers.Events.GetPublicEvent)
	public.GET("/events/:slug/categories", handlers.Events.ListPublicCategories)
	public.GET("/events/:slug/waiver/current", handlers.Events.GetCurrentWaiver)
	public.GET("/events/:slug/form-fields", handlers.Events.ListPublicFormFields)

	// Public registration
	public.POST("/registrations", RateLimit("public.registration", 10, time.Minute), handlers.Registrations.CreatePublicRegistration)
	public.GET("/registrations/:id", handlers.Registrations.GetPublicRegistration)
	public.GET("/registrations/:id/confirmation.pdf", handlers.Registrations.GetPublicConfirmationPDF)

	// Public payments
	public.POST("/payments/stripe/checkout", RateLimit("public.payments.stripe", 5, time.Minute), handlers.Payments.StripeCheckout)
	api.POST("/webhooks/stripe", handlers.Payments.StripeWebhook)
	public.POST("/payments/mpesa/stk", RateLimit("public.payments.mpesa", 5, time.Minute), handlers.Payments.MpesaSTK)
	api.POST("/webhooks/mpesa", handlers.Payments.MpesaWebhook)
	public.GET("/payments/:id/status", handlers.Payments.PaymentStatus)

	// Public results
	public.GET("/results/events/:slug", handlers.Results.ListPublicResults)
	public.GET("/results/events/:slug/search", handlers.Results.SearchPublicResults)
	public.GET("/results/events/:slug/leaderboard", handlers.Results.Leaderboard)

	// Public volunteers
	public.POST("/volunteers", handlers.Volunteers.CreatePublicVolunteer)

	// Public fundraising
	public.GET("/shop/products", handlers.Shop.ListPublicProducts)
	public.GET("/shop/:slug", handlers.Shop.GetOrderBySlug)
	public.POST("/shop/orders", RateLimit("public.shop.orders", 10, time.Minute), handlers.Shop.CreateOrder)
	public.POST("/shop/orders/:id/pay/stripe", RateLimit("public.shop.pay.stripe", 5, time.Minute), handlers.Shop.PayOrderStripe)
	public.POST("/shop/orders/:id/pay/mpesa", RateLimit("public.shop.pay.mpesa", 5, time.Minute), handlers.Shop.PayOrderMpesa)

	// Admin
	admin := api.Group("/admin")
	admin.Use(RequireAuth(authManager))

	// Admin: CMS
	admin.GET("/pages", RequirePermission("cms.page.read"), handlers.CMS.ListPages)
	admin.POST("/pages", RequirePermission("cms.page.write"), handlers.CMS.CreatePage)
	admin.PUT("/pages/:id", RequirePermission("cms.page.write"), handlers.CMS.UpdatePage)
	admin.DELETE("/pages/:id", RequirePermission("cms.page.write"), handlers.CMS.DeletePage)
	admin.POST("/pages/:id/publish", RequirePermission("cms.page.publish"), handlers.CMS.PublishPage)
	admin.GET("/posts", RequirePermission("cms.post.read"), handlers.CMS.ListPosts)
	admin.POST("/posts", RequirePermission("cms.post.write"), handlers.CMS.CreatePost)
	admin.PUT("/posts/:id", RequirePermission("cms.post.write"), handlers.CMS.UpdatePost)
	admin.DELETE("/posts/:id", RequirePermission("cms.post.write"), handlers.CMS.DeletePost)
	admin.POST("/posts/:id/publish", RequirePermission("cms.post.publish"), handlers.CMS.PublishPost)
	admin.POST("/media/upload", RequirePermission("cms.media.write"), handlers.CMS.UploadMedia)
	admin.GET("/media", RequirePermission("cms.media.read"), handlers.CMS.ListMedia)
	admin.GET("/hero-styles", RequirePermission("cms.herostyle.read"), handlers.CMS.ListHeroStyles)
	admin.POST("/hero-styles", RequirePermission("cms.herostyle.write"), handlers.CMS.CreateHeroStyle)
	admin.PUT("/hero-styles/:id", RequirePermission("cms.herostyle.write"), handlers.CMS.UpdateHeroStyle)
	admin.POST("/hero-styles/:id/disable", RequirePermission("cms.herostyle.disable"), handlers.CMS.DisableHeroStyle)
	admin.GET("/settings/default-hero-style", RequirePermission("cms.herostyle.read"), handlers.CMS.GetDefaultHeroStyle)
	admin.PUT("/settings/default-hero-style", RequirePermission("cms.settings.write"), handlers.CMS.SetDefaultHeroStyle)
	admin.GET("/gallery/albums", RequirePermission("cms.media.read"), handlers.CMS.ListAdminGalleryAlbums)
	admin.GET("/gallery/albums/:slug", RequirePermission("cms.media.read"), handlers.CMS.GetAdminGalleryAlbum)
	admin.POST("/gallery/albums", RequirePermission("cms.media.write"), handlers.CMS.CreateGalleryAlbum)
	admin.PUT("/gallery/albums/:slug", RequirePermission("cms.media.write"), handlers.CMS.UpdateGalleryAlbum)
	admin.DELETE("/gallery/albums/:slug", RequirePermission("cms.media.write"), handlers.CMS.DeleteGalleryAlbum)
	admin.PUT("/gallery/albums/:slug/media", RequirePermission("cms.media.write"), handlers.CMS.SetAlbumMedia)
	admin.GET("/waivers", RequirePermission("cms.waiver.read"), handlers.CMS.ListWaivers)
	admin.POST("/waivers", RequirePermission("cms.waiver.write"), handlers.CMS.CreateWaiver)
	admin.PUT("/waivers/:id", RequirePermission("cms.waiver.write"), handlers.CMS.UpdateWaiver)

	// Admin: Users/RBAC
	admin.GET("/users", RequirePermission("user.manage"), handlers.Users.ListUsers)
	admin.POST("/users", RequirePermission("user.manage"), handlers.Users.CreateUser)
	admin.PUT("/users/:id", RequirePermission("user.manage"), handlers.Users.UpdateUser)
	admin.POST("/users/:id/roles", RequirePermission("user.manage"), handlers.Users.UpdateUserRoles)
	admin.GET("/roles", RequirePermission("user.manage"), handlers.Users.ListRoles)
	admin.POST("/roles", RequirePermission("user.manage"), handlers.Users.CreateRole)
	admin.PUT("/roles/:id", RequirePermission("user.manage"), handlers.Users.UpdateRole)
	admin.GET("/permissions", RequirePermission("user.manage"), handlers.Users.ListPermissions)

	// Admin: Events
	admin.GET("/events", RequirePermission("event.read"), handlers.Events.ListEvents)
	admin.GET("/events/:id", RequirePermission("event.read"), handlers.Events.GetEvent)
	admin.POST("/events", RequirePermission("event.write"), handlers.Events.CreateEvent)
	admin.PUT("/events/:id", RequirePermission("event.write"), handlers.Events.UpdateEvent)
	admin.DELETE("/events/:id", RequirePermission("event.write"), handlers.Events.DeleteEvent)
	admin.POST("/events/:id/publish", RequirePermission("event.publish"), handlers.Events.PublishEvent)
	admin.GET("/events/:id/categories", RequirePermission("event.category.write"), handlers.Events.ListCategories)
	admin.POST("/events/:id/categories", RequirePermission("event.category.write"), handlers.Events.CreateCategory)
	admin.PUT("/events/:id/categories/:categoryId", RequirePermission("event.category.write"), handlers.Events.UpdateCategory)
	admin.DELETE("/events/:id/categories/:categoryId", RequirePermission("event.category.write"), handlers.Events.DeleteCategory)
	admin.GET("/events/:id/form-fields", RequirePermission("event.formfields.write"), handlers.Events.ListFormFields)
	admin.POST("/events/:id/form-fields", RequirePermission("event.formfields.write"), handlers.Events.CreateFormField)
	admin.PUT("/events/:id/form-fields/:fieldId", RequirePermission("event.formfields.write"), handlers.Events.UpdateFormField)
	admin.DELETE("/events/:id/form-fields/:fieldId", RequirePermission("event.formfields.write"), handlers.Events.DeleteFormField)

	// Admin: Registrations
	admin.GET("/registrations", RequirePermission("registration.read"), handlers.Registrations.ListRegistrations)
	admin.GET("/registrations/export", RequirePermission("registration.read"), handlers.Registrations.ExportRegistrations)
	admin.GET("/registrations/:id", RequirePermission("registration.read"), handlers.Registrations.GetRegistration)
	admin.PUT("/registrations/:id", RequirePermission("registration.write"), handlers.Registrations.UpdateRegistration)
	admin.POST("/registrations/:id/cancel", RequirePermission("registration.cancel"), handlers.Registrations.CancelRegistration)
	admin.POST("/registrations/:id/resend-confirmation", RequirePermission("registration.read"), handlers.Registrations.ResendConfirmation)
	admin.POST("/registrations/:id/resend-receipt", RequirePermission("payment.read"), handlers.Registrations.ResendReceipt)

	// Admin: Payments + Finance
	admin.GET("/payments", RequirePermission("payment.read"), handlers.Payments.ListPayments)
	admin.POST("/payments/:id/refund", RequirePermission("payment.refund"), handlers.Payments.Refund)
	admin.GET("/finance/dashboard", RequirePermission("finance.export"), handlers.Finance.Dashboard)
	admin.GET("/finance/export", RequirePermission("finance.export"), handlers.Finance.Export)

	// Admin: Reconciliation
	admin.POST("/reconciliation/import", RequirePermission("finance.reconcile.import"), handlers.Finance.ReconcileImport)
	admin.POST("/reconciliation/match", RequirePermission("finance.reconcile.import"), handlers.Finance.ReconcileMatch)
	admin.POST("/reconciliation/resolve", RequirePermission("finance.reconcile.import"), handlers.Finance.ReconcileResolve)

	// Admin: Bibs + Check-in
	admin.POST("/events/:id/bibs/auto-assign", RequirePermission("bib.assign.auto"), handlers.Bibs.AutoAssign)
	admin.POST("/events/:id/bibs/manual-assign", RequirePermission("bib.assign.manual"), handlers.Bibs.ManualAssign)
	admin.POST("/events/:id/bibs/lock", RequirePermission("bib.assign.manual"), handlers.Bibs.LockBibs)
	admin.GET("/events/:id/start-list/export", RequirePermission("event.read"), handlers.Bibs.StartListExport)
	admin.POST("/checkin/:registrationId", RequirePermission("checkin.access"), handlers.Bibs.CheckIn)

	// Admin: Results
	admin.POST("/events/:id/results/import", RequirePermission("results.import"), handlers.Results.ImportResults)
	admin.POST("/events/:id/results/publish", RequirePermission("results.publish"), handlers.Results.PublishResults)
	admin.POST("/events/:id/results/unpublish", RequirePermission("results.publish"), handlers.Results.UnpublishResults)

	// Admin: Sponsors
	admin.GET("/sponsor-tiers", RequirePermission("sponsor.read"), handlers.Sponsors.ListTiers)
	admin.POST("/sponsor-tiers", RequirePermission("sponsor.write"), handlers.Sponsors.CreateTier)
	admin.PUT("/sponsor-tiers/:id", RequirePermission("sponsor.write"), handlers.Sponsors.UpdateTier)
	admin.DELETE("/sponsor-tiers/:id", RequirePermission("sponsor.write"), handlers.Sponsors.DeleteTier)
	admin.GET("/sponsors", RequirePermission("sponsor.read"), handlers.Sponsors.ListSponsors)
	admin.POST("/sponsors", RequirePermission("sponsor.write"), handlers.Sponsors.CreateSponsor)
	admin.PUT("/sponsors/:id", RequirePermission("sponsor.write"), handlers.Sponsors.UpdateSponsor)
	admin.DELETE("/sponsors/:id", RequirePermission("sponsor.write"), handlers.Sponsors.DeleteSponsor)
	admin.POST("/sponsors/:id/placements", RequirePermission("sponsor.write"), handlers.Sponsors.UpdatePlacements)
	admin.GET("/sponsors/:id/analytics", RequirePermission("sponsor.read"), handlers.Sponsors.SponsorAnalytics)

	// Admin: Volunteers
	admin.GET("/volunteers", RequirePermission("volunteer.read"), handlers.Volunteers.ListVolunteers)
	admin.POST("/volunteers/:id/assign", RequirePermission("volunteer.assign"), handlers.Volunteers.AssignVolunteer)
	admin.POST("/volunteers/communicate", RequirePermission("volunteer.communicate"), handlers.Volunteers.Communicate)
	admin.GET("/volunteers/export", RequirePermission("volunteer.export"), handlers.Volunteers.Export)

	// Admin: Shop
	admin.GET("/products", RequirePermission("shop.read"), handlers.Shop.ListProducts)
	admin.POST("/products", RequirePermission("shop.write"), handlers.Shop.CreateProduct)
	admin.PUT("/products/:id", RequirePermission("shop.write"), handlers.Shop.UpdateProduct)
	admin.DELETE("/products/:id", RequirePermission("shop.write"), handlers.Shop.DeleteProduct)
	admin.GET("/orders", RequirePermission("shop.read"), handlers.Shop.ListOrders)

	// Admin: Audit
	admin.GET("/audit-logs", RequirePermission("audit.read"), handlers.Audit.List)
}

func notImplemented(c *gin.Context) {
	c.AbortWithStatus(http.StatusNotImplemented)
}
