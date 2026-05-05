package dto

import (
	"encoding/json"
	"time"

	"ecostride/backend/internal/common/models"

	"gorm.io/datatypes"
)

// ---- Converters: Model -> DTO ----

// EventFromModel converts a models.Event to dto.Event
func EventFromModel(m models.Event) Event {
	return Event{
		Slug:        m.Slug.String(),
		URLSlug:     m.URLSlug,
		Type:        m.Type,
		Title:       m.Title,
		Description: m.Description,
		Location:    m.Location,
		MapURL:      m.MapURL,
		StartAt:     m.StartAt,
		RegOpenAt:   m.RegOpenAt,
		RegCloseAt:  m.RegCloseAt,
		Status:      m.Status,
		IsFeatured:  m.IsFeatured,
		HeroMediaID: m.HeroMediaID,
		SEOTitle:    m.SEOTitle,
		SEODesc:     m.SEODesc,
		CreatedAt:   m.CreatedAt,
	}
}

// EventCategoryFromModel converts a models.EventCategory to dto.EventCategory
func EventCategoryFromModel(m models.EventCategory) EventCategory {
	return EventCategory{
		Slug:          m.Slug.String(),
		EventID:       m.EventID,
		Name:          m.Name,
		PriceKESMinor: m.PriceKESMinor,
		PriceUSDMinor: m.PriceUSDMinor,
		PriceEURMinor: m.PriceEURMinor,
		Capacity:      m.Capacity,
		Rules:         m.Rules,
		BibPrefix:     m.BibPrefix,
		BibRangeStart: m.BibRangeStart,
		BibRangeEnd:   m.BibRangeEnd,
		BibNext:       m.BibNext,
	}
}

// EventFormFieldFromModel converts a models.EventFormField to dto.EventFormField
func EventFormFieldFromModel(m models.EventFormField) EventFormField {
	return EventFormField{
		Slug:     m.Slug.String(),
		EventID:  m.EventID,
		Key:      m.Key,
		Label:    m.Label,
		Type:     m.Type,
		Required: m.Required,
		Options:  m.Options,
		Order:    m.Order,
	}
}

// VolunteerFromModel converts a models.Volunteer to dto.Volunteer
func VolunteerFromModel(m models.Volunteer) Volunteer {
	prefs := parseVolunteerPreferences(m.Preferences)
	return Volunteer{
		Slug:        m.Slug.String(),
		Name:        m.Name,
		Email:       m.Email,
		Phone:       m.Phone,
		Preferences: prefs,
		Notes:       m.Notes,
		CreatedAt:   m.CreatedAt,
	}
}

func parseVolunteerPreferences(raw datatypes.JSON) VolunteerPreferences {
	var prefs struct {
		Roles     []string `json:"roles"`
		EventSlug *string  `json:"event_slug"`
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &prefs)
	}
	if prefs.Roles == nil {
		prefs.Roles = []string{}
	}
	return VolunteerPreferences{
		Roles:     prefs.Roles,
		EventSlug: prefs.EventSlug,
	}
}

// VolunteerAssignmentFromModel converts a models.VolunteerAssignment to dto.VolunteerAssignment
func VolunteerAssignmentFromModel(m models.VolunteerAssignment) VolunteerAssignment {
	return VolunteerAssignment{
		Slug:       m.Slug.String(),
		RoleName:   m.RoleName,
		Status:     m.Status,
		ShiftStart: m.ShiftStart,
		ShiftEnd:   m.ShiftEnd,
		Location:   m.Location,
	}
}

// SponsorTierFromModel converts models.SponsorTier to dto.SponsorTier
func SponsorTierFromModel(m models.SponsorTier) SponsorTier {
	return SponsorTier{
		Slug:     m.Slug.String(),
		Name:     m.Name,
		Priority: m.Priority,
	}
}

// SponsorFromModel converts models.Sponsor to dto.Sponsor (basic, without joins)
func SponsorFromModel(m models.Sponsor) Sponsor {
	return Sponsor{
		Slug:         m.Slug.String(),
		URLSlug:      m.URLSlug,
		Name:         m.Name,
		Description:  m.Description,
		WebsiteURL:   m.WebsiteURL,
		IsFeatured:   m.IsFeatured,
		DisplayOrder: m.DisplayOrder,
		LogoMediaID:  m.LogoMediaID,
	}
}

// ProductFromModel converts models.Product to dto.Product
func ProductFromModel(m models.Product) Product {
	return Product{
		Slug:                m.Slug.String(),
		URLSlug:             m.URLSlug,
		Type:                m.Type,
		Name:                m.Name,
		Description:         m.Description,
		PrimaryImageMediaID: m.PrimaryImageMediaID,
		PriceKESMinor:       m.PriceKESMinor,
		PriceUSDMinor:       m.PriceUSDMinor,
		PriceEURMinor:       m.PriceEURMinor,
		AllowCustomAmount:   m.AllowCustomAmount,
		StockQty:            m.StockQty,
		Active:              m.Active,
		CreatedAt:           m.CreatedAt,
	}
}

// OrderFromModel converts models.Order to dto.Order
func OrderFromModel(m models.Order) Order {
	return Order{
		Slug:       m.Slug.String(),
		BuyerName:  m.BuyerName,
		Email:      m.Email,
		Phone:      m.Phone,
		Currency:   m.Currency,
		TotalMinor: m.TotalMinor,
		Status:     m.Status,
		CreatedAt:  m.CreatedAt,
	}
}

// WaiverFromModel converts models.WaiverVersion to dto.Waiver
func WaiverFromModel(m models.WaiverVersion) Waiver {
	return Waiver{
		Slug:        m.Slug.String(),
		Scope:       m.Scope,
		Version:     m.Version,
		Title:       m.Title,
		Content:     m.Content,
		EffectiveAt: m.EffectiveAt,
		IsCurrent:   m.IsCurrent,
	}
}

// UserProfileFromModel converts models.User to dto.UserProfile
func UserProfileFromModel(m models.User, permissions []string) UserProfile {
	roles := make([]Role, 0, len(m.Roles))
	for _, r := range m.Roles {
		roles = append(roles, Role{
			Slug:        r.Slug.String(),
			Name:        r.Name,
			Description: r.Description,
		})
	}
	return UserProfile{
		Slug:        m.Slug.String(),
		Name:        m.Name,
		Email:       m.Email,
		Phone:       m.Phone,
		IsActive:    m.IsActive,
		CreatedAt:   m.CreatedAt,
		Roles:       roles,
		Permissions: permissions,
	}
}

// EventsFromModels converts a slice of models.Event to []dto.Event
func EventsFromModels(models []models.Event) []Event {
	result := make([]Event, 0, len(models))
	for _, m := range models {
		result = append(result, EventFromModel(m))
	}
	return result
}

// EventCategoriesFromModels converts a slice of models.EventCategory
func EventCategoriesFromModels(models []models.EventCategory) []EventCategory {
	result := make([]EventCategory, 0, len(models))
	for _, m := range models {
		result = append(result, EventCategoryFromModel(m))
	}
	return result
}

// EventFormFieldsFromModels converts a slice of models.EventFormField
func EventFormFieldsFromModels(models []models.EventFormField) []EventFormField {
	result := make([]EventFormField, 0, len(models))
	for _, m := range models {
		result = append(result, EventFormFieldFromModel(m))
	}
	return result
}

// SponsorTiersFromModels converts a slice of models.SponsorTier
func SponsorTiersFromModels(models []models.SponsorTier) []SponsorTier {
	result := make([]SponsorTier, 0, len(models))
	for _, m := range models {
		result = append(result, SponsorTierFromModel(m))
	}
	return result
}

// ---- Helper for timestamp formatting ----

func FormatTime(t time.Time) string {
	return t.Format(time.RFC3339)
}
