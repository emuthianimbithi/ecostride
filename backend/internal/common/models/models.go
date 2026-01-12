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
	Slug         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Name         string
	Email        string `gorm:"uniqueIndex"`
	Phone        string
	PasswordHash string
	IsActive     bool
	Roles        []Role `gorm:"many2many:user_roles"`
}

type Role struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Name        string    `gorm:"uniqueIndex"`
	Description string
	Permissions []Permission `gorm:"many2many:role_permissions"`
}

type Permission struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Key         string    `gorm:"uniqueIndex"`
	Description string
}

type UserRole struct {
	gorm.Model
	Slug   uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserID uint      `gorm:"uniqueIndex:idx_user_roles"`
	RoleID uint      `gorm:"uniqueIndex:idx_user_roles"`
}

type RolePermission struct {
	gorm.Model
	Slug         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	RoleID       uint      `gorm:"uniqueIndex:idx_role_permissions"`
	PermissionID uint      `gorm:"uniqueIndex:idx_role_permissions"`
}

type RefreshToken struct {
	gorm.Model
	Slug      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserID    uint      `gorm:"index"`
	TokenHash string    `gorm:"uniqueIndex"`
	ExpiresAt time.Time
	RevokedAt *time.Time
}

// CMS

type Page struct {
	gorm.Model
	Slug           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	URLSlug        string    `gorm:"uniqueIndex"`
	Title          string
	Status         string
	Blocks         datatypes.JSON `gorm:"type:jsonb"`
	SEOTitle       string
	SEODesc        string
	OgImageMediaID *uint
	PublishedAt    *time.Time
}

type Post struct {
	gorm.Model
	Slug                 uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	URLSlug              string    `gorm:"uniqueIndex"`
	Title                string
	Content              datatypes.JSON `gorm:"type:jsonb"`
	Excerpt              string
	FeaturedImageMediaID *uint
	HeroStyleID          *uint
	HeroShowTitle        bool `gorm:"default:true"`
	Status               string
	PublishedAt          *time.Time
	AuthorUserID         uint
}

type HeroStyle struct {
	gorm.Model
	Slug           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Name           string    `gorm:"uniqueIndex"`
	Key            string    `gorm:"uniqueIndex"`
	Description    string
	LayoutType     string
	AspectRatio    string
	Overlay        datatypes.JSON `gorm:"type:jsonb"`
	FocalPoint     datatypes.JSON `gorm:"type:jsonb"`
	TextPlacement  string
	PaddingVariant string
	IsActive       bool `gorm:"default:true"`
}

type Setting struct {
	gorm.Model
	Key   string         `gorm:"uniqueIndex"`
	Value datatypes.JSON `gorm:"type:jsonb"`
}

type Category struct {
	gorm.Model
	Slug    uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Name    string    `gorm:"uniqueIndex"`
	URLSlug string    `gorm:"uniqueIndex"`
}

type Tag struct {
	gorm.Model
	Slug    uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Name    string    `gorm:"uniqueIndex"`
	URLSlug string    `gorm:"uniqueIndex"`
}

type PostCategory struct {
	gorm.Model
	Slug       uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	PostID     uint      `gorm:"uniqueIndex:idx_post_categories"`
	CategoryID uint      `gorm:"uniqueIndex:idx_post_categories"`
}

type PostTag struct {
	gorm.Model
	Slug   uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	PostID uint      `gorm:"uniqueIndex:idx_post_tags"`
	TagID  uint      `gorm:"uniqueIndex:idx_post_tags"`
}

type Media struct {
	gorm.Model
	Slug      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Type      string
	Path      string
	URL       string
	Mime      string
	Size      int64
	AltText   string
	CreatedBy uint
}

type GalleryAlbum struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Title       string
	URLSlug     string `gorm:"uniqueIndex"`
	Description string
}

type AlbumMedia struct {
	gorm.Model
	Slug      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	AlbumID   uint      `gorm:"uniqueIndex:idx_album_media"`
	MediaID   uint      `gorm:"uniqueIndex:idx_album_media"`
	SortOrder int
}

type WaiverVersion struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Scope       string
	EventID     *uint
	Version     int
	Title       string
	Content     string `gorm:"type:text"`
	ContentHash string
	EffectiveAt time.Time
	IsCurrent   bool
}

// Events

type Event struct {
	gorm.Model
	Slug             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	URLSlug          string    `gorm:"uniqueIndex"`
	Type             string
	Title            string
	Description      string `gorm:"type:text"`
	Location         string
	MapURL           string
	StartAt          time.Time
	RegOpenAt        *time.Time
	RegCloseAt       *time.Time
	Status           string
	ResultsPublished bool `gorm:"default:false"`
	HeroMediaID      *uint
	SEOTitle         string
	SEODesc          string
	CreatedBy        uint
}

type EventCategory struct {
	gorm.Model
	Slug          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	EventID       uint      `gorm:"index"`
	Name          string
	PriceKESMinor int
	PriceUSDMinor *int
	PriceEURMinor *int
	Capacity      *int
	Rules         datatypes.JSON `gorm:"type:jsonb"`
	BibPrefix     string
	BibRangeStart *int
	BibRangeEnd   *int
	BibNext       *int
}

type EventFormField struct {
	gorm.Model
	Slug     uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	EventID  uint      `gorm:"index"`
	Key      string
	Label    string
	Type     string
	Required bool
	Options  datatypes.JSON `gorm:"type:jsonb"`
	Order    int
}

// Registrations + consent

type Registration struct {
	gorm.Model
	Slug               uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	EventID            uint
	CategoryID         *uint
	AthleteName        string
	Email              string
	Phone              string
	Dob                *time.Time
	Gender             string
	Nationality        string
	Residence          string
	TshirtSize         string
	EmergencyName      string
	EmergencyPhone     string
	MedicalDeclaration string
	Experience         string
	Extras             datatypes.JSON `gorm:"type:jsonb"`
	Status             string
}

type ConsentRecord struct {
	gorm.Model
	Slug            uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	RegistrationID  uint      `gorm:"index"`
	WaiverVersionID uint      `gorm:"index"`
	AcceptedAt      time.Time
	IP              string
	UserAgent       string
}

// Bibs + check-in

type BibAssignment struct {
	gorm.Model
	Slug           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	EventID        uint      `gorm:"index;uniqueIndex:idx_bib_event_number,priority:1"`
	RegistrationID uint      `gorm:"uniqueIndex"`
	BibNumber      int       `gorm:"uniqueIndex:idx_bib_event_number,priority:2"`
	AssignedAt     time.Time
	AssignedBy     *uint
	LockedAt       *time.Time
	LockReason     string
}

type Checkin struct {
	gorm.Model
	Slug            uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	EventID         uint      `gorm:"index"`
	RegistrationID  uint      `gorm:"uniqueIndex"`
	CheckedInAt     *time.Time
	BibCollectedAt  *time.Time
	PackCollectedAt *time.Time
	CheckedByUserID *uint
}

// Payments + receipts

type Payment struct {
	gorm.Model
	Slug           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	RegistrationID *uint     `gorm:"index"`
	OrderID        *uint     `gorm:"index"`
	Provider       string
	Currency       string
	AmountMinor    int
	Status         string
	ProviderRef    string         `gorm:"uniqueIndex"`
	IdempotencyKey *string        `gorm:"uniqueIndex"`
	Metadata       datatypes.JSON `gorm:"type:jsonb"`
}

type PaymentEvent struct {
	gorm.Model
	Slug            uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	PaymentID       uint      `gorm:"index"`
	ProviderEventID string    `gorm:"uniqueIndex"`
	Type            string
	Payload         datatypes.JSON `gorm:"type:jsonb"`
	ReceivedAt      time.Time
}

type Receipt struct {
	gorm.Model
	Slug             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	PaymentID        uint      `gorm:"uniqueIndex"`
	ReceiptNumber    string    `gorm:"uniqueIndex"`
	IssuedAt         time.Time
	EmailTo          string
	DeliveredEmailAt *time.Time
	PDFMediaID       *uint
}

// Results

type ResultImport struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	EventID     uint      `gorm:"index"`
	FileMediaID uint
	ImportedBy  uint
	ImportedAt  time.Time
	Status      string
	Summary     datatypes.JSON `gorm:"type:jsonb"`
}

type Result struct {
	gorm.Model
	Slug             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	EventID          uint      `gorm:"index:idx_results_event_bib,priority:1;index:idx_results_event_name,priority:1;index:idx_results_event_finish,priority:1"`
	RegistrationID   *uint
	BibNumber        int    `gorm:"index:idx_results_event_bib,priority:2"`
	Name             string `gorm:"index:idx_results_event_name,priority:2"`
	CategoryName     string
	Gender           string
	Age              *int
	AgeGroup         string
	FinishSeconds    int `gorm:"index:idx_results_event_finish,priority:2"`
	PositionOverall  *int
	PositionCategory *int
}

// Finance + reconciliation

type BankImport struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	ImportedBy  uint
	FileMediaID uint
	Mapping     datatypes.JSON `gorm:"type:jsonb"`
	ImportedAt  time.Time
}

type ReconciliationMatch struct {
	gorm.Model
	Slug         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	BankImportID uint      `gorm:"index"`
	BankRowHash  string
	PaymentID    *uint
	Status       string
	Notes        string
	RowData      datatypes.JSON `gorm:"type:jsonb"`
	ResolvedBy   *uint
	ResolvedAt   *time.Time
}

// Sponsors / partners

type SponsorTier struct {
	gorm.Model
	Slug     uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Name     string    `gorm:"uniqueIndex"`
	Priority int
}

type Sponsor struct {
	gorm.Model
	Slug         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	TierID       uint
	Name         string
	URLSlug      string `gorm:"uniqueIndex"`
	LogoMediaID  *uint
	Description  string
	WebsiteURL   string
	IsFeatured   bool
	DisplayOrder int
}

type SponsorPlacement struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	SponsorID   uint
	EventID     *uint
	LocationKey string
}

type SponsorView struct {
	gorm.Model
	Slug      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	SponsorID uint
	PageKey   string
	ViewedAt  time.Time
	IPHash    string
}

// Volunteers

type Volunteer struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Name        string
	Email       string
	Phone       string
	Preferences datatypes.JSON `gorm:"type:jsonb"`
	Notes       string
}

type VolunteerAssignment struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	VolunteerID uint      `gorm:"index"`
	EventID     *uint
	RoleName    string
	ShiftStart  *time.Time
	ShiftEnd    *time.Time
	Location    string
	Status      string
}

type VolunteerAttendance struct {
	gorm.Model
	Slug         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	AssignmentID uint      `gorm:"index"`
	CheckInAt    *time.Time
	CheckOutAt   *time.Time
}

// Fundraising shop

type Product struct {
	gorm.Model
	Slug                uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Type                string
	Name                string
	URLSlug             string `gorm:"uniqueIndex"`
	Description         string
	PrimaryImageMediaID *uint
	PriceKESMinor       *int
	PriceUSDMinor       *int
	PriceEURMinor       *int
	AllowCustomAmount   bool
	StockQty            *int
	Active              bool
}

type Order struct {
	gorm.Model
	Slug       uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	BuyerName  string
	Email      string
	Phone      string
	Currency   string
	TotalMinor int
	Status     string
}

type OrderItem struct {
	gorm.Model
	Slug           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	OrderID        uint      `gorm:"index"`
	ProductID      uint      `gorm:"index"`
	Qty            int
	UnitPriceMinor int
	LineTotalMinor int
	Meta           datatypes.JSON `gorm:"type:jsonb"`
}

// Audit logs

type AuditLog struct {
	gorm.Model
	Slug        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	ActorUserID uint      `gorm:"index"`
	ActionKey   string
	EntityType  string
	EntityID    string
	OldJSON     datatypes.JSON `gorm:"type:jsonb"`
	NewJSON     datatypes.JSON `gorm:"type:jsonb"`
	IP          string
	UserAgent   string
}

// Jobs

type Job struct {
	gorm.Model
	Slug      uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	Type      string         `gorm:"index"`
	Status    string         `gorm:"index"`
	Payload   datatypes.JSON `gorm:"type:jsonb"`
	Attempts  int
	LastError string
	RunAt     time.Time `gorm:"index"`
	LockedAt  *time.Time
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

// Note: Setting has no Slug in your file, so no hook needed.

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
