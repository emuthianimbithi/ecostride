// Package dto provides Data Transfer Objects for API responses.
// These DTOs define the contract layer - all JSON field names must be snake_case.
package dto

import (
	"time"

	"gorm.io/datatypes"
)

// ---- Common Types ----

// SuccessResponse for simple success messages
type SuccessResponse struct {
	Status string `json:"status"`
}

// PaginationMeta for paginated responses
type PaginationMeta struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

// PaginatedResponse wraps paginated data
type PaginatedResponse[T any] struct {
	Data []T            `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

// ---- Auth/User DTOs ----

type UserProfile struct {
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	Email       string    `json:"email"`
	Phone       string    `json:"phone,omitempty"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	Roles       []Role    `json:"roles,omitempty"`
	Permissions []string  `json:"permissions,omitempty"`
}

type Role struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type LoginResponse struct {
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
	User         UserProfile `json:"user"`
}

// ---- Event DTOs ----

type Event struct {
	Slug        string     `json:"slug"`
	URLSlug     string     `json:"url_slug"`
	Type        string     `json:"type"`
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	Location    string     `json:"location,omitempty"`
	MapURL      string     `json:"map_url,omitempty"`
	StartAt     time.Time  `json:"start_at"`
	RegOpenAt   *time.Time `json:"reg_open_at,omitempty"`
	RegCloseAt  *time.Time `json:"reg_close_at,omitempty"`
	Status      string     `json:"status"`
	HeroMediaID *uint      `json:"hero_media_id,omitempty"`
	SEOTitle    string     `json:"seo_title,omitempty"`
	SEODesc     string     `json:"seo_desc,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type EventCategory struct {
	Slug          string         `json:"slug"`
	EventID       uint           `json:"event_id"`
	Name          string         `json:"name"`
	PriceKESMinor int            `json:"price_kes_minor"`
	PriceUSDMinor *int           `json:"price_usd_minor,omitempty"`
	PriceEURMinor *int           `json:"price_eur_minor,omitempty"`
	Capacity      *int           `json:"capacity,omitempty"`
	Rules         datatypes.JSON `json:"rules,omitempty"`
	BibPrefix     string         `json:"bib_prefix,omitempty"`
	BibRangeStart *int           `json:"bib_range_start,omitempty"`
	BibRangeEnd   *int           `json:"bib_range_end,omitempty"`
	BibNext       *int           `json:"bib_next,omitempty"`
}

type EventFormField struct {
	Slug     string         `json:"slug"`
	EventID  uint           `json:"event_id"`
	Key      string         `json:"key"`
	Label    string         `json:"label"`
	Type     string         `json:"type"`
	Required bool           `json:"required"`
	Options  datatypes.JSON `json:"options,omitempty"`
	Order    int            `json:"order"`
}

// ---- Volunteer DTOs ----

type Volunteer struct {
	Slug        string               `json:"slug"`
	Name        string               `json:"name"`
	Email       string               `json:"email"`
	Phone       string               `json:"phone,omitempty"`
	Preferences VolunteerPreferences `json:"preferences"`
	Notes       string               `json:"notes,omitempty"`
	CreatedAt   time.Time            `json:"created_at"`
}

type VolunteerPreferences struct {
	Roles     []string `json:"roles"`
	EventSlug *string  `json:"event_slug"`
}

type VolunteerAssignment struct {
	Slug       string     `json:"slug"`
	RoleName   string     `json:"role_name"`
	Status     string     `json:"status,omitempty"`
	EventSlug  *string    `json:"event_slug,omitempty"`
	EventTitle *string    `json:"event_title,omitempty"`
	ShiftStart *time.Time `json:"shift_start,omitempty"`
	ShiftEnd   *time.Time `json:"shift_end,omitempty"`
	Location   string     `json:"location,omitempty"`
}

// ---- Sponsor DTOs ----

type SponsorTier struct {
	Slug     string `json:"slug"`
	Name     string `json:"name"`
	Priority int    `json:"priority"`
}

type Sponsor struct {
	Slug         string             `json:"slug"`
	URLSlug      string             `json:"url_slug"`
	Name         string             `json:"name"`
	Description  string             `json:"description,omitempty"`
	WebsiteURL   string             `json:"website_url,omitempty"`
	IsFeatured   bool               `json:"is_featured"`
	DisplayOrder int                `json:"display_order"`
	TierSlug     string             `json:"tier_slug,omitempty"`
	TierName     string             `json:"tier_name,omitempty"`
	TierPriority int                `json:"tier_priority,omitempty"`
	LogoMediaID  *uint              `json:"logo_media_id,omitempty"`
	LogoURL      *string            `json:"logo_url,omitempty"`
	LogoAlt      *string            `json:"logo_alt,omitempty"`
	Placements   []SponsorPlacement `json:"placements,omitempty"`
}

type SponsorPlacement struct {
	LocationKey string  `json:"location_key"`
	EventSlug   *string `json:"event_slug,omitempty"`
	EventTitle  *string `json:"event_title,omitempty"`
}

// ---- Shop DTOs ----

type Product struct {
	Slug                string    `json:"slug"`
	URLSlug             string    `json:"url_slug"`
	Type                string    `json:"type"`
	Name                string    `json:"name"`
	Description         string    `json:"description,omitempty"`
	PrimaryImageMediaID *uint     `json:"primary_image_media_id,omitempty"`
	ImageURL            *string   `json:"image_url,omitempty"`
	ImageAlt            *string   `json:"image_alt,omitempty"`
	PriceKESMinor       *int      `json:"price_kes_minor,omitempty"`
	PriceUSDMinor       *int      `json:"price_usd_minor,omitempty"`
	PriceEURMinor       *int      `json:"price_eur_minor,omitempty"`
	AllowCustomAmount   bool      `json:"allow_custom_amount"`
	StockQty            *int      `json:"stock_qty,omitempty"`
	Active              bool      `json:"active"`
	CreatedAt           time.Time `json:"created_at"`
}

type Order struct {
	Slug       string      `json:"slug"`
	BuyerName  string      `json:"buyer_name"`
	Email      string      `json:"email"`
	Phone      string      `json:"phone,omitempty"`
	Currency   string      `json:"currency"`
	TotalMinor int         `json:"total_minor"`
	Status     string      `json:"status"`
	CreatedAt  time.Time   `json:"created_at"`
	Items      []OrderItem `json:"items,omitempty"`
}

type OrderItem struct {
	Slug           string `json:"slug"`
	ProductSlug    string `json:"product_slug,omitempty"`
	ProductName    string `json:"product_name,omitempty"`
	Qty            int    `json:"qty"`
	UnitPriceMinor int    `json:"unit_price_minor"`
	LineTotalMinor int    `json:"line_total_minor"`
}

// ---- Payment DTOs ----

type PaymentStatus struct {
	PaymentID        string  `json:"payment_id"`
	Status           string  `json:"status"`
	Provider         string  `json:"provider"`
	Currency         string  `json:"currency"`
	AmountMinor      int     `json:"amount_minor"`
	ProviderRef      string  `json:"provider_ref,omitempty"`
	CreatedAt        string  `json:"created_at"`
	RegistrationSlug *string `json:"registration_slug,omitempty"`
	OrderSlug        *string `json:"order_slug,omitempty"`
}

// ---- Waiver DTO ----

type Waiver struct {
	Slug        string    `json:"slug"`
	Scope       string    `json:"scope"`
	Version     int       `json:"version"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	EffectiveAt time.Time `json:"effective_at"`
	IsCurrent   bool      `json:"is_current"`
}
