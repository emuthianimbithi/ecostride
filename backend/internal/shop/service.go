package shop

import (
	"context"
	"ecostride/backend/internal/jobs"
	"errors"
	"sort"
	"time"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Service handles shop operations.
type Service struct {
	DB *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{DB: db}
}

func (s *Service) ListProducts(ctx context.Context, activeOnly bool) ([]models.Product, error) {
	query := s.DB.WithContext(ctx).Order("created_at desc")
	if activeOnly {
		query = query.Where("active = true")
	}

	var products []models.Product
	if err := query.Find(&products).Error; err != nil {
		return nil, err
	}
	return products, nil
}

func (s *Service) CreateProduct(ctx context.Context, product models.Product) (models.Product, error) {
	if err := s.DB.WithContext(ctx).Create(&product).Error; err != nil {
		return models.Product{}, err
	}
	return product, nil
}

func (s *Service) UpdateProduct(ctx context.Context, product models.Product) (models.Product, error) {
	if err := s.DB.WithContext(ctx).Save(&product).Error; err != nil {
		return models.Product{}, err
	}
	return product, nil
}

func (s *Service) DeleteProduct(ctx context.Context, product models.Product) error {
	return s.DB.WithContext(ctx).Delete(&product).Error
}

var ErrOrderConflict = errors.New("checkout key already used for different order details")
var ErrStockUnavailable = errors.New("item unavailable or insufficient stock; refresh the shop")
var ErrPriceChanged = errors.New("product price changed; refresh the shop")

func (s *Service) CreateOrder(ctx context.Context, order models.Order, items []models.OrderItem) (models.Order, error) {
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if order.CheckoutKey != nil {
			if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?, 1))", *order.CheckoutKey).Error; err != nil {
				return err
			}
			var existing models.Order
			err := tx.Where("checkout_key = ?", *order.CheckoutKey).First(&existing).Error
			if err == nil {
				if existing.RequestFingerprint != order.RequestFingerprint {
					return ErrOrderConflict
				}
				order = existing
				return nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
		sort.Slice(items, func(i, j int) bool { return items[i].ProductID < items[j].ProductID })
		for i := range items {
			item := items[i]
			var product models.Product
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&product, item.ProductID).Error; err != nil {
				return err
			}
			items[i].ProductName = product.Name
			items[i].ProductType = product.Type
			if !product.Active || item.Qty <= 0 || item.UnitPriceMinor <= 0 {
				return ErrStockUnavailable
			}
			if !product.AllowCustomAmount {
				price, ok := priceForCurrency(product, order.Currency)
				if !ok || price != item.UnitPriceMinor {
					return ErrPriceChanged
				}
			}
			if product.StockQty != nil {
				if *product.StockQty < item.Qty {
					return ErrStockUnavailable
				}
				if err := tx.Model(&product).Update("stock_qty", *product.StockQty-item.Qty).Error; err != nil {
					return err
				}
			}
		}
		expires := time.Now().Add(30 * time.Minute)
		order.ReservationExpiresAt = &expires
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		for i := range items {
			items[i].OrderID = order.ID
		}
		if err := tx.Create(&items).Error; err != nil {
			return err
		}
		_, err := jobs.NewService(tx).Enqueue(ctx, "order.expire", map[string]interface{}{"order_id": order.ID}, expires)
		return err
	})
	return order, err
}

// Expiration and payment settlement serialize on the order row. Late money is
// handled by payment verification as an ineligible-order review case.
func (s *Service) ExpireOrder(ctx context.Context, id uint) error {
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var order models.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, id).Error; err != nil {
			return err
		}
		if order.Status != "pending" || order.ReservationExpiresAt == nil || time.Now().Before(*order.ReservationExpiresAt) {
			return nil
		}
		var items []models.OrderItem
		if err := tx.Where("order_id = ?", id).Order("product_id").Find(&items).Error; err != nil {
			return err
		}
		for _, item := range items {
			if err := tx.Model(&models.Product{}).Where("id = ? AND stock_qty IS NOT NULL", item.ProductID).Update("stock_qty", gorm.Expr("stock_qty + ?", item.Qty)).Error; err != nil {
				return err
			}
		}
		return tx.Model(&order).Update("status", "cancelled").Error
	})
}

func (s *Service) ListOrders(ctx context.Context) ([]models.Order, error) {
	var orders []models.Order
	if err := s.DB.WithContext(ctx).Order("created_at desc").Find(&orders).Error; err != nil {
		return nil, err
	}
	return orders, nil
}
