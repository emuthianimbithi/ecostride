package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Identity / RBAC

type User struct {
	gorm.Model
	Slug         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Name         string    `json:"name"`
	Email        string    `gorm:"uniqueIndex" json:"email"`
	Phone        string    `json:"phone"`
	PasswordHash string    `json:"-"` // never expose
	IsActive     bool      `json:"is_active"`
	Roles        []Role    `gorm:"many2many:user_roles" json:"roles,omitempty"`
}

type Role struct {
	gorm.Model
	Slug        uuid.UUID    `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Name        string       `gorm:"uniqueIndex" json:"name"`
	Description string       `json:"description"`
	Permissions []Permission `gorm:"many2many:role_permissions" json:"permissions,omitempty"`
}

type Permission struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Key         string    `gorm:"uniqueIndex" json:"key"`
	Description string    `json:"description"`
}

type UserRole struct {
	gorm.Model
	Slug   uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	UserID uint      `gorm:"uniqueIndex:idx_user_roles" json:"user_id"`
	RoleID uint      `gorm:"uniqueIndex:idx_user_roles" json:"role_id"`
}

type RolePermission struct {
	gorm.Model
	Slug         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	RoleID       uint      `gorm:"uniqueIndex:idx_role_permissions" json:"role_id"`
	PermissionID uint      `gorm:"uniqueIndex:idx_role_permissions" json:"permission_id"`
}

type RefreshToken struct {
	gorm.Model
	Slug      uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	UserID    uint       `gorm:"index" json:"user_id"`
	TokenHash string     `gorm:"uniqueIndex" json:"-"` // never expose
	ExpiresAt time.Time  `json:"expires_at"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
}

// CMS

type Page struct {
	gorm.Model
	Slug           uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	URLSlug        string         `gorm:"uniqueIndex" json:"url_slug"`
	Title          string         `json:"title"`
	Status         string         `json:"status"`
	Blocks         datatypes.JSON `gorm:"type:jsonb" json:"blocks"`
	SEOTitle       string         `json:"seo_title"`
	SEODesc        string         `json:"seo_desc"`
	OgImageMediaID *uint          `json:"og_image_media_id,omitempty"`
	PublishedAt    *time.Time     `json:"published_at,omitempty"`
}

type Post struct {
	gorm.Model
	Slug                 uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	URLSlug              string         `gorm:"uniqueIndex" json:"url_slug"`
	Title                string         `json:"title"`
	Content              datatypes.JSON `gorm:"type:jsonb" json:"content"`
	Excerpt              string         `json:"excerpt"`
	FeaturedImageMediaID *uint          `json:"featured_image_media_id,omitempty"`
	HeroStyleID          *uint          `json:"hero_style_id,omitempty"`
	HeroShowTitle        bool           `gorm:"default:true" json:"hero_show_title"`
	Status               string         `json:"status"`
	PublishedAt          *time.Time     `json:"published_at,omitempty"`
	AuthorUserID         uint           `json:"author_user_id"`
}

type HeroStyle struct {
	gorm.Model
	Slug           uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Name           string         `gorm:"uniqueIndex" json:"name"`
	Key            string         `gorm:"uniqueIndex" json:"key"`
	Description    string         `json:"description"`
	LayoutType     string         `json:"layout_type"`
	AspectRatio    string         `json:"aspect_ratio"`
	Overlay        datatypes.JSON `gorm:"type:jsonb" json:"overlay"`
	FocalPoint     datatypes.JSON `gorm:"type:jsonb" json:"focal_point"`
	TextPlacement  string         `json:"text_placement"`
	PaddingVariant string         `json:"padding_variant"`
	IsActive       bool           `gorm:"default:true" json:"is_active"`
}

type Setting struct {
	gorm.Model
	Key   string         `gorm:"uniqueIndex" json:"key"`
	Value datatypes.JSON `gorm:"type:jsonb" json:"value"`
}

type Category struct {
	gorm.Model
	Slug    uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Name    string    `gorm:"uniqueIndex" json:"name"`
	URLSlug string    `gorm:"uniqueIndex" json:"url_slug"`
}

type Tag struct {
	gorm.Model
	Slug    uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Name    string    `gorm:"uniqueIndex" json:"name"`
	URLSlug string    `gorm:"uniqueIndex" json:"url_slug"`
}

type PostCategory struct {
	gorm.Model
	Slug       uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	PostID     uint      `gorm:"uniqueIndex:idx_post_categories" json:"post_id"`
	CategoryID uint      `gorm:"uniqueIndex:idx_post_categories" json:"category_id"`
}

type PostTag struct {
	gorm.Model
	Slug   uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	PostID uint      `gorm:"uniqueIndex:idx_post_tags" json:"post_id"`
	TagID  uint      `gorm:"uniqueIndex:idx_post_tags" json:"tag_id"`
}

type Media struct {
	gorm.Model
	Slug      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Type      string    `json:"type"`
	Path      string    `json:"path"`
	URL       string    `json:"url"`
	Mime      string    `json:"mime"`
	Size      int64     `json:"size"`
	AltText   string    `json:"alt_text"`
	CreatedBy uint      `json:"created_by"`
}

type GalleryAlbum struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Title       string    `json:"title"`
	URLSlug     string    `gorm:"uniqueIndex" json:"url_slug"`
	Description string    `json:"description"`
}

type AlbumMedia struct {
	gorm.Model
	Slug      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	AlbumID   uint      `gorm:"uniqueIndex:idx_album_media" json:"album_id"`
	MediaID   uint      `gorm:"uniqueIndex:idx_album_media" json:"media_id"`
	SortOrder int       `json:"sort_order"`
}

type WaiverVersion struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Scope       string    `json:"scope"`
	EventID     *uint     `json:"event_id,omitempty"`
	Version     int       `json:"version"`
	Title       string    `json:"title"`
	Content     string    `gorm:"type:text" json:"content"`
	ContentHash string    `json:"content_hash"`
	EffectiveAt time.Time `json:"effective_at"`
	IsCurrent   bool      `json:"is_current"`
}

// Events

type Event struct {
	gorm.Model
	Slug             uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	URLSlug          string     `gorm:"uniqueIndex" json:"url_slug"`
	Type             string     `json:"type"`
	Title            string     `json:"title"`
	Description      string     `gorm:"type:text" json:"description"`
	Location         string     `json:"location"`
	MapURL           string     `json:"map_url"`
	StartAt          time.Time  `json:"start_at"`
	RegOpenAt        *time.Time `json:"reg_open_at,omitempty"`
	RegCloseAt       *time.Time `json:"reg_close_at,omitempty"`
	Status           string     `json:"status"`
	ResultsPublished bool       `gorm:"default:false" json:"results_published"`
	HeroMediaID      *uint      `json:"hero_media_id,omitempty"`
	SEOTitle         string     `json:"seo_title"`
	SEODesc          string     `json:"seo_desc"`
	CreatedBy        uint       `json:"created_by"`
}

type EventCategory struct {
	gorm.Model
	Slug          uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	EventID       uint           `gorm:"index" json:"event_id"`
	Name          string         `json:"name"`
	PriceKESMinor int            `json:"price_kes_minor"`
	PriceUSDMinor *int           `json:"price_usd_minor,omitempty"`
	PriceEURMinor *int           `json:"price_eur_minor,omitempty"`
	Capacity      *int           `json:"capacity,omitempty"`
	Rules         datatypes.JSON `gorm:"type:jsonb" json:"rules"`
	BibPrefix     string         `json:"bib_prefix"`
	BibRangeStart *int           `json:"bib_range_start,omitempty"`
	BibRangeEnd   *int           `json:"bib_range_end,omitempty"`
	BibNext       *int           `json:"bib_next,omitempty"`
}

type EventFormField struct {
	gorm.Model
	Slug     uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	EventID  uint           `gorm:"index" json:"event_id"`
	Key      string         `json:"key"`
	Label    string         `json:"label"`
	Type     string         `json:"type"`
	Required bool           `json:"required"`
	Options  datatypes.JSON `gorm:"type:jsonb" json:"options"`
	Order    int            `json:"order"`
}

// Registrations + consent

type Registration struct {
	gorm.Model
	Slug               uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	EventID            uint           `json:"event_id"`
	CategoryID         *uint          `json:"category_id,omitempty"`
	AthleteName        string         `json:"athlete_name"`
	Email              string         `json:"email"`
	Phone              string         `json:"phone"`
	Dob                *time.Time     `json:"dob,omitempty"`
	Gender             string         `json:"gender"`
	Nationality        string         `json:"nationality"`
	Residence          string         `json:"residence"`
	TshirtSize         string         `json:"tshirt_size"`
	EmergencyName      string         `json:"emergency_name"`
	EmergencyPhone     string         `json:"emergency_phone"`
	MedicalDeclaration string         `json:"medical_declaration"`
	Experience         string         `json:"experience"`
	Extras             datatypes.JSON `gorm:"type:jsonb" json:"extras"`
	Status             string         `json:"status"`
}

type ConsentRecord struct {
	gorm.Model
	Slug            uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	RegistrationID  uint      `gorm:"index" json:"registration_id"`
	WaiverVersionID uint      `gorm:"index" json:"waiver_version_id"`
	AcceptedAt      time.Time `json:"accepted_at"`
	IP              string    `json:"ip"`
	UserAgent       string    `json:"user_agent"`
}

// Bibs + check-in

type BibAssignment struct {
	gorm.Model
	Slug           uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	EventID        uint       `gorm:"index;uniqueIndex:idx_bib_event_number,priority:1" json:"event_id"`
	RegistrationID uint       `gorm:"uniqueIndex" json:"registration_id"`
	BibNumber      int        `gorm:"uniqueIndex:idx_bib_event_number,priority:2" json:"bib_number"`
	AssignedAt     time.Time  `json:"assigned_at"`
	AssignedBy     *uint      `json:"assigned_by,omitempty"`
	LockedAt       *time.Time `json:"locked_at,omitempty"`
	LockReason     string     `json:"lock_reason"`
}

type Checkin struct {
	gorm.Model
	Slug            uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	EventID         uint       `gorm:"index" json:"event_id"`
	RegistrationID  uint       `gorm:"uniqueIndex" json:"registration_id"`
	CheckedInAt     *time.Time `json:"checked_in_at,omitempty"`
	BibCollectedAt  *time.Time `json:"bib_collected_at,omitempty"`
	PackCollectedAt *time.Time `json:"pack_collected_at,omitempty"`
	CheckedByUserID *uint      `json:"checked_by_user_id,omitempty"`
}

// Payments + receipts

type Payment struct {
	gorm.Model
	Slug           uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	RegistrationID *uint          `gorm:"index" json:"registration_id,omitempty"`
	OrderID        *uint          `gorm:"index" json:"order_id,omitempty"`
	Provider       string         `json:"provider"`
	Currency       string         `json:"currency"`
	AmountMinor    int            `json:"amount_minor"`
	Status         string         `json:"status"`
	ProviderRef    string         `gorm:"index" json:"provider_ref"`
	IdempotencyKey *string        `gorm:"uniqueIndex" json:"idempotency_key,omitempty"`
	Metadata       datatypes.JSON `gorm:"type:jsonb" json:"metadata"`
}

type PaymentEvent struct {
	gorm.Model
	Slug            uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	PaymentID       uint           `gorm:"index" json:"payment_id"`
	ProviderEventID string         `gorm:"uniqueIndex" json:"provider_event_id"`
	Type            string         `json:"type"`
	Payload         datatypes.JSON `gorm:"type:jsonb" json:"payload"`
	ReceivedAt      time.Time      `json:"received_at"`
}

type Receipt struct {
	gorm.Model
	Slug             uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	PaymentID        uint       `gorm:"uniqueIndex" json:"payment_id"`
	ReceiptNumber    string     `gorm:"uniqueIndex" json:"receipt_number"`
	IssuedAt         time.Time  `json:"issued_at"`
	EmailTo          string     `json:"email_to"`
	DeliveredEmailAt *time.Time `json:"delivered_email_at,omitempty"`
	PDFMediaID       *uint      `json:"pdf_media_id,omitempty"`
}

// Results

type ResultImport struct {
	gorm.Model
	Slug        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	EventID     uint           `gorm:"index" json:"event_id"`
	FileMediaID uint           `json:"file_media_id"`
	ImportedBy  uint           `json:"imported_by"`
	ImportedAt  time.Time      `json:"imported_at"`
	Status      string         `json:"status"`
	Summary     datatypes.JSON `gorm:"type:jsonb" json:"summary"`
}

type Result struct {
	gorm.Model
	Slug             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	EventID          uint      `gorm:"index:idx_results_event_bib,priority:1;index:idx_results_event_name,priority:1;index:idx_results_event_finish,priority:1" json:"event_id"`
	RegistrationID   *uint     `json:"registration_id,omitempty"`
	BibNumber        int       `gorm:"index:idx_results_event_bib,priority:2" json:"bib_number"`
	Name             string    `gorm:"index:idx_results_event_name,priority:2" json:"name"`
	CategoryName     string    `json:"category_name"`
	Gender           string    `json:"gender"`
	Age              *int      `json:"age,omitempty"`
	AgeGroup         string    `json:"age_group"`
	FinishSeconds    int       `gorm:"index:idx_results_event_finish,priority:2" json:"finish_seconds"`
	PositionOverall  *int      `json:"position_overall,omitempty"`
	PositionCategory *int      `json:"position_category,omitempty"`
}

// Finance + reconciliation

type BankImport struct {
	gorm.Model
	Slug        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	ImportedBy  uint           `json:"imported_by"`
	FileMediaID uint           `json:"file_media_id"`
	Mapping     datatypes.JSON `gorm:"type:jsonb" json:"mapping"`
	ImportedAt  time.Time      `json:"imported_at"`
}

type ReconciliationMatch struct {
	gorm.Model
	Slug         uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	BankImportID uint           `gorm:"index" json:"bank_import_id"`
	BankRowHash  string         `json:"bank_row_hash"`
	PaymentID    *uint          `json:"payment_id,omitempty"`
	Status       string         `json:"status"`
	Notes        string         `json:"notes"`
	RowData      datatypes.JSON `gorm:"type:jsonb" json:"row_data"`
	ResolvedBy   *uint          `json:"resolved_by,omitempty"`
	ResolvedAt   *time.Time     `json:"resolved_at,omitempty"`
}

// Sponsors / partners

type SponsorTier struct {
	gorm.Model
	Slug     uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Name     string    `gorm:"uniqueIndex" json:"name"`
	Priority int       `json:"priority"`
}

type Sponsor struct {
	gorm.Model
	Slug         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	TierID       uint      `json:"tier_id"`
	Name         string    `json:"name"`
	URLSlug      string    `gorm:"uniqueIndex" json:"url_slug"`
	LogoMediaID  *uint     `json:"logo_media_id,omitempty"`
	Description  string    `json:"description"`
	WebsiteURL   string    `json:"website_url"`
	IsFeatured   bool      `json:"is_featured"`
	DisplayOrder int       `json:"display_order"`
}

type SponsorPlacement struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	SponsorID   uint      `json:"sponsor_id"`
	EventID     *uint     `json:"event_id,omitempty"`
	LocationKey string    `json:"location_key"`
}

type SponsorView struct {
	gorm.Model
	Slug      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	SponsorID uint      `json:"sponsor_id"`
	PageKey   string    `json:"page_key"`
	ViewedAt  time.Time `json:"viewed_at"`
	IPHash    string    `json:"ip_hash"`
}

// Volunteers

type Volunteer struct {
	gorm.Model
	Slug        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Name        string         `json:"name"`
	Email       string         `json:"email"`
	Phone       string         `json:"phone"`
	Preferences datatypes.JSON `gorm:"type:jsonb" json:"preferences"`
	Notes       string         `json:"notes"`
}

type VolunteerAssignment struct {
	gorm.Model
	Slug        uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	VolunteerID uint       `gorm:"index" json:"volunteer_id"`
	EventID     *uint      `json:"event_id,omitempty"`
	RoleName    string     `json:"role_name"`
	ShiftStart  *time.Time `json:"shift_start,omitempty"`
	ShiftEnd    *time.Time `json:"shift_end,omitempty"`
	Location    string     `json:"location"`
	Status      string     `json:"status"`
}

type VolunteerAttendance struct {
	gorm.Model
	Slug         uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	AssignmentID uint       `gorm:"index" json:"assignment_id"`
	CheckInAt    *time.Time `json:"check_in_at,omitempty"`
	CheckOutAt   *time.Time `json:"check_out_at,omitempty"`
}

// Fundraising shop

type Product struct {
	gorm.Model
	Slug                uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Type                string    `json:"type"`
	Name                string    `json:"name"`
	URLSlug             string    `gorm:"uniqueIndex" json:"url_slug"`
	Description         string    `json:"description"`
	PrimaryImageMediaID *uint     `json:"primary_image_media_id,omitempty"`
	PriceKESMinor       *int      `json:"price_kes_minor,omitempty"`
	PriceUSDMinor       *int      `json:"price_usd_minor,omitempty"`
	PriceEURMinor       *int      `json:"price_eur_minor,omitempty"`
	AllowCustomAmount   bool      `json:"allow_custom_amount"`
	StockQty            *int      `json:"stock_qty,omitempty"`
	Active              bool      `json:"active"`
}

type Order struct {
	gorm.Model
	Slug       uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	BuyerName  string    `json:"buyer_name"`
	Email      string    `json:"email"`
	Phone      string    `json:"phone"`
	Currency   string    `json:"currency"`
	TotalMinor int       `json:"total_minor"`
	Status     string    `json:"status"`
}

type OrderItem struct {
	gorm.Model
	Slug           uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	OrderID        uint           `gorm:"index" json:"order_id"`
	ProductID      uint           `gorm:"index" json:"product_id"`
	Qty            int            `json:"qty"`
	UnitPriceMinor int            `json:"unit_price_minor"`
	LineTotalMinor int            `json:"line_total_minor"`
	Meta           datatypes.JSON `gorm:"type:jsonb" json:"meta"`
}

// Audit logs

type AuditLog struct {
	gorm.Model
	Slug        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	ActorUserID uint           `gorm:"index" json:"actor_user_id"`
	ActionKey   string         `json:"action_key"`
	EntityType  string         `json:"entity_type"`
	EntityID    string         `json:"entity_id"`
	OldJSON     datatypes.JSON `gorm:"type:jsonb" json:"old_json"`
	NewJSON     datatypes.JSON `gorm:"type:jsonb" json:"new_json"`
	IP          string         `json:"ip"`
	UserAgent   string         `json:"user_agent"`
}

// Jobs

type Job struct {
	gorm.Model
	Slug      uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"slug"`
	Type      string         `gorm:"index" json:"type"`
	Status    string         `gorm:"index" json:"status"`
	Payload   datatypes.JSON `gorm:"type:jsonb" json:"payload"`
	Attempts  int            `json:"attempts"`
	LastError string         `json:"last_error"`
	RunAt     time.Time      `gorm:"index" json:"run_at"`
	LockedAt  *time.Time     `json:"locked_at,omitempty"`
}

// ---- UUID Slug hooks (dedicated per model) ----

func (m *User) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Role) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Permission) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *UserRole) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *RolePermission) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *RefreshToken) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Page) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Post) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *HeroStyle) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Category) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Tag) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *PostCategory) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *PostTag) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Media) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *GalleryAlbum) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *AlbumMedia) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *WaiverVersion) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Event) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *EventCategory) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *EventFormField) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Registration) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *ConsentRecord) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *BibAssignment) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Checkin) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Payment) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *PaymentEvent) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Receipt) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *ResultImport) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Result) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *BankImport) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *ReconciliationMatch) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *SponsorTier) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Sponsor) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *SponsorPlacement) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *SponsorView) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Volunteer) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *VolunteerAssignment) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *VolunteerAttendance) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Product) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Order) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *OrderItem) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *AuditLog) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}

func (m *Job) BeforeCreate(tx *gorm.DB) (err error) {
	if m.Slug == uuid.Nil {
		m.Slug = uuid.New()
	}
	return nil
}
