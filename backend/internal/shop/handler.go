package shop

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/storage"
	"ecostride/backend/internal/payments"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Handler exposes shop HTTP handlers.
type Handler struct {
	Service  *Service
	Audit    *audit.Service
	DB       *gorm.DB
	Payments *payments.Service
	Config   config.Config
	Storage  storage.StorageProvider
}

func NewHandler(service *Service, auditService *audit.Service, db *gorm.DB, paymentsService *payments.Service, cfg config.Config, storageProvider storage.StorageProvider) *Handler {
	return &Handler{Service: service, Audit: auditService, DB: db, Payments: paymentsService, Config: cfg, Storage: storageProvider}
}

type productRequest struct {
	Type                string `json:"type" binding:"required"`
	Name                string `json:"name" binding:"required"`
	Slug                string `json:"slug" binding:"required"`
	Description         string `json:"description"`
	PrimaryImageMediaID *uint  `json:"primary_image_media_id"`
	PriceKESMinor       *int   `json:"price_kes_minor"`
	PriceUSDMinor       *int   `json:"price_usd_minor"`
	PriceEURMinor       *int   `json:"price_eur_minor"`
	AllowCustomAmount   bool   `json:"allow_custom_amount"`
	StockQty            *int   `json:"stock_qty"`
	Active              bool   `json:"active"`
}

type orderItemRequest struct {
	ProductSlug       string          `json:"product_slug" binding:"required"`
	Qty               int             `json:"qty" binding:"required"`
	CustomAmountMinor *int            `json:"custom_amount_minor"`
	Meta              json.RawMessage `json:"meta"`
}

type orderRequest struct {
	BuyerName string             `json:"buyer_name" binding:"required"`
	Email     string             `json:"email" binding:"required,email"`
	Phone     string             `json:"phone" binding:"omitempty,phone"`
	Currency  string             `json:"currency" binding:"required"`
	Items     []orderItemRequest `json:"items" binding:"required"`
}

type orderPaymentRequest struct {
	SuccessURL string `json:"success_url"`
	CancelURL  string `json:"cancel_url"`
	Phone      string `json:"phone" binding:"omitempty,phone"`
}

func (h *Handler) ListPublicProducts(c *gin.Context) {
	type productItem struct {
		Slug                string  `json:"slug"`
		URLSlug             string  `json:"url_slug"`
		Type                string  `json:"type"`
		Name                string  `json:"name"`
		Description         string  `json:"description"`
		PrimaryImageMediaID *uint   `json:"primary_image_media_id,omitempty"`
		ImageURL            *string `json:"image_url,omitempty"`
		ImageAlt            *string `json:"image_alt,omitempty"`
		PriceKESMinor       *int    `json:"price_kes_minor,omitempty"`
		PriceUSDMinor       *int    `json:"price_usd_minor,omitempty"`
		PriceEURMinor       *int    `json:"price_eur_minor,omitempty"`
		AllowCustomAmount   bool    `json:"allow_custom_amount"`
		StockQty            *int    `json:"stock_qty,omitempty"`
		Active              bool    `json:"active"`
		ImagePath           *string `json:"image_path"`
	}

	var rows []productItem

	if err := h.DB.WithContext(c.Request.Context()).
		Table("products").
		Select(`
			products.slug,
			products.url_slug,
			products.type,
			products.name,
			products.description,
			products.primary_image_media_id,
			products.price_kes_minor,
			products.price_usd_minor,
			products.price_eur_minor,
			products.allow_custom_amount,
			products.stock_qty,
			products.active,
			media.url as image_url,
			media.path as image_path,
			media.alt_text as image_alt
		`).
		Joins("LEFT JOIN media ON media.id = products.primary_image_media_id").
		Where("products.active = true").
		Order("products.created_at desc").
		Scan(&rows).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list products", nil)
		return
	}

	items := make([]productItem, 0, len(rows))
	for _, row := range rows {
		if (row.ImageURL == nil || *row.ImageURL == "") && row.ImagePath != nil && *row.ImagePath != "" {
			key := normalizeLegacyLocalPathToKey(h.Config.MediaDir, *row.ImagePath)
			value := h.Storage.GetPublicURL(c.Request.Context(), key)
			row.ImageURL = &value
		}
		items = append(items, row)
	}

	c.JSON(http.StatusOK, items)
}

func (h *Handler) CreateOrder(c *gin.Context) {
	var req orderRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	currency := strings.ToUpper(req.Currency)
	if currency != "KES" && currency != "USD" && currency != "EUR" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "unsupported currency", nil)
		return
	}

	items := make([]models.OrderItem, 0, len(req.Items))
	var total int

	for _, itemReq := range req.Items {
		productSlug, err := uuid.Parse(itemReq.ProductSlug)
		if err != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid product slug", nil)
			return
		}

		var product models.Product
		if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", productSlug).First(&product).Error; err != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "product not found", nil)
			return
		}

		if !product.Active {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "product not available", nil)
			return
		}

		if itemReq.Qty <= 0 {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid quantity", nil)
			return
		}

		if product.StockQty != nil && *product.StockQty < itemReq.Qty {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "insufficient stock", nil)
			return
		}

		unitPrice, ok := priceForCurrency(product, currency)
		if !ok {
			if product.AllowCustomAmount && itemReq.CustomAmountMinor != nil {
				unitPrice = *itemReq.CustomAmountMinor
			} else {
				apierrors.AbortWithError(c, http.StatusBadRequest, "", "price not available", nil)
				return
			}
		}

		lineTotal := unitPrice * itemReq.Qty
		total += lineTotal

		items = append(items, models.OrderItem{
			Slug:           uuid.New(),
			ProductID:      product.ID,
			Qty:            itemReq.Qty,
			UnitPriceMinor: unitPrice,
			LineTotalMinor: lineTotal,
			Meta:           datatypes.JSON(itemReq.Meta),
		})
	}

	order := models.Order{
		Slug:       uuid.New(),
		BuyerName:  req.BuyerName,
		Email:      req.Email,
		Phone:      req.Phone,
		Currency:   currency,
		TotalMinor: total,
		Status:     "pending",
	}

	created, err := h.Service.CreateOrder(c.Request.Context(), order, items)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create order", nil)
		return
	}

	c.JSON(http.StatusCreated, created)
}

func (h *Handler) PayOrderStripe(c *gin.Context) {
	orderSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid order id", nil)
		return
	}

	ctxData, err := h.Payments.BuildOrderContext(c.Request.Context(), orderSlug)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", err.Error(), nil)
		return
	}

	idempotencyKey := c.GetHeader("X-Idempotency-Key")
	if existing, _ := h.Payments.EnsureIdempotency(c.Request.Context(), idempotencyKey); existing != nil {
		c.JSON(http.StatusOK, gin.H{
			"payment_id":   existing.Slug,
			"status":       existing.Status,
			"checkout_url": extractMetadata(existing.Metadata, "checkout_url"),
		})
		return
	}

	payment, err := h.Payments.CreatePayment(c.Request.Context(), "STRIPE", ctxData, idempotencyKey, nil)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create payment", nil)
		return
	}

	var req orderPaymentRequest
	_ = c.ShouldBindJSON(&req)

	successURL := req.SuccessURL
	cancelURL := req.CancelURL
	if successURL == "" {
		successURL = h.Payments.Config.StripeSuccessURL
	}
	if cancelURL == "" {
		cancelURL = h.Payments.Config.StripeCancelURL
	}
	if successURL == "" || cancelURL == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "success_url and cancel_url required", nil)
		return
	}

	session, err := h.Payments.CreateStripeSession(c.Request.Context(), payment, ctxData, successURL, cancelURL, idempotencyKey)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "stripe checkout failed", nil)
		return
	}

	updated, err := h.Payments.UpdatePayment(c.Request.Context(), payment, session.SessionID, map[string]interface{}{
		"checkout_url": session.CheckoutURL,
		"session_id":   session.SessionID,
	})
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
		return
	}

	c.JSON(http.StatusOK, gin.H{"payment_id": updated.Slug, "status": updated.Status, "checkout_url": session.CheckoutURL})
}

func (h *Handler) PayOrderMpesa(c *gin.Context) {
	orderSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid order id", nil)
		return
	}

	ctxData, err := h.Payments.BuildOrderContext(c.Request.Context(), orderSlug)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", err.Error(), nil)
		return
	}

	if ctxData.Currency != "KES" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "mpesa supports KES only", nil)
		return
	}

	idempotencyKey := c.GetHeader("X-Idempotency-Key")
	if existing, _ := h.Payments.EnsureIdempotency(c.Request.Context(), idempotencyKey); existing != nil {
		c.JSON(http.StatusOK, gin.H{"payment_id": existing.Slug, "status": existing.Status})
		return
	}

	var req orderPaymentRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	phone := normalizePhone(req.Phone)
	if phone == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid phone", nil)
		return
	}

	payment, err := h.Payments.CreatePayment(c.Request.Context(), "MPESA", ctxData, idempotencyKey, map[string]interface{}{"phone": phone})
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create payment", nil)
		return
	}

	response, err := h.Payments.InitiateMpesaSTK(c.Request.Context(), payment, phone)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", err.Error(), nil)
		return
	}

	updated, err := h.Payments.UpdatePayment(c.Request.Context(), payment, response.CheckoutRequestID, map[string]interface{}{
		"merchant_request_id": response.MerchantRequestID,
		"customer_message":    response.CustomerMessage,
	})
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update payment", nil)
		return
	}

	c.JSON(http.StatusOK, gin.H{"payment_id": updated.Slug, "status": updated.Status, "checkout_request_id": response.CheckoutRequestID})
}

func (h *Handler) ListProducts(c *gin.Context) {
	type productItem struct {
		Slug                string    `json:"slug"`
		URLSlug             string    `json:"url_slug"`
		Type                string    `json:"type"`
		Name                string    `json:"name"`
		Description         string    `json:"description"`
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

	type dbRow struct {
		Slug                string
		URLSlug             string
		Type                string
		Name                string
		Description         string
		PrimaryImageMediaID *uint
		ImageURL            *string
		ImageAlt            *string
		PriceKESMinor       *int
		PriceUSDMinor       *int
		PriceEURMinor       *int
		AllowCustomAmount   bool
		StockQty            *int
		Active              bool
		CreatedAt           time.Time
		ImagePath           *string
	}

	var rows []dbRow

	err := h.DB.WithContext(c.Request.Context()).
		Table("products").
		Select(`
			products.slug,
			products.url_slug,
			products.type,
			products.name,
			products.description,
			products.primary_image_media_id,
			products.price_kes_minor,
			products.price_usd_minor,
			products.price_eur_minor,
			products.allow_custom_amount,
			products.stock_qty,
			products.active,
			products.created_at,
			media.url as image_url,
			media.path as image_path,
			media.alt_text as image_alt
		`).
		Joins("LEFT JOIN media ON media.id = products.primary_image_media_id").
		Order("products.created_at DESC").
		Scan(&rows).Error

	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list products", nil)
		return
	}

	items := make([]productItem, 0, len(rows))
	for _, row := range rows {
		item := productItem{
			Slug:                row.Slug,
			URLSlug:             row.URLSlug,
			Type:                row.Type,
			Name:                row.Name,
			Description:         row.Description,
			PrimaryImageMediaID: row.PrimaryImageMediaID,
			ImageURL:            row.ImageURL,
			ImageAlt:            row.ImageAlt,
			PriceKESMinor:       row.PriceKESMinor,
			PriceUSDMinor:       row.PriceUSDMinor,
			PriceEURMinor:       row.PriceEURMinor,
			AllowCustomAmount:   row.AllowCustomAmount,
			StockQty:            row.StockQty,
			Active:              row.Active,
			CreatedAt:           row.CreatedAt,
		}

		// Resolve legacy local paths to public URLs
		if (item.ImageURL == nil || *item.ImageURL == "") &&
			row.ImagePath != nil && *row.ImagePath != "" {
			key := normalizeLegacyLocalPathToKey(h.Config.MediaDir, *row.ImagePath)
			url := h.Storage.GetPublicURL(c.Request.Context(), key)
			item.ImageURL = &url
		}

		items = append(items, item)
	}

	c.JSON(http.StatusOK, items)
}

func (h *Handler) CreateProduct(c *gin.Context) {
	var req productRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	product := models.Product{
		Slug:                uuid.New(),
		Type:                req.Type,
		Name:                req.Name,
		URLSlug:             req.Slug,
		Description:         req.Description,
		PrimaryImageMediaID: req.PrimaryImageMediaID,
		PriceKESMinor:       req.PriceKESMinor,
		PriceUSDMinor:       req.PriceUSDMinor,
		PriceEURMinor:       req.PriceEURMinor,
		AllowCustomAmount:   req.AllowCustomAmount,
		StockQty:            req.StockQty,
		Active:              req.Active,
	}

	created, err := h.Service.CreateProduct(c.Request.Context(), product)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to create product", nil)
		return
	}

	h.logAudit(c, "shop.product.create", "product", created.Slug.String(), nil, created)

	c.JSON(http.StatusCreated, created)
}

func (h *Handler) UpdateProduct(c *gin.Context) {
	productSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid product id", nil)
		return
	}

	var product models.Product
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", productSlug).First(&product).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "product not found", nil)
		return
	}

	old := product

	var req productRequest
	if !apierrors.BindJSON(c, &req) {
		return
	}

	product.Type = req.Type
	product.Name = req.Name
	product.URLSlug = req.Slug
	product.Description = req.Description
	product.PrimaryImageMediaID = req.PrimaryImageMediaID
	product.PriceKESMinor = req.PriceKESMinor
	product.PriceUSDMinor = req.PriceUSDMinor
	product.PriceEURMinor = req.PriceEURMinor
	product.AllowCustomAmount = req.AllowCustomAmount
	product.StockQty = req.StockQty
	product.Active = req.Active

	updated, err := h.Service.UpdateProduct(c.Request.Context(), product)
	if err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to update product", nil)
		return
	}

	h.logAudit(c, "shop.product.update", "product", updated.Slug.String(), old, updated)

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) DeleteProduct(c *gin.Context) {
	productSlug, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid product id", nil)
		return
	}

	var product models.Product
	if err := h.DB.WithContext(c.Request.Context()).Where("slug = ?", productSlug).First(&product).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusNotFound, "", "product not found", nil)
		return
	}

	if err := h.Service.DeleteProduct(c.Request.Context(), product); err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to delete product", nil)
		return
	}

	h.logAudit(c, "shop.product.delete", "product", product.Slug.String(), product, nil)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) ListOrders(c *gin.Context) {
	type orderItem struct {
		ProductName   string `json:"product_name"`
		Qty           int    `json:"qty"`
		UnitPrice     int    `json:"unit_price_minor"`
		LineTotal     int    `json:"line_total_minor"`
		CustomDetails string `json:"custom_details"`
	}

	type orderRow struct {
		Slug          string      `json:"slug"`
		BuyerName     string      `json:"buyer_name"`
		Email         string      `json:"email"`
		Phone         string      `json:"phone"`
		Currency      string      `json:"currency"`
		TotalMinor    int         `json:"total_minor"`
		Status        string      `json:"status"`
		CreatedAt     time.Time   `json:"created_at"`
		PaymentSlug   *string     `json:"payment_slug"`
		PaymentStatus *string     `json:"payment_status"`
		PaymentMethod *string     `json:"payment_method"`
		Items         []orderItem `json:"items"`
	}

	var orders []models.Order
	if err := h.DB.WithContext(c.Request.Context()).Order("created_at desc").Find(&orders).Error; err != nil {
		apierrors.AbortWithError(c, http.StatusInternalServerError, "", "failed to list orders", nil)
		return
	}
	if len(orders) == 0 {
		c.JSON(http.StatusOK, []orderRow{})
		return
	}

	orderIDs := make([]uint, 0, len(orders))
	rows := make([]orderRow, 0, len(orders))
	index := map[uint]int{}
	for i, order := range orders {
		orderIDs = append(orderIDs, order.ID)
		index[order.ID] = i
		rows = append(rows, orderRow{
			Slug:       order.Slug.String(),
			BuyerName:  order.BuyerName,
			Email:      order.Email,
			Phone:      order.Phone,
			Currency:   order.Currency,
			TotalMinor: order.TotalMinor,
			Status:     order.Status,
			CreatedAt:  order.CreatedAt,
			Items:      []orderItem{},
		})
	}

	// Fetch order items
	type itemScanRow struct {
		OrderID     uint
		ProductName string
		Qty         int
		UnitPrice   int
		LineTotal   int
		Meta        datatypes.JSON
	}
	var itemRows []itemScanRow
	if err := h.DB.WithContext(c.Request.Context()).
		Table("order_items").
		Select(`
			order_items.order_id,
			products.name as product_name,
			order_items.qty,
			order_items.unit_price_minor as unit_price,
			order_items.line_total_minor as line_total,
			order_items.meta
		`).
		Joins("LEFT JOIN products ON products.id = order_items.product_id").
		Where("order_items.order_id IN ?", orderIDs).
		Scan(&itemRows).Error; err == nil {
		for _, item := range itemRows {
			pos, ok := index[item.OrderID]
			if !ok {
				continue
			}
			rows[pos].Items = append(rows[pos].Items, orderItem{
				ProductName:   item.ProductName,
				Qty:           item.Qty,
				UnitPrice:     item.UnitPrice,
				LineTotal:     item.LineTotal,
				CustomDetails: string(item.Meta),
			})
		}
	}

	// Fetch latest payment for each order
	type paymentScanRow struct {
		OrderID  uint
		Slug     uuid.UUID
		Status   string
		Provider string
	}
	var paymentRows []paymentScanRow
	paymentsSub := h.DB.WithContext(c.Request.Context()).
		Table("payments").
		Select("DISTINCT ON (order_id) order_id, slug, status, provider").
		Where("order_id IS NOT NULL").
		Order("order_id, created_at desc")
	if err := h.DB.WithContext(c.Request.Context()).
		Table("(?) as payments", paymentsSub).
		Where("order_id IN ?", orderIDs).
		Scan(&paymentRows).Error; err == nil {
		for _, payment := range paymentRows {
			pos, ok := index[payment.OrderID]
			if !ok {
				continue
			}
			slug := payment.Slug.String()
			rows[pos].PaymentSlug = &slug
			canonical := payments.CanonicalizePaymentStatus(payment.Status)
			rows[pos].PaymentStatus = &canonical
			rows[pos].PaymentMethod = &payment.Provider
		}
	}

	c.JSON(http.StatusOK, rows)
}

func priceForCurrency(product models.Product, currency string) (int, bool) {
	switch currency {
	case "KES":
		if product.PriceKESMinor != nil {
			return *product.PriceKESMinor, true
		}
	case "USD":
		if product.PriceUSDMinor != nil {
			return *product.PriceUSDMinor, true
		}
	case "EUR":
		if product.PriceEURMinor != nil {
			return *product.PriceEURMinor, true
		}
	}
	return 0, false
}

func normalizeLegacyLocalPathToKey(mediaDir, pathOrKey string) string {
	pathOrKey = strings.TrimSpace(pathOrKey)
	if pathOrKey == "" || strings.TrimSpace(mediaDir) == "" {
		return pathOrKey
	}

	if rel, err := filepath.Rel(mediaDir, pathOrKey); err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return filepath.ToSlash(rel)
	}

	return filepath.ToSlash(pathOrKey)
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

func normalizePhone(phone string) string {
	value := strings.ReplaceAll(strings.TrimSpace(phone), " ", "")
	if value == "" {
		return ""
	}
	if strings.HasPrefix(value, "+") {
		value = strings.TrimPrefix(value, "+")
	}
	if strings.HasPrefix(value, "0") {
		value = "254" + strings.TrimPrefix(value, "0")
	}
	return value
}

func extractMetadata(metadataJSON []byte, key string) string {
	if len(metadataJSON) == 0 {
		return ""
	}

	var data map[string]interface{}
	if err := json.Unmarshal(metadataJSON, &data); err != nil {
		return ""
	}

	if value, ok := data[key]; ok {
		if str, ok := value.(string); ok {
			return str
		}
	}

	return ""
}
