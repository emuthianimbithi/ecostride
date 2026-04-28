package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/db"
	"ecostride/backend/internal/common/models"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()
	conn, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("db connect failed: %v", err)
	}

	if err := db.AutoMigrate(conn); err != nil {
		log.Fatalf("migrate failed: %v", err)
	}

	permissions := seedPermissions(conn)
	roles := seedRoles(conn, permissions)
	seedAdmin(conn, roles)
	seedHeroStyles(conn)

	seedProfile := getenv("SEED_PROFILE", "local")
	log.Printf("running seed profile: %s", seedProfile)

	switch seedProfile {
	case "onboarding":
		// Minimal dataset: 1 event, 1 waiver, basic structure
		seedEvent(conn)
		seedSponsors(conn)
		seedOnboardingData(conn)
	case "demo":
		// Polished client-facing dataset
		seedEvent(conn)
		seedSponsors(conn)
		seedDemoData(conn, roles)
	case "local":
		// Rich dev dataset (default)
		seedEvent(conn)
		seedSponsors(conn)
		seedDemoData(conn, roles)
		seedOnboardingData(conn)
	default:
		// Treat unknown profiles as local
		seedEvent(conn)
		seedSponsors(conn)
		seedDemoData(conn, roles)
	}

	log.Println("seed complete")
}

func seedPermissions(dbConn *gorm.DB) map[string]models.Permission {
	// 41 enforced permission keys (canonical set matching routes.go RequirePermission calls)
	permissionDefs := map[string]string{
		// CMS permissions (13)
		"cms.page.read":         "Read CMS pages",
		"cms.page.write":        "Create/update CMS pages",
		"cms.page.publish":      "Publish CMS pages",
		"cms.post.read":         "Read CMS posts",
		"cms.post.write":        "Create/update CMS posts",
		"cms.post.publish":      "Publish CMS posts",
		"cms.media.read":        "Read media",
		"cms.media.write":       "Create media",
		"cms.herostyle.read":    "Read hero styles",
		"cms.herostyle.write":   "Create/update hero styles",
		"cms.herostyle.disable": "Disable hero styles",
		"cms.settings.write":    "Update CMS settings",
		"cms.waiver.read":       "Read waivers",
		"cms.waiver.write":      "Create/update waivers",
		// Event permissions (5)
		"event.read":             "Read events",
		"event.write":            "Create/update events",
		"event.publish":          "Publish events",
		"event.category.write":   "Manage event categories",
		"event.formfields.write": "Manage event form fields",
		// Registration permissions (3)
		"registration.read":   "Read registrations",
		"registration.write":  "Update registrations",
		"registration.cancel": "Cancel registrations",
		// Payment permissions (2)
		"payment.read":   "Read payments",
		"payment.refund": "Refund payments",
		// Finance permissions (2)
		"finance.reconcile.import": "Import reconciliation data",
		"finance.export":           "Export finance data",
		// Bib permissions (2)
		"bib.assign.auto":   "Auto-assign bibs",
		"bib.assign.manual": "Manual bib assignment",
		// Results permissions (2)
		"results.import":  "Import results",
		"results.publish": "Publish results",
		// Sponsor permissions (2)
		"sponsor.read":  "Read sponsors",
		"sponsor.write": "Create/update sponsors",
		// Volunteer permissions (4)
		"volunteer.read":        "Read volunteers",
		"volunteer.assign":      "Assign volunteers",
		"volunteer.communicate": "Communicate with volunteers",
		"volunteer.export":      "Export volunteer data",
		// Shop permissions (2)
		"shop.read":  "Read shop",
		"shop.write": "Manage shop",
		// Access control permissions (3)
		"checkin.access": "Check-in access",
		"user.manage":    "Manage users and roles",
		"audit.read":     "Read audit logs",
	}

	perms := make(map[string]models.Permission)
	for key, desc := range permissionDefs {
		permission := models.Permission{Slug: uuid.New(), Key: key, Description: desc}
		if err := dbConn.Where("key = ?", key).FirstOrCreate(&permission).Error; err != nil {
			log.Fatalf("seed permission %s: %v", key, err)
		}
		perms[key] = permission
	}

	return perms
}

func seedRoles(dbConn *gorm.DB, permissions map[string]models.Permission) map[string]models.Role {
	roleDefs := map[string][]string{
		"SuperAdmin": allPermissionKeys(permissions),
		"OrgAdmin":   allPermissionKeys(permissions),
		"Finance": {
			"payment.read", "payment.refund",
			"finance.export", "finance.reconcile.import",
			"registration.read", "audit.read",
		},
		"EventOrganizer": {
			"event.read", "event.write", "event.publish",
			"event.category.write", "event.formfields.write",
			"registration.read", "registration.write", "registration.cancel",
			"bib.assign.auto", "bib.assign.manual",
			"results.import", "results.publish",
			"checkin.access",
		},
		"ContentEditor": {
			"cms.page.read", "cms.page.write", "cms.page.publish",
			"cms.post.read", "cms.post.write", "cms.post.publish",
			"cms.media.read", "cms.media.write",
			"cms.herostyle.read", "cms.herostyle.write", "cms.herostyle.disable",
			"cms.settings.write",
			"cms.waiver.read", "cms.waiver.write",
		},
		"VolunteerManager": {
			"volunteer.read", "volunteer.assign",
			"volunteer.communicate", "volunteer.export",
		},
		"ShopManager": {
			"shop.read", "shop.write",
			"cms.media.read", "cms.media.write",
			"payment.read",
		},
		"CheckInStaff": {"checkin.access", "registration.read"},
		"Support": {
			"registration.read", "payment.read",
			"cms.page.read", "cms.post.read", "cms.media.read",
			"audit.read",
		},
	}

	roles := make(map[string]models.Role)
	for name, permKeys := range roleDefs {
		role := models.Role{Slug: uuid.New(), Name: name, Description: name}
		if err := dbConn.Where("name = ?", name).FirstOrCreate(&role).Error; err != nil {
			log.Fatalf("seed role %s: %v", name, err)
		}

		rolePerms := make([]models.Permission, 0, len(permKeys))
		for _, key := range permKeys {
			if perm, ok := permissions[key]; ok {
				rolePerms = append(rolePerms, perm)
			}
		}

		if err := dbConn.Model(&role).Association("Permissions").Replace(rolePerms); err != nil {
			log.Fatalf("attach permissions to role %s: %v", name, err)
		}

		roles[name] = role
	}

	return roles
}

func seedHeroStyles(dbConn *gorm.DB) {
	type overlay struct {
		Enabled bool    `json:"enabled"`
		Type    string  `json:"type"`
		Opacity float64 `json:"opacity"`
	}

	styles := []models.HeroStyle{
		{
			Slug:           uuid.New(),
			Name:           "Full Bleed",
			Key:            "full_bleed",
			Description:    "Full-width cover image, no overlay.",
			LayoutType:     "FULL_BLEED",
			AspectRatio:    "21:9",
			Overlay:        datatypes.JSON(mustJSON(overlay{Enabled: false})),
			TextPlacement:  "CENTER",
			PaddingVariant: "NONE",
			IsActive:       true,
		},
		{
			Slug:           uuid.New(),
			Name:           "Full Bleed Gradient",
			Key:            "full_bleed_gradient",
			Description:    "Full-width cover image with bottom gradient overlay for readable title.",
			LayoutType:     "FULL_BLEED_GRADIENT",
			AspectRatio:    "21:9",
			Overlay:        datatypes.JSON(mustJSON(overlay{Enabled: true, Type: "gradient", Opacity: 0.45})),
			TextPlacement:  "LEFT",
			PaddingVariant: "LG",
			IsActive:       true,
		},
		{
			Slug:           uuid.New(),
			Name:           "Contained Card",
			Key:            "contained_card",
			Description:    "Contained image in a rounded card with subtle shadow.",
			LayoutType:     "CONTAINED_CARD",
			AspectRatio:    "16:9",
			Overlay:        datatypes.JSON(mustJSON(overlay{Enabled: false})),
			TextPlacement:  "LEFT",
			PaddingVariant: "MD",
			IsActive:       true,
		},
		{
			Slug:           uuid.New(),
			Name:           "Split Left",
			Key:            "split_left",
			Description:    "Image on the left, text on the right.",
			LayoutType:     "SPLIT_LEFT",
			AspectRatio:    "16:9",
			Overlay:        datatypes.JSON(mustJSON(overlay{Enabled: false})),
			TextPlacement:  "LEFT",
			PaddingVariant: "MD",
			IsActive:       true,
		},
	}

	var firstActive *models.HeroStyle
	for _, s := range styles {
		style := s
		if err := dbConn.Where("key = ?", style.Key).Assign(style).FirstOrCreate(&style).Error; err != nil {
			log.Fatalf("seed hero style %s: %v", style.Key, err)
		}
		if firstActive == nil && style.IsActive {
			firstActive = &style
		}
	}

	if firstActive != nil {
		// Set default hero style if not already set.
		var setting models.Setting
		err := dbConn.Where("key = ?", "default_hero_style").First(&setting).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			payload := map[string]any{"hero_style_id": firstActive.ID}
			raw, _ := json.Marshal(payload)
			setting = models.Setting{Key: "default_hero_style", Value: datatypes.JSON(raw)}
			if err := dbConn.Create(&setting).Error; err != nil {
				log.Fatalf("seed default hero style setting: %v", err)
			}
		}
	}
}

func seedAdmin(dbConn *gorm.DB, roles map[string]models.Role) {
	email := getenv("SEED_ADMIN_EMAIL", "admin@ecostride.local")
	password := getenv("SEED_ADMIN_PASSWORD", "ChangeMe123!")

	var user models.User
	err := dbConn.Where("email = ?", email).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		passwordHash, hashErr := auth.HashPassword(password)
		if hashErr != nil {
			log.Fatalf("hash password: %v", hashErr)
		}

		user = models.User{
			Slug:         uuid.New(),
			Name:         "Super Admin",
			Email:        email,
			PasswordHash: passwordHash,
			IsActive:     true,
		}

		if err := dbConn.Create(&user).Error; err != nil {
			log.Fatalf("create admin user: %v", err)
		}
	} else if err != nil {
		log.Fatalf("lookup admin user: %v", err)
	}

	superAdmin, ok := roles["SuperAdmin"]
	if ok {
		if err := dbConn.Model(&user).Association("Roles").Append(&superAdmin); err != nil {
			log.Fatalf("assign admin role: %v", err)
		}
	}
}

func seedEvent(dbConn *gorm.DB) {
	start := time.Now().AddDate(0, 1, 0)
	open := time.Now().AddDate(0, 0, -7)
	close := time.Now().AddDate(0, 0, 21)

	event := models.Event{
		Slug:        uuid.New(),
		URLSlug:     "malindi-marathon",
		Type:        "MARATHON",
		Title:       "Malindi Marathon",
		Description: "Sample marathon event.",
		Location:    "Malindi",
		StartAt:     start,
		RegOpenAt:   &open,
		RegCloseAt:  &close,
		Status:      "published",
	}

	if err := dbConn.Where("url_slug = ?", event.URLSlug).FirstOrCreate(&event).Error; err != nil {
		log.Fatalf("seed event: %v", err)
	}

	categories := []models.EventCategory{
		{Slug: uuid.New(), EventID: event.ID, Name: "10K", PriceKESMinor: 150000},
		{Slug: uuid.New(), EventID: event.ID, Name: "21K", PriceKESMinor: 250000},
		{Slug: uuid.New(), EventID: event.ID, Name: "42K", PriceKESMinor: 400000},
	}

	for _, category := range categories {
		if err := dbConn.Where("event_id = ? AND name = ?", event.ID, category.Name).FirstOrCreate(&category).Error; err != nil {
			log.Fatalf("seed category %s: %v", category.Name, err)
		}
	}

	waiver := models.WaiverVersion{
		Slug:        uuid.New(),
		Scope:       "GLOBAL",
		Version:     1,
		Title:       "General Liability Waiver",
		Content:     "By registering you accept the standard waiver.",
		ContentHash: "seed",
		EffectiveAt: time.Now(),
		IsCurrent:   true,
	}

	if err := dbConn.Where("scope = ? AND version = ?", waiver.Scope, waiver.Version).FirstOrCreate(&waiver).Error; err != nil {
		log.Fatalf("seed waiver: %v", err)
	}
}

func seedSponsors(dbConn *gorm.DB) {
	tier := models.SponsorTier{Slug: uuid.New(), Name: "Platinum", Priority: 1}
	if err := dbConn.Where("name = ?", tier.Name).FirstOrCreate(&tier).Error; err != nil {
		log.Fatalf("seed sponsor tier: %v", err)
	}

	sponsor := models.Sponsor{
		Slug:        uuid.New(),
		TierID:      tier.ID,
		Name:        "Oceanic Partners",
		URLSlug:     "oceanic-partners",
		Description: "Sample sponsor.",
		WebsiteURL:  "https://example.org",
		IsFeatured:  true,
	}

	if err := dbConn.Where("url_slug = ?", sponsor.URLSlug).FirstOrCreate(&sponsor).Error; err != nil {
		log.Fatalf("seed sponsor: %v", err)
	}
}

func seedOnboardingData(dbConn *gorm.DB) {
	admin := findSeedAdmin(dbConn)
	createdBy := admin.ID

	media := seedOnboardingMedia(dbConn, createdBy)
	seedOnboardingPages(dbConn, media)
	event := seedOnboardingEvent(dbConn, media, createdBy)
	seedOnboardingCategories(dbConn, event)
	seedOnboardingFormFields(dbConn, event)
	seedOnboardingWaiver(dbConn, event)
	seedOnboardingSponsor(dbConn, event, media)
	seedOnboardingVolunteers(dbConn, event)
	seedOnboardingProducts(dbConn)
}

func seedOnboardingMedia(dbConn *gorm.DB, createdBy uint) map[string]models.Media {
	entries := []struct {
		Key  string
		Type string
		URL  string
		Mime string
		Alt  string
	}{
		{
			Key:  "onboarding-hero",
			Type: "image",
			URL:  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=60",
			Mime: "image/jpeg",
			Alt:  "Onboarding hero",
		},
		{
			Key:  "onboarding-sponsor",
			Type: "image",
			URL:  "https://images.unsplash.com/photo-1500534314209-a26db0f0b2ba?auto=format&fit=crop&w=1000&q=60",
			Mime: "image/jpeg",
			Alt:  "Onboarding sponsor",
		},
	}

	media := make(map[string]models.Media)
	for _, entry := range entries {
		record := models.Media{
			Slug:      uuid.New(),
			Type:      entry.Type,
			URL:       entry.URL,
			Mime:      entry.Mime,
			AltText:   entry.Alt,
			CreatedBy: createdBy,
		}
		if err := dbConn.Where("url = ?", entry.URL).FirstOrCreate(&record).Error; err != nil {
			log.Fatalf("seed onboarding media %s: %v", entry.Key, err)
		}
		media[entry.Key] = record
	}

	return media
}

func seedOnboardingPages(dbConn *gorm.DB, media map[string]models.Media) {
	pages := []struct {
		Slug   string
		Title  string
		Blocks []map[string]interface{}
	}{
		{
			Slug:  "getting-started",
			Title: "Getting Started",
			Blocks: []map[string]interface{}{
				{"type": "heading", "data": map[string]interface{}{"text": "Welcome to EcoStride"}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "Use this checklist to launch your first event."}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "1) Add your event details. 2) Configure categories. 3) Publish when ready."}},
			},
		},
		{
			Slug:  "onboarding-checklist",
			Title: "Launch Checklist",
			Blocks: []map[string]interface{}{
				{"type": "heading", "data": map[string]interface{}{"text": "Launch checklist"}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "Update waivers, set pricing, connect payments, and publish your event."}},
			},
		},
	}

	for _, page := range pages {
		record := models.Page{
			Slug:    uuid.New(),
			URLSlug: page.Slug,
			Title:   page.Title,
			Status:  "published",
			Blocks:  datatypes.JSON(mustJSON(page.Blocks)),
		}
		if hero, ok := media["onboarding-hero"]; ok {
			record.OgImageMediaID = &hero.ID
		}
		if err := dbConn.Where("url_slug = ?", record.URLSlug).FirstOrCreate(&record).Error; err != nil {
			log.Fatalf("seed onboarding page %s: %v", page.Slug, err)
		}
	}
}

func seedOnboardingEvent(dbConn *gorm.DB, media map[string]models.Media, createdBy uint) models.Event {
	startAt := time.Now().AddDate(0, 1, 14)
	event := models.Event{
		Slug:        uuid.New(),
		URLSlug:     "starter-marathon",
		Type:        "MARATHON",
		Title:       "Starter Marathon",
		Description: "Draft event used for onboarding walkthroughs.",
		Location:    "Kilifi",
		StartAt:     startAt,
		Status:      "draft",
		CreatedBy:   createdBy,
	}
	if hero, ok := media["onboarding-hero"]; ok {
		event.HeroMediaID = &hero.ID
	}

	err := dbConn.Where("url_slug = ?", event.URLSlug).First(&event).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if err := dbConn.Create(&event).Error; err != nil {
			log.Fatalf("seed onboarding event: %v", err)
		}
		return event
	}
	if err != nil {
		log.Fatalf("load onboarding event: %v", err)
	}

	updates := map[string]interface{}{
		"type":        "MARATHON",
		"title":       "Starter Marathon",
		"description": "Draft event used for onboarding walkthroughs.",
		"location":    "Kilifi",
		"status":      "draft",
		"start_at":    startAt,
	}
	if event.HeroMediaID != nil {
		updates["hero_media_id"] = *event.HeroMediaID
	}
	if err := dbConn.Model(&event).Updates(updates).Error; err != nil {
		log.Fatalf("update onboarding event: %v", err)
	}
	return event
}

func seedOnboardingCategories(dbConn *gorm.DB, event models.Event) {
	defs := []struct {
		Name     string
		PriceKES int
		StartBib int
		EndBib   int
	}{
		{Name: "10K Starter", PriceKES: 120000, StartBib: 10, EndBib: 59},
		{Name: "21K Starter", PriceKES: 200000, StartBib: 60, EndBib: 99},
	}

	for _, def := range defs {
		var category models.EventCategory
		err := dbConn.Where("event_id = ? AND name = ?", event.ID, def.Name).First(&category).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			category = models.EventCategory{
				Slug:          uuid.New(),
				EventID:       event.ID,
				Name:          def.Name,
				PriceKESMinor: def.PriceKES,
				BibRangeStart: pointerToInt(def.StartBib),
				BibRangeEnd:   pointerToInt(def.EndBib),
				BibNext:       pointerToInt(def.StartBib),
			}
			if err := dbConn.Create(&category).Error; err != nil {
				log.Fatalf("seed onboarding category %s: %v", def.Name, err)
			}
			continue
		}
		if err != nil {
			log.Fatalf("load onboarding category %s: %v", def.Name, err)
		}
		_ = dbConn.Model(&category).Updates(map[string]interface{}{
			"price_kes_minor": def.PriceKES,
			"bib_range_start": def.StartBib,
			"bib_range_end":   def.EndBib,
		}).Error
	}
}

func seedOnboardingFormFields(dbConn *gorm.DB, event models.Event) {
	fields := []models.EventFormField{
		{
			Slug:     uuid.New(),
			EventID:  event.ID,
			Key:      "emergencyPhone",
			Label:    "Emergency Contact Phone",
			Type:     "text",
			Required: true,
			Order:    1,
		},
		{
			Slug:     uuid.New(),
			EventID:  event.ID,
			Key:      "tshirtSize",
			Label:    "T-shirt Size",
			Type:     "select",
			Required: true,
			Options:  datatypes.JSON(mustJSON([]string{"S", "M", "L", "XL"})),
			Order:    2,
		},
	}

	for _, field := range fields {
		var existing models.EventFormField
		err := dbConn.Where("event_id = ? AND key = ?", event.ID, field.Key).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err := dbConn.Create(&field).Error; err != nil {
				log.Fatalf("seed onboarding form field %s: %v", field.Key, err)
			}
			continue
		}
		if err != nil {
			log.Fatalf("load onboarding form field %s: %v", field.Key, err)
		}
		_ = dbConn.Model(&existing).Updates(map[string]interface{}{
			"label":    field.Label,
			"type":     field.Type,
			"required": field.Required,
			"options":  field.Options,
			"order":    field.Order,
		}).Error
	}
}

func seedOnboardingWaiver(dbConn *gorm.DB, event models.Event) {
	waiver := models.WaiverVersion{
		Slug:        uuid.New(),
		Scope:       "EVENT",
		EventID:     &event.ID,
		Version:     1,
		Title:       "Starter Event Waiver",
		Content:     "Complete this waiver before opening registration.",
		ContentHash: "onboarding-starter",
		EffectiveAt: time.Now().AddDate(0, 0, -1),
		IsCurrent:   true,
	}

	if err := dbConn.Where("scope = ? AND event_id = ?", waiver.Scope, event.ID).FirstOrCreate(&waiver).Error; err != nil {
		log.Fatalf("seed onboarding waiver: %v", err)
	}
}

func seedOnboardingSponsor(dbConn *gorm.DB, event models.Event, media map[string]models.Media) {
	tier := models.SponsorTier{Slug: uuid.New(), Name: "Onboarding", Priority: 99}
	if err := dbConn.Where("name = ?", tier.Name).FirstOrCreate(&tier).Error; err != nil {
		log.Fatalf("seed onboarding sponsor tier: %v", err)
	}

	sponsor := models.Sponsor{
		Slug:         uuid.New(),
		TierID:       tier.ID,
		Name:         "Starter Partner",
		URLSlug:      "starter-partner",
		Description:  "Demo sponsor to guide your first placement.",
		WebsiteURL:   "https://example.org",
		IsFeatured:   true,
		DisplayOrder: 1,
	}
	if logo, ok := media["onboarding-sponsor"]; ok {
		sponsor.LogoMediaID = &logo.ID
	}

	if err := dbConn.Where("url_slug = ?", sponsor.URLSlug).FirstOrCreate(&sponsor).Error; err != nil {
		log.Fatalf("seed onboarding sponsor: %v", err)
	}

	placements := []models.SponsorPlacement{
		{Slug: uuid.New(), SponsorID: sponsor.ID, LocationKey: "HOME_STRIP"},
		{Slug: uuid.New(), SponsorID: sponsor.ID, EventID: &event.ID, LocationKey: "EVENT_PAGE"},
	}
	for _, placement := range placements {
		query := dbConn.Where("sponsor_id = ? AND location_key = ?", placement.SponsorID, placement.LocationKey)
		if placement.EventID == nil {
			query = query.Where("event_id IS NULL")
		} else {
			query = query.Where("event_id = ?", *placement.EventID)
		}
		if err := query.FirstOrCreate(&placement).Error; err != nil {
			log.Fatalf("seed onboarding placement: %v", err)
		}
	}
}

func seedOnboardingVolunteers(dbConn *gorm.DB, event models.Event) {
	volunteer := models.Volunteer{
		Slug:        uuid.New(),
		Name:        "Starter Volunteer",
		Email:       "onboarding@volunteer.local",
		Phone:       "254700000040",
		Preferences: datatypes.JSON(mustJSON([]string{"check-in"})),
		Notes:       "Demo volunteer profile",
	}
	if err := dbConn.Where("email = ?", volunteer.Email).FirstOrCreate(&volunteer).Error; err != nil {
		log.Fatalf("seed onboarding volunteer: %v", err)
	}

	assignment := models.VolunteerAssignment{
		Slug:        uuid.New(),
		VolunteerID: volunteer.ID,
		EventID:     &event.ID,
		RoleName:    "Check-In",
		ShiftStart:  pointerToTime(time.Now().AddDate(0, 1, 14)),
		ShiftEnd:    pointerToTime(time.Now().AddDate(0, 1, 14).Add(3 * time.Hour)),
		Location:    "Start gate",
		Status:      "assigned",
	}
	if err := dbConn.Where("volunteer_id = ? AND event_id = ?", volunteer.ID, event.ID).FirstOrCreate(&assignment).Error; err != nil {
		log.Fatalf("seed onboarding volunteer assignment: %v", err)
	}
}

func seedOnboardingProducts(dbConn *gorm.DB) {
	products := []models.Product{
		{
			Slug:              uuid.New(),
			Type:              "DONATION_TIER",
			Name:              "Starter Support",
			URLSlug:           "starter-support",
			Description:       "Seed donation tier for onboarding.",
			PriceKESMinor:     pointerToInt(100000),
			AllowCustomAmount: true,
			Active:            true,
		},
		{
			Slug:              uuid.New(),
			Type:              "MERCH",
			Name:              "Starter Cap",
			URLSlug:           "starter-cap",
			Description:       "Sample merch item for onboarding.",
			PriceKESMinor:     pointerToInt(80000),
			AllowCustomAmount: false,
			StockQty:          pointerToInt(20),
			Active:            true,
		},
	}

	for _, product := range products {
		if err := dbConn.Where("url_slug = ?", product.URLSlug).FirstOrCreate(&product).Error; err != nil {
			log.Fatalf("seed onboarding product %s: %v", product.Name, err)
		}
	}
}

func findSeedAdmin(dbConn *gorm.DB) models.User {
	adminEmail := getenv("SEED_ADMIN_EMAIL", "admin@ecostride.local")
	var admin models.User
	if err := dbConn.Where("email = ?", adminEmail).First(&admin).Error; err != nil {
		log.Fatalf("find admin user: %v", err)
	}
	return admin
}

type demoUsers struct {
	Admin     models.User
	OrgAdmin  models.User
	Finance   models.User
	Organizer models.User
	Content   models.User
	Volunteer models.User
	Shop      models.User
	CheckIn   models.User
	Support   models.User
}

type demoEvents struct {
	Malindi models.Event
	Mombasa models.Event
	Cleanup models.Event
	Summit  models.Event
}

type demoShop struct {
	Products map[string]models.Product
	Orders   []models.Order
}

func seedDemoData(dbConn *gorm.DB, roles map[string]models.Role) {
	users := seedDemoUsers(dbConn, roles)
	media := seedDemoMedia(dbConn, pickUserID(users.Content, users.Admin))
	seedDemoPages(dbConn, media)
	seedDemoPosts(dbConn, media, pickUserID(users.Content, users.Admin))
	seedDemoGallery(dbConn, media)
	events := seedDemoEvents(dbConn, media, pickUserID(users.Organizer, users.Admin))
	waivers := seedDemoWaivers(dbConn, events)
	seedDemoEventFormFields(dbConn, events)
	registrations := seedDemoRegistrations(dbConn, events, waivers)
	seedDemoBibsAndCheckins(dbConn, registrations, pickUserID(users.CheckIn, users.Admin))
	seedDemoSponsorsExtra(dbConn, events, media)
	seedDemoVolunteers(dbConn, events)
	shop := seedDemoShop(dbConn)
	payments := seedDemoPayments(dbConn, registrations, shop.Orders)
	seedDemoReceipts(dbConn, payments, media)
	seedDemoResults(dbConn, events, media)
	seedDemoFinance(dbConn, payments, media, pickUserID(users.Finance, users.Admin))
	seedDemoAudit(dbConn, users)
	seedDemoRefreshTokens(dbConn, users)
	seedDemoJobs(dbConn)
}

func seedDemoUsers(dbConn *gorm.DB, roles map[string]models.Role) demoUsers {
	password := getenv("SEED_DEMO_PASSWORD", "ChangeMe123!")
	adminEmail := getenv("SEED_ADMIN_EMAIL", "admin@ecostride.local")

	var admin models.User
	_ = dbConn.Where("email = ?", adminEmail).First(&admin).Error

	orgAdmin := seedUser(dbConn, "Org Admin", "orgadmin@ecostride.local", password)
	finance := seedUser(dbConn, "Finance Lead", "finance@ecostride.local", password)
	organizer := seedUser(dbConn, "Event Organizer", "organizer@ecostride.local", password)
	content := seedUser(dbConn, "Content Editor", "content@ecostride.local", password)
	volunteer := seedUser(dbConn, "Volunteer Manager", "volunteers@ecostride.local", password)
	shop := seedUser(dbConn, "Shop Manager", "shop@ecostride.local", password)
	checkin := seedUser(dbConn, "Check-In Staff", "checkin@ecostride.local", password)
	support := seedUser(dbConn, "Support Agent", "support@ecostride.local", password)

	attachRole(dbConn, orgAdmin, roles["OrgAdmin"])
	attachRole(dbConn, finance, roles["Finance"])
	attachRole(dbConn, organizer, roles["EventOrganizer"])
	attachRole(dbConn, content, roles["ContentEditor"])
	attachRole(dbConn, volunteer, roles["VolunteerManager"])
	attachRole(dbConn, shop, roles["ShopManager"])
	attachRole(dbConn, checkin, roles["CheckInStaff"])
	attachRole(dbConn, support, roles["Support"])

	return demoUsers{
		Admin:     admin,
		OrgAdmin:  orgAdmin,
		Finance:   finance,
		Organizer: organizer,
		Content:   content,
		Volunteer: volunteer,
		Shop:      shop,
		CheckIn:   checkin,
		Support:   support,
	}
}

func seedDemoMedia(dbConn *gorm.DB, createdBy uint) map[string]models.Media {
	entries := []struct {
		Key  string
		Type string
		URL  string
		Path string
		Mime string
		Alt  string
	}{
		{
			Key:  "hero-malindi",
			Type: "image",
			URL:  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=60",
			Mime: "image/jpeg",
			Alt:  "Sunrise runners",
		},
		{
			Key:  "hero-cleanup",
			Type: "image",
			URL:  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=60",
			Mime: "image/jpeg",
			Alt:  "Beach cleanup volunteers",
		},
		{
			Key:  "sponsor-oceanic",
			Type: "image",
			URL:  "https://images.unsplash.com/photo-1522120691812-dcdfb625f397?auto=format&fit=crop&w=800&q=60",
			Mime: "image/jpeg",
			Alt:  "Oceanic Partners logo",
		},
		{
			Key:  "sponsor-sunrise",
			Type: "image",
			URL:  "https://images.unsplash.com/photo-1500534314209-a26db0f0b2ba?auto=format&fit=crop&w=800&q=60",
			Mime: "image/jpeg",
			Alt:  "Sunrise Logistics logo",
		},
		{
			Key:  "gallery-1",
			Type: "image",
			URL:  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=60",
			Mime: "image/jpeg",
			Alt:  "Race day highlight",
		},
		{
			Key:  "gallery-2",
			Type: "image",
			URL:  "https://images.unsplash.com/photo-1500534314209-a26db0f0b2ba?auto=format&fit=crop&w=1200&q=60",
			Mime: "image/jpeg",
			Alt:  "Volunteer team",
		},
		{
			Key:  "receipt-demo",
			Type: "file",
			Path: "./uploads/demo-receipt.pdf",
			Mime: "application/pdf",
		},
		{
			Key:  "results-demo",
			Type: "file",
			Path: "./uploads/results-demo.csv",
			Mime: "text/csv",
		},
		{
			Key:  "bank-demo",
			Type: "file",
			Path: "./uploads/bank-statement-demo.csv",
			Mime: "text/csv",
		},
	}

	media := make(map[string]models.Media)
	for _, entry := range entries {
		record := models.Media{
			Slug:      uuid.New(),
			Type:      entry.Type,
			Path:      entry.Path,
			URL:       entry.URL,
			Mime:      entry.Mime,
			AltText:   entry.Alt,
			Size:      0,
			CreatedBy: createdBy,
		}

		query := dbConn
		if entry.URL != "" {
			query = query.Where("url = ?", entry.URL)
		} else if entry.Path != "" {
			query = query.Where("path = ?", entry.Path)
		}
		if err := query.FirstOrCreate(&record).Error; err != nil {
			log.Fatalf("seed media %s: %v", entry.Key, err)
		}
		media[entry.Key] = record
	}

	return media
}

func seedDemoPages(dbConn *gorm.DB, media map[string]models.Media) {
	pages := []struct {
		Slug        string
		Title       string
		Blocks      []map[string]interface{}
		SEOTitle    string
		SEODesc     string
		OgMediaKey  string
		PublishedAt time.Time
	}{
		{
			Slug:  "contact",
			Title: "Contact EcoStride",
			Blocks: []map[string]interface{}{
				{"type": "heading", "data": map[string]interface{}{"text": "We love hearing from you"}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "Email us at hello@ecostride.local or call +254 700 123 456."}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "Malindi Office: Palm Avenue, Suite 12."}},
			},
			SEOTitle:    "Contact EcoStride",
			SEODesc:     "Get in touch with the EcoStride team.",
			OgMediaKey:  "hero-malindi",
			PublishedAt: time.Now().AddDate(0, 0, -4),
		},
		{
			Slug:  "faq",
			Title: "FAQ",
			Blocks: []map[string]interface{}{
				{"type": "heading", "data": map[string]interface{}{"text": "Frequently asked questions"}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "How do I transfer my bib? Contact support within 7 days of purchase."}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "Are refunds allowed? Refunds follow each event policy."}},
			},
			SEOTitle:    "EcoStride FAQ",
			SEODesc:     "Quick answers about registration, payments, and volunteering.",
			OgMediaKey:  "hero-cleanup",
			PublishedAt: time.Now().AddDate(0, 0, -6),
		},
		{
			Slug:  "privacy",
			Title: "Privacy Policy",
			Blocks: []map[string]interface{}{
				{"type": "heading", "data": map[string]interface{}{"text": "Your privacy matters"}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "We collect only the data required to run events and process payments."}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "You can request data deletion at any time."}},
			},
			SEOTitle:    "EcoStride Privacy Policy",
			SEODesc:     "How EcoStride handles your data and consent records.",
			OgMediaKey:  "hero-cleanup",
			PublishedAt: time.Now().AddDate(0, 0, -10),
		},
		{
			Slug:  "cookies",
			Title: "Cookie Policy",
			Blocks: []map[string]interface{}{
				{"type": "heading", "data": map[string]interface{}{"text": "Cookie usage"}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "We use cookies to keep sessions secure and remember preferences."}},
				{"type": "paragraph", "data": map[string]interface{}{"text": "Analytics cookies are used only to improve event experiences."}},
			},
			SEOTitle:    "EcoStride Cookies",
			SEODesc:     "How EcoStride uses cookies on the public site.",
			OgMediaKey:  "hero-malindi",
			PublishedAt: time.Now().AddDate(0, 0, -8),
		},
	}

	for _, page := range pages {
		record := models.Page{
			Slug:        uuid.New(),
			URLSlug:     page.Slug,
			Title:       page.Title,
			Status:      "published",
			Blocks:      datatypes.JSON(mustJSON(page.Blocks)),
			SEOTitle:    page.SEOTitle,
			SEODesc:     page.SEODesc,
			PublishedAt: &page.PublishedAt,
		}
		if mediaItem, ok := media[page.OgMediaKey]; ok {
			record.OgImageMediaID = &mediaItem.ID
		}

		if err := dbConn.Where("url_slug = ?", record.URLSlug).FirstOrCreate(&record).Error; err != nil {
			log.Fatalf("seed page %s: %v", page.Slug, err)
		}
	}
}

func seedDemoPosts(dbConn *gorm.DB, media map[string]models.Media, authorID uint) {
	categories := []models.Category{
		{Slug: uuid.New(), Name: "Race Recaps", URLSlug: "race-recaps"},
		{Slug: uuid.New(), Name: "Community", URLSlug: "community"},
	}
	tags := []models.Tag{
		{Slug: uuid.New(), Name: "malindi", URLSlug: "malindi"},
		{Slug: uuid.New(), Name: "cleanup", URLSlug: "cleanup"},
		{Slug: uuid.New(), Name: "volunteer", URLSlug: "volunteer"},
	}

	for i := range categories {
		if err := dbConn.Where("url_slug = ?", categories[i].URLSlug).FirstOrCreate(&categories[i]).Error; err != nil {
			log.Fatalf("seed category %s: %v", categories[i].Name, err)
		}
	}
	for i := range tags {
		if err := dbConn.Where("url_slug = ?", tags[i].URLSlug).FirstOrCreate(&tags[i]).Error; err != nil {
			log.Fatalf("seed tag %s: %v", tags[i].Name, err)
		}
	}

	posts := []struct {
		Slug       string
		Title      string
		Excerpt    string
		Content    string
		MediaKey   string
		Categories []string
		Tags       []string
	}{
		{
			Slug:       "malindi-marathon-recap",
			Title:      "Malindi Marathon highlights",
			Excerpt:    "Community runners and coastal sunshine made this year's Malindi Marathon unforgettable.",
			Content:    "Route highlights, volunteer notes, and top finishers from Malindi Marathon.",
			MediaKey:   "hero-malindi",
			Categories: []string{"race-recaps"},
			Tags:       []string{"malindi"},
		},
		{
			Slug:       "Malindi-cleanup-weekend",
			Title:      "Malindi cleanup weekend recap",
			Excerpt:    "Over 200 volunteers joined forces to restore the shoreline.",
			Content:    "Volunteer teams collected 640kg of waste and mapped new hotspots.",
			MediaKey:   "hero-cleanup",
			Categories: []string{"community"},
			Tags:       []string{"cleanup", "volunteer"},
		},
		{
			Slug:       "eco-summit-speakers",
			Title:      "Eco Summit speaker lineup",
			Excerpt:    "Meet the panel driving sustainable sports and community health.",
			Content:    "Keynotes from coastal conservation leaders, race directors, and sponsors.",
			MediaKey:   "hero-malindi",
			Categories: []string{"community"},
			Tags:       []string{"volunteer"},
		},
	}

	for _, post := range posts {
		record := models.Post{
			Slug:         uuid.New(),
			URLSlug:      post.Slug,
			Title:        post.Title,
			Content:      datatypes.JSON(mustJSON(post.Content)),
			Excerpt:      post.Excerpt,
			Status:       "published",
			PublishedAt:  pointerToTime(time.Now().AddDate(0, 0, -7)),
			AuthorUserID: authorID,
		}
		if mediaItem, ok := media[post.MediaKey]; ok {
			record.FeaturedImageMediaID = &mediaItem.ID
		}

		if err := dbConn.Where("url_slug = ?", record.URLSlug).FirstOrCreate(&record).Error; err != nil {
			log.Fatalf("seed post %s: %v", post.Slug, err)
		}

		for _, categorySlug := range post.Categories {
			var category models.Category
			if err := dbConn.Where("url_slug = ?", categorySlug).First(&category).Error; err == nil {
				link := models.PostCategory{Slug: uuid.New(), PostID: record.ID, CategoryID: category.ID}
				_ = dbConn.Where("post_id = ? AND category_id = ?", record.ID, category.ID).FirstOrCreate(&link).Error
			}
		}
		for _, tagSlug := range post.Tags {
			var tag models.Tag
			if err := dbConn.Where("url_slug = ?", tagSlug).First(&tag).Error; err == nil {
				link := models.PostTag{Slug: uuid.New(), PostID: record.ID, TagID: tag.ID}
				_ = dbConn.Where("post_id = ? AND tag_id = ?", record.ID, tag.ID).FirstOrCreate(&link).Error
			}
		}
	}
}

func seedDemoGallery(dbConn *gorm.DB, media map[string]models.Media) {
	album := models.GalleryAlbum{
		Slug:        uuid.New(),
		Title:       "Malindi Marathon 2023",
		URLSlug:     "malindi-2023",
		Description: "Sunrise start line, medals, and volunteer stations.",
	}

	if err := dbConn.Where("url_slug = ?", album.URLSlug).FirstOrCreate(&album).Error; err != nil {
		log.Fatalf("seed album: %v", err)
	}

	var count int64
	if err := dbConn.Model(&models.AlbumMedia{}).Where("album_id = ?", album.ID).Count(&count).Error; err != nil {
		log.Fatalf("count album media: %v", err)
	}
	if count > 0 {
		return
	}

	items := []string{"gallery-1", "gallery-2"}
	for i, key := range items {
		if mediaItem, ok := media[key]; ok {
			link := models.AlbumMedia{
				Slug:      uuid.New(),
				AlbumID:   album.ID,
				MediaID:   mediaItem.ID,
				SortOrder: i + 1,
			}
			if err := dbConn.Create(&link).Error; err != nil {
				log.Fatalf("seed album media: %v", err)
			}
		}
	}
}

func seedDemoEvents(dbConn *gorm.DB, media map[string]models.Media, createdBy uint) demoEvents {
	var malindi models.Event
	if err := dbConn.Where("url_slug = ?", "malindi-marathon").First(&malindi).Error; err != nil {
		log.Fatalf("load malindi event: %v", err)
	}

	if hero, ok := media["hero-malindi"]; ok {
		_ = dbConn.Model(&malindi).Updates(map[string]interface{}{
			"hero_media_id":     hero.ID,
			"results_published": true,
		}).Error
	}

	Malindi := seedEventWithSlug(dbConn, models.Event{
		Slug:        uuid.New(),
		URLSlug:     "Malindi-10k",
		Type:        "MARATHON",
		Title:       "Malindi 10K",
		Description: "Fast city route along the coast.",
		Location:    "Malindi",
		StartAt:     time.Now().AddDate(0, 2, 5),
		Status:      "published",
		CreatedBy:   createdBy,
	})

	cleanup := seedEventWithSlug(dbConn, models.Event{
		Slug:        uuid.New(),
		URLSlug:     "Malindi-cleanup",
		Type:        "BEACH_CLEANUP",
		Title:       "Malindi Beach Cleanup",
		Description: "Monthly volunteer cleanup and sorting.",
		Location:    "Malindi",
		StartAt:     time.Now().AddDate(0, 0, 18),
		Status:      "published",
		CreatedBy:   createdBy,
	})

	summit := seedEventWithSlug(dbConn, models.Event{
		Slug:        uuid.New(),
		URLSlug:     "eco-summit-2026",
		Type:        "SEMINAR",
		Title:       "EcoStride Summit 2026",
		Description: "Panels on sustainable sports and community impact.",
		Location:    "Nairobi",
		StartAt:     time.Now().AddDate(0, 3, 10),
		Status:      "published",
		CreatedBy:   createdBy,
	})

	categoryDefs := []struct {
		EventID  uint
		Name     string
		PriceKES int
		StartBib int
		EndBib   int
	}{
		{EventID: malindi.ID, Name: "10K", PriceKES: 150000, StartBib: 100, EndBib: 199},
		{EventID: malindi.ID, Name: "21K", PriceKES: 250000, StartBib: 200, EndBib: 299},
		{EventID: malindi.ID, Name: "42K", PriceKES: 400000, StartBib: 300, EndBib: 399},
		{EventID: Malindi.ID, Name: "10K", PriceKES: 180000, StartBib: 400, EndBib: 449},
		{EventID: Malindi.ID, Name: "5K", PriceKES: 120000, StartBib: 450, EndBib: 499},
	}

	for _, def := range categoryDefs {
		var category models.EventCategory
		err := dbConn.Where("event_id = ? AND name = ?", def.EventID, def.Name).First(&category).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			category = models.EventCategory{
				Slug:          uuid.New(),
				EventID:       def.EventID,
				Name:          def.Name,
				PriceKESMinor: def.PriceKES,
				BibRangeStart: pointerToInt(def.StartBib),
				BibRangeEnd:   pointerToInt(def.EndBib),
				BibNext:       pointerToInt(def.StartBib),
			}
			if err := dbConn.Create(&category).Error; err != nil {
				log.Fatalf("seed category %s: %v", def.Name, err)
			}
			continue
		}
		if err != nil {
			log.Fatalf("load category %s: %v", def.Name, err)
		}

		updates := map[string]interface{}{
			"price_kes_minor": def.PriceKES,
			"bib_range_start": def.StartBib,
			"bib_range_end":   def.EndBib,
		}
		if category.BibNext == nil {
			updates["bib_next"] = def.StartBib
		}
		if err := dbConn.Model(&category).Updates(updates).Error; err != nil {
			log.Fatalf("update category %s: %v", def.Name, err)
		}
	}

	return demoEvents{
		Malindi: malindi,
		Cleanup: cleanup,
		Summit:  summit,
	}
}

func seedDemoEventFormFields(dbConn *gorm.DB, events demoEvents) {
	var count int64
	if err := dbConn.Model(&models.EventFormField{}).Where("event_id = ?", events.Malindi.ID).Count(&count).Error; err != nil {
		log.Fatalf("count event form fields: %v", err)
	}
	if count > 0 {
		return
	}

	fields := []models.EventFormField{
		{
			Slug:     uuid.New(),
			EventID:  events.Malindi.ID,
			Key:      "emergencyPhone",
			Label:    "Emergency Phone",
			Type:     "text",
			Required: true,
			Order:    1,
		},
		{
			Slug:     uuid.New(),
			EventID:  events.Malindi.ID,
			Key:      "tshirtSize",
			Label:    "T-shirt Size",
			Type:     "select",
			Required: true,
			Options:  datatypes.JSON(mustJSON([]string{"XS", "S", "M", "L", "XL"})),
			Order:    2,
		},
		{
			Slug:     uuid.New(),
			EventID:  events.Malindi.ID,
			Key:      "medical",
			Label:    "Medical Notes",
			Type:     "text",
			Required: false,
			Order:    3,
		},
	}

	if err := dbConn.Create(&fields).Error; err != nil {
		log.Fatalf("seed event form fields: %v", err)
	}
}

func seedDemoWaivers(dbConn *gorm.DB, events demoEvents) map[string]models.WaiverVersion {
	waivers := make(map[string]models.WaiverVersion)
	var global models.WaiverVersion
	if err := dbConn.Where("scope = ? AND is_current = true", "GLOBAL").First(&global).Error; err == nil {
		waivers["GLOBAL"] = global
	}

	eventWaivers := []struct {
		EventID uint
		Key     string
		Title   string
		Content string
	}{
		{
			EventID: events.Malindi.ID,
			Key:     "malindi",
			Title:   "Malindi Marathon Waiver",
			Content: "You accept the Malindi marathon safety and liability terms.",
		},
		{
			EventID: events.Malindi.ID,
			Key:     "Malindi",
			Title:   "Malindi 10K Waiver",
			Content: "You accept the Malindi 10K race terms.",
		},
	}

	for _, item := range eventWaivers {
		waiver := models.WaiverVersion{
			Slug:        uuid.New(),
			Scope:       "EVENT",
			EventID:     &item.EventID,
			Version:     1,
			Title:       item.Title,
			Content:     item.Content,
			ContentHash: fmt.Sprintf("seed-%s", item.Key),
			EffectiveAt: time.Now().AddDate(0, 0, -2),
			IsCurrent:   true,
		}
		if err := dbConn.Where("scope = ? AND event_id = ?", waiver.Scope, item.EventID).FirstOrCreate(&waiver).Error; err != nil {
			log.Fatalf("seed waiver %s: %v", item.Key, err)
		}
		waivers[item.Key] = waiver
	}

	return waivers
}

func seedDemoRegistrations(dbConn *gorm.DB, events demoEvents, waivers map[string]models.WaiverVersion) []models.Registration {
	type registrationSeed struct {
		Event    models.Event
		Category string
		Name     string
		Email    string
		Status   string
		Gender   string
		Phone    string
	}

	seeds := []registrationSeed{
		{Event: events.Malindi, Category: "10K", Name: "Amina N.", Email: "amina.runner@example.com", Status: "confirmed", Gender: "F", Phone: "254700000010"},
		{Event: events.Malindi, Category: "21K", Name: "Jonas K.", Email: "jonas.runner@example.com", Status: "pending_payment", Gender: "M", Phone: "254700000011"},
		{Event: events.Malindi, Category: "42K", Name: "Faith W.", Email: "faith.runner@example.com", Status: "confirmed", Gender: "F", Phone: "254700000012"},
		{Event: events.Malindi, Category: "10K", Name: "Peter O.", Email: "peter.runner@example.com", Status: "confirmed", Gender: "M", Phone: "254700000013"},
		{Event: events.Malindi, Category: "5K", Name: "Leah M.", Email: "leah.runner@example.com", Status: "cancelled", Gender: "F", Phone: "254700000014"},
		{Event: events.Cleanup, Category: "", Name: "Sam Volunteer", Email: "sam.cleanup@example.com", Status: "confirmed", Gender: "M", Phone: "254700000015"},
	}

	var registrations []models.Registration
	for _, seed := range seeds {
		var categoryID *uint
		if seed.Category != "" {
			var category models.EventCategory
			if err := dbConn.Where("event_id = ? AND name = ?", seed.Event.ID, seed.Category).First(&category).Error; err == nil {
				categoryID = &category.ID
			}
		}

		registration := models.Registration{
			Slug:        uuid.New(),
			EventID:     seed.Event.ID,
			CategoryID:  categoryID,
			AthleteName: seed.Name,
			Email:       seed.Email,
			Phone:       seed.Phone,
			Gender:      seed.Gender,
			Nationality: "Kenya",
			Residence:   "Coast",
			TshirtSize:  "M",
			Status:      seed.Status,
			Extras:      datatypes.JSON(mustJSON(map[string]string{"note": "demo"})),
		}

		if err := dbConn.Where("event_id = ? AND email = ?", seed.Event.ID, seed.Email).FirstOrCreate(&registration).Error; err != nil {
			log.Fatalf("seed registration %s: %v", seed.Email, err)
		}

		waiverKey := "GLOBAL"
		if seed.Event.URLSlug == "malindi-marathon" {
			waiverKey = "malindi"
		} else if seed.Event.URLSlug == "Malindi-10k" {
			waiverKey = "Malindi"
		}
		if waiver, ok := waivers[waiverKey]; ok {
			consent := models.ConsentRecord{
				Slug:            uuid.New(),
				RegistrationID:  registration.ID,
				WaiverVersionID: waiver.ID,
				AcceptedAt:      time.Now().AddDate(0, 0, -5),
				IP:              "127.0.0.1",
				UserAgent:       "seed",
			}
			_ = dbConn.Where("registration_id = ?", registration.ID).FirstOrCreate(&consent).Error
		}

		registrations = append(registrations, registration)
	}

	return registrations
}

func seedDemoBibsAndCheckins(dbConn *gorm.DB, registrations []models.Registration, assignedBy uint) {
	for _, registration := range registrations {
		if registration.Status != "confirmed" {
			continue
		}

		var assignment models.BibAssignment
		if err := dbConn.Where("registration_id = ?", registration.ID).First(&assignment).Error; err == nil {
			continue
		}

		bibNumber := 100 + int(registration.ID)
		assignment = models.BibAssignment{
			Slug:           uuid.New(),
			EventID:        registration.EventID,
			RegistrationID: registration.ID,
			BibNumber:      bibNumber,
			AssignedAt:     time.Now().AddDate(0, 0, -1),
			AssignedBy:     pointerToUint(assignedBy),
		}
		if err := dbConn.Create(&assignment).Error; err != nil {
			log.Fatalf("seed bib assignment: %v", err)
		}

		if registration.ID%2 == 0 {
			checkin := models.Checkin{
				Slug:            uuid.New(),
				EventID:         registration.EventID,
				RegistrationID:  registration.ID,
				CheckedInAt:     pointerToTime(time.Now().AddDate(0, 0, -1)),
				BibCollectedAt:  pointerToTime(time.Now().AddDate(0, 0, -1)),
				CheckedByUserID: pointerToUint(assignedBy),
			}
			_ = dbConn.Where("registration_id = ?", registration.ID).FirstOrCreate(&checkin).Error
		}
	}
}

func seedDemoSponsorsExtra(dbConn *gorm.DB, events demoEvents, media map[string]models.Media) {
	tierDefs := []models.SponsorTier{
		{Slug: uuid.New(), Name: "Gold", Priority: 2},
		{Slug: uuid.New(), Name: "Silver", Priority: 3},
	}
	for i := range tierDefs {
		if err := dbConn.Where("name = ?", tierDefs[i].Name).FirstOrCreate(&tierDefs[i]).Error; err != nil {
			log.Fatalf("seed sponsor tier %s: %v", tierDefs[i].Name, err)
		}
	}

	var platinum models.SponsorTier
	_ = dbConn.Where("name = ?", "Platinum").First(&platinum).Error

	sponsors := []models.Sponsor{
		{
			Slug:         uuid.New(),
			TierID:       platinum.ID,
			Name:         "Oceanic Partners",
			URLSlug:      "oceanic-partners",
			Description:  "Coastal logistics and impact partner.",
			WebsiteURL:   "https://example.org",
			IsFeatured:   true,
			DisplayOrder: 1,
		},
		{
			Slug:         uuid.New(),
			TierID:       tierDefs[0].ID,
			Name:         "Sunrise Logistics",
			URLSlug:      "sunrise-logistics",
			Description:  "Supporting transport for volunteers.",
			WebsiteURL:   "https://example.org",
			IsFeatured:   true,
			DisplayOrder: 2,
		},
		{
			Slug:         uuid.New(),
			TierID:       tierDefs[1].ID,
			Name:         "Coastline Water",
			URLSlug:      "coastline-water",
			Description:  "Hydration sponsor for finish line.",
			WebsiteURL:   "https://example.org",
			DisplayOrder: 3,
		},
	}

	for i := range sponsors {
		if mediaItem, ok := media["sponsor-oceanic"]; ok && sponsors[i].URLSlug == "oceanic-partners" {
			sponsors[i].LogoMediaID = &mediaItem.ID
		}
		if mediaItem, ok := media["sponsor-sunrise"]; ok && sponsors[i].URLSlug == "sunrise-logistics" {
			sponsors[i].LogoMediaID = &mediaItem.ID
		}
		if err := dbConn.Where("url_slug = ?", sponsors[i].URLSlug).FirstOrCreate(&sponsors[i]).Error; err != nil {
			log.Fatalf("seed sponsor %s: %v", sponsors[i].Name, err)
		}
		updates := map[string]interface{}{
			"tier_id":       sponsors[i].TierID,
			"description":   sponsors[i].Description,
			"website_url":   sponsors[i].WebsiteURL,
			"is_featured":   sponsors[i].IsFeatured,
			"display_order": sponsors[i].DisplayOrder,
		}
		if sponsors[i].LogoMediaID != nil {
			updates["logo_media_id"] = *sponsors[i].LogoMediaID
		}
		if err := dbConn.Model(&sponsors[i]).Updates(updates).Error; err != nil {
			log.Fatalf("update sponsor %s: %v", sponsors[i].Name, err)
		}
	}

	var placementsCount int64
	_ = dbConn.Model(&models.SponsorPlacement{}).Count(&placementsCount).Error
	if placementsCount == 0 {
		for _, sponsor := range sponsors {
			placements := []models.SponsorPlacement{
				{Slug: uuid.New(), SponsorID: sponsor.ID, LocationKey: "HOME_STRIP"},
				{Slug: uuid.New(), SponsorID: sponsor.ID, EventID: &events.Malindi.ID, LocationKey: "EVENT_PAGE"},
			}
			if err := dbConn.Create(&placements).Error; err != nil {
				log.Fatalf("seed sponsor placements: %v", err)
			}
		}
	}

	var viewsCount int64
	_ = dbConn.Model(&models.SponsorView{}).Count(&viewsCount).Error
	if viewsCount == 0 {
		for _, sponsor := range sponsors {
			view := models.SponsorView{
				Slug:      uuid.New(),
				SponsorID: sponsor.ID,
				PageKey:   "HOME_STRIP",
				ViewedAt:  time.Now().AddDate(0, 0, -1),
				IPHash:    "seed-hash",
			}
			if err := dbConn.Create(&view).Error; err != nil {
				log.Fatalf("seed sponsor view: %v", err)
			}
		}
	}
}

func seedDemoVolunteers(dbConn *gorm.DB, events demoEvents) {
	var count int64
	_ = dbConn.Model(&models.Volunteer{}).Count(&count).Error
	if count > 0 {
		return
	}

	volunteers := []models.Volunteer{
		{Slug: uuid.New(), Name: "Sana Kariuki", Email: "sana@volunteer.local", Phone: "254700000020", Preferences: datatypes.JSON(mustJSON([]string{"check-in", "hydration"})), Notes: "Experienced marshal"},
		{Slug: uuid.New(), Name: "Brian Otieno", Email: "brian@volunteer.local", Phone: "254700000021", Preferences: datatypes.JSON(mustJSON([]string{"cleanup"})), Notes: "Cleanup lead"},
		{Slug: uuid.New(), Name: "Lila Wanjiku", Email: "lila@volunteer.local", Phone: "254700000022", Preferences: datatypes.JSON(mustJSON([]string{"media"})), Notes: "Photo volunteer"},
	}
	if err := dbConn.Create(&volunteers).Error; err != nil {
		log.Fatalf("seed volunteers: %v", err)
	}

	assignments := []models.VolunteerAssignment{
		{
			Slug:        uuid.New(),
			VolunteerID: volunteers[0].ID,
			EventID:     &events.Malindi.ID,
			RoleName:    "Check-In",
			ShiftStart:  pointerToTime(time.Now().AddDate(0, 0, -1)),
			ShiftEnd:    pointerToTime(time.Now().AddDate(0, 0, -1).Add(3 * time.Hour)),
			Location:    "Start gate",
			Status:      "assigned",
		},
		{
			Slug:        uuid.New(),
			VolunteerID: volunteers[1].ID,
			EventID:     &events.Cleanup.ID,
			RoleName:    "Cleanup Lead",
			ShiftStart:  pointerToTime(time.Now().AddDate(0, 0, -2)),
			ShiftEnd:    pointerToTime(time.Now().AddDate(0, 0, -2).Add(2 * time.Hour)),
			Location:    "Malindi Beach",
			Status:      "completed",
		},
	}
	if err := dbConn.Create(&assignments).Error; err != nil {
		log.Fatalf("seed volunteer assignments: %v", err)
	}

	attendance := models.VolunteerAttendance{
		Slug:         uuid.New(),
		AssignmentID: assignments[1].ID,
		CheckInAt:    pointerToTime(time.Now().AddDate(0, 0, -2)),
		CheckOutAt:   pointerToTime(time.Now().AddDate(0, 0, -2).Add(2 * time.Hour)),
	}
	_ = dbConn.Create(&attendance).Error
}

func seedDemoShop(dbConn *gorm.DB) demoShop {
	products := []models.Product{
		{
			Slug:              uuid.New(),
			Type:              "DONATION_TIER",
			Name:              "Ocean Guardians",
			URLSlug:           "ocean-guardians",
			Description:       "Support beach cleanup equipment.",
			PriceKESMinor:     pointerToInt(250000),
			AllowCustomAmount: true,
			Active:            true,
		},
		{
			Slug:              uuid.New(),
			Type:              "MERCH",
			Name:              "EcoStride Tee",
			URLSlug:           "ecostride-tee",
			Description:       "Organic cotton volunteer tee.",
			PriceKESMinor:     pointerToInt(180000),
			AllowCustomAmount: false,
			StockQty:          pointerToInt(50),
			Active:            true,
		},
		{
			Slug:              uuid.New(),
			Type:              "DONATION_TIER",
			Name:              "Clean Coast Boost",
			URLSlug:           "clean-coast-boost",
			Description:       "Fuel logistics for volunteer teams.",
			PriceKESMinor:     pointerToInt(500000),
			AllowCustomAmount: true,
			Active:            true,
		},
	}

	productMap := make(map[string]models.Product)
	for i := range products {
		if err := dbConn.Where("url_slug = ?", products[i].URLSlug).FirstOrCreate(&products[i]).Error; err != nil {
			log.Fatalf("seed product %s: %v", products[i].Name, err)
		}
		productMap[products[i].URLSlug] = products[i]
	}

	var orders []models.Order
	var orderCount int64
	_ = dbConn.Model(&models.Order{}).Count(&orderCount).Error
	if orderCount == 0 {
		order := models.Order{
			Slug:       uuid.New(),
			BuyerName:  "Maya L.",
			Email:      "maya@donor.local",
			Phone:      "254700000030",
			Currency:   "KES",
			TotalMinor: 250000,
			Status:     "paid",
		}
		if err := dbConn.Create(&order).Error; err != nil {
			log.Fatalf("seed order: %v", err)
		}
		orders = append(orders, order)

		item := models.OrderItem{
			Slug:           uuid.New(),
			OrderID:        order.ID,
			ProductID:      productMap["ocean-guardians"].ID,
			Qty:            1,
			UnitPriceMinor: 250000,
			LineTotalMinor: 250000,
			Meta:           datatypes.JSON(mustJSON(map[string]string{"note": "monthly supporter"})),
		}
		if err := dbConn.Create(&item).Error; err != nil {
			log.Fatalf("seed order item: %v", err)
		}

		merchOrder := models.Order{
			Slug:       uuid.New(),
			BuyerName:  "Kevin S.",
			Email:      "kevin@shop.local",
			Phone:      "254700000031",
			Currency:   "KES",
			TotalMinor: 360000,
			Status:     "pending",
		}
		if err := dbConn.Create(&merchOrder).Error; err != nil {
			log.Fatalf("seed merch order: %v", err)
		}
		orders = append(orders, merchOrder)

		merchItem := models.OrderItem{
			Slug:           uuid.New(),
			OrderID:        merchOrder.ID,
			ProductID:      productMap["ecostride-tee"].ID,
			Qty:            2,
			UnitPriceMinor: 180000,
			LineTotalMinor: 360000,
			Meta:           datatypes.JSON(mustJSON(map[string]string{"size": "M"})),
		}
		if err := dbConn.Create(&merchItem).Error; err != nil {
			log.Fatalf("seed merch item: %v", err)
		}
	} else {
		_ = dbConn.Find(&orders).Error
	}

	return demoShop{Products: productMap, Orders: orders}
}

func seedDemoPayments(dbConn *gorm.DB, registrations []models.Registration, orders []models.Order) []models.Payment {
	var payments []models.Payment
	paymentCount := 0

	for _, registration := range registrations {
		if registration.Status != "confirmed" {
			continue
		}

		var existing models.Payment
		if err := dbConn.Where("registration_id = ?", registration.ID).First(&existing).Error; err == nil {
			payments = append(payments, existing)
			continue
		}

		paymentCount++
		provider := "MPESA"
		providerRef := fmt.Sprintf("MPESA-%04d", paymentCount)
		if paymentCount%2 == 0 {
			provider = "STRIPE"
			providerRef = fmt.Sprintf("cs_demo_%04d", paymentCount)
		}

		payment := models.Payment{
			Slug:           uuid.New(),
			RegistrationID: &registration.ID,
			Provider:       provider,
			Currency:       "KES",
			AmountMinor:    150000,
			Status:         "success",
			ProviderRef:    providerRef,
			Metadata:       datatypes.JSON(mustJSON(map[string]string{"source": "seed"})),
		}
		if err := dbConn.Create(&payment).Error; err != nil {
			log.Fatalf("seed payment: %v", err)
		}

		payments = append(payments, payment)
		_ = dbConn.Model(&models.Registration{}).Where("id = ?", registration.ID).Update("status", "confirmed").Error

		event := models.PaymentEvent{
			Slug:            uuid.New(),
			PaymentID:       payment.ID,
			ProviderEventID: fmt.Sprintf("evt-demo-%04d", paymentCount),
			Type:            "payment.success",
			Payload:         datatypes.JSON(mustJSON(map[string]string{"status": "success"})),
			ReceivedAt:      time.Now().AddDate(0, 0, -1),
		}
		_ = dbConn.Create(&event).Error
	}

	for _, order := range orders {
		if order.Status != "paid" {
			continue
		}
		var existing models.Payment
		if err := dbConn.Where("order_id = ?", order.ID).First(&existing).Error; err == nil {
			payments = append(payments, existing)
			continue
		}

		paymentCount++
		payment := models.Payment{
			Slug:        uuid.New(),
			OrderID:     &order.ID,
			Provider:    "STRIPE",
			Currency:    order.Currency,
			AmountMinor: order.TotalMinor,
			Status:      "success",
			ProviderRef: fmt.Sprintf("cs_order_%04d", paymentCount),
			Metadata:    datatypes.JSON(mustJSON(map[string]string{"source": "seed"})),
		}
		if err := dbConn.Create(&payment).Error; err != nil {
			log.Fatalf("seed order payment: %v", err)
		}
		payments = append(payments, payment)

		event := models.PaymentEvent{
			Slug:            uuid.New(),
			PaymentID:       payment.ID,
			ProviderEventID: fmt.Sprintf("evt-order-%04d", paymentCount),
			Type:            "payment.success",
			Payload:         datatypes.JSON(mustJSON(map[string]string{"status": "success"})),
			ReceivedAt:      time.Now().AddDate(0, 0, -1),
		}
		_ = dbConn.Create(&event).Error
	}

	return payments
}

func seedDemoReceipts(dbConn *gorm.DB, payments []models.Payment, media map[string]models.Media) {
	for i, payment := range payments {
		if payment.Status != "success" {
			continue
		}

		var existing models.Receipt
		if err := dbConn.Where("payment_id = ?", payment.ID).First(&existing).Error; err == nil {
			continue
		}

		receipt := models.Receipt{
			Slug:          uuid.New(),
			PaymentID:     payment.ID,
			ReceiptNumber: fmt.Sprintf("ES-DEMO-%04d", i+1),
			IssuedAt:      time.Now().AddDate(0, 0, -1),
			EmailTo:       "receipt@demo.local",
		}
		if mediaItem, ok := media["receipt-demo"]; ok {
			receipt.PDFMediaID = &mediaItem.ID
		}
		if err := dbConn.Create(&receipt).Error; err != nil {
			log.Fatalf("seed receipt: %v", err)
		}
	}
}

func seedDemoResults(dbConn *gorm.DB, events demoEvents, media map[string]models.Media) {
	var count int64
	_ = dbConn.Model(&models.Result{}).Where("event_id = ?", events.Malindi.ID).Count(&count).Error
	if count > 0 {
		return
	}

	fileID := uint(0)
	if mediaItem, ok := media["results-demo"]; ok {
		fileID = mediaItem.ID
	}

	importRecord := models.ResultImport{
		Slug:        uuid.New(),
		EventID:     events.Malindi.ID,
		FileMediaID: fileID,
		ImportedBy:  0,
		ImportedAt:  time.Now().AddDate(0, 0, -1),
		Status:      "imported",
		Summary:     datatypes.JSON(mustJSON(map[string]int{"imported": 3, "failed": 0})),
	}
	_ = dbConn.Create(&importRecord).Error

	results := []models.Result{
		{
			Slug:             uuid.New(),
			EventID:          events.Malindi.ID,
			BibNumber:        101,
			Name:             "Amina N.",
			CategoryName:     "10K",
			Gender:           "F",
			Age:              pointerToInt(28),
			FinishSeconds:    3600,
			PositionOverall:  pointerToInt(1),
			PositionCategory: pointerToInt(1),
		},
		{
			Slug:             uuid.New(),
			EventID:          events.Malindi.ID,
			BibNumber:        205,
			Name:             "Jonas K.",
			CategoryName:     "21K",
			Gender:           "M",
			Age:              pointerToInt(34),
			FinishSeconds:    5400,
			PositionOverall:  pointerToInt(2),
			PositionCategory: pointerToInt(1),
		},
		{
			Slug:             uuid.New(),
			EventID:          events.Malindi.ID,
			BibNumber:        315,
			Name:             "Faith W.",
			CategoryName:     "42K",
			Gender:           "F",
			Age:              pointerToInt(31),
			FinishSeconds:    10800,
			PositionOverall:  pointerToInt(3),
			PositionCategory: pointerToInt(1),
		},
	}
	if err := dbConn.Create(&results).Error; err != nil {
		log.Fatalf("seed results: %v", err)
	}
}

func seedDemoFinance(dbConn *gorm.DB, payments []models.Payment, media map[string]models.Media, financeID uint) {
	var count int64
	_ = dbConn.Model(&models.BankImport{}).Count(&count).Error
	if count > 0 {
		return
	}

	fileID := uint(0)
	if mediaItem, ok := media["bank-demo"]; ok {
		fileID = mediaItem.ID
	}

	mapping := map[string]string{
		"date":        "date",
		"amount":      "amount",
		"currency":    "currency",
		"reference":   "reference",
		"description": "description",
	}

	bankImport := models.BankImport{
		Slug:        uuid.New(),
		ImportedBy:  financeID,
		FileMediaID: fileID,
		Mapping:     datatypes.JSON(mustJSON(mapping)),
		ImportedAt:  time.Now().AddDate(0, 0, -1),
	}
	if err := dbConn.Create(&bankImport).Error; err != nil {
		log.Fatalf("seed bank import: %v", err)
	}

	var matchPaymentID *uint
	if len(payments) > 0 {
		matchPaymentID = &payments[0].ID
	}

	rows := []models.ReconciliationMatch{
		{
			Slug:         uuid.New(),
			BankImportID: bankImport.ID,
			BankRowHash:  "seed-match-1",
			PaymentID:    matchPaymentID,
			Status:       "matched",
			Notes:        "Auto matched",
			RowData:      datatypes.JSON(mustJSON(map[string]string{"reference": "MPESA-0001"})),
			ResolvedBy:   pointerToUint(financeID),
			ResolvedAt:   pointerToTime(time.Now().AddDate(0, 0, -1)),
		},
		{
			Slug:         uuid.New(),
			BankImportID: bankImport.ID,
			BankRowHash:  "seed-unmatched-1",
			Status:       "unmatched",
			Notes:        "Awaiting resolution",
			RowData:      datatypes.JSON(mustJSON(map[string]string{"reference": "UNKNOWN-001"})),
		},
	}

	if err := dbConn.Create(&rows).Error; err != nil {
		log.Fatalf("seed reconciliation matches: %v", err)
	}
}

func seedDemoAudit(dbConn *gorm.DB, users demoUsers) {
	var count int64
	_ = dbConn.Model(&models.AuditLog{}).Count(&count).Error
	if count > 0 {
		return
	}

	actorID := pickUserID(users.Admin, users.OrgAdmin)
	entries := []models.AuditLog{
		{
			Slug:        uuid.New(),
			ActorUserID: actorID,
			ActionKey:   "event.publish",
			EntityType:  "event",
			EntityID:    "malindi-marathon",
			NewJSON:     datatypes.JSON(mustJSON(map[string]string{"status": "published"})),
			IP:          "127.0.0.1",
			UserAgent:   "seed",
		},
		{
			Slug:        uuid.New(),
			ActorUserID: actorID,
			ActionKey:   "cms.page.publish",
			EntityType:  "page",
			EntityID:    "contact",
			NewJSON:     datatypes.JSON(mustJSON(map[string]string{"status": "published"})),
			IP:          "127.0.0.1",
			UserAgent:   "seed",
		},
		{
			Slug:        uuid.New(),
			ActorUserID: actorID,
			ActionKey:   "payment.success",
			EntityType:  "payment",
			EntityID:    "seed",
			NewJSON:     datatypes.JSON(mustJSON(map[string]string{"status": "success"})),
			IP:          "127.0.0.1",
			UserAgent:   "seed",
		},
	}

	if err := dbConn.Create(&entries).Error; err != nil {
		log.Fatalf("seed audit logs: %v", err)
	}
}

func seedDemoRefreshTokens(dbConn *gorm.DB, users demoUsers) {
	var count int64
	_ = dbConn.Model(&models.RefreshToken{}).Count(&count).Error
	if count > 0 {
		return
	}

	seedUsers := []models.User{users.Admin, users.OrgAdmin, users.Finance}
	for _, user := range seedUsers {
		if user.ID == 0 {
			continue
		}
		token := models.RefreshToken{
			Slug:      uuid.New(),
			UserID:    user.ID,
			TokenHash: fmt.Sprintf("seed-token-%d", user.ID),
			ExpiresAt: time.Now().AddDate(0, 1, 0),
		}
		if err := dbConn.Create(&token).Error; err != nil {
			log.Fatalf("seed refresh token: %v", err)
		}
	}
}

func seedDemoJobs(dbConn *gorm.DB) {
	var count int64
	_ = dbConn.Model(&models.Job{}).Count(&count).Error
	if count > 0 {
		return
	}

	job := models.Job{
		Slug:    uuid.New(),
		Type:    "receipt.email",
		Status:  "pending",
		Payload: datatypes.JSON(mustJSON(map[string]string{"demo": "true"})),
		RunAt:   time.Now().Add(5 * time.Minute),
	}
	if err := dbConn.Create(&job).Error; err != nil {
		log.Fatalf("seed job: %v", err)
	}
}

func seedEventWithSlug(dbConn *gorm.DB, event models.Event) models.Event {
	if err := dbConn.Where("url_slug = ?", event.URLSlug).FirstOrCreate(&event).Error; err != nil {
		log.Fatalf("seed event %s: %v", event.URLSlug, err)
	}
	return event
}

func seedUser(dbConn *gorm.DB, name, email, password string) models.User {
	var user models.User
	err := dbConn.Where("email = ?", email).First(&user).Error
	if err == nil {
		return user
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		log.Fatalf("lookup user %s: %v", email, err)
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}

	user = models.User{
		Slug:         uuid.New(),
		Name:         name,
		Email:        email,
		PasswordHash: hash,
		IsActive:     true,
	}
	if err := dbConn.Create(&user).Error; err != nil {
		log.Fatalf("create user %s: %v", email, err)
	}
	return user
}

func attachRole(dbConn *gorm.DB, user models.User, role models.Role) {
	if user.ID == 0 || role.ID == 0 {
		return
	}
	if err := dbConn.Model(&user).Association("Roles").Replace(&role); err != nil {
		log.Fatalf("assign role %s: %v", role.Name, err)
	}
}

func pickUserID(primary models.User, fallback models.User) uint {
	if primary.ID != 0 {
		return primary.ID
	}
	return fallback.ID
}

func pointerToInt(value int) *int {
	return &value
}

func pointerToUint(value uint) *uint {
	if value == 0 {
		return nil
	}
	return &value
}

func pointerToTime(value time.Time) *time.Time {
	return &value
}

func mustJSON(value interface{}) []byte {
	payload, _ := json.Marshal(value)
	return payload
}

func allPermissionKeys(perms map[string]models.Permission) []string {
	keys := make([]string, 0, len(perms))
	for key := range perms {
		keys = append(keys, key)
	}
	return keys
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
