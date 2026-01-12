package shop

import (
	"context"

	"ecostride/backend/internal/common/models"

	"gorm.io/gorm"
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

func (s *Service) CreateOrder(ctx context.Context, order models.Order, items []models.OrderItem) (models.Order, error) {
	return order, s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&order).Error; err != nil {
			return err
		}

		for i := range items {
			items[i].OrderID = order.ID
		}

		if err := tx.Create(&items).Error; err != nil {
			return err
		}

		return nil
	})
}

func (s *Service) ListOrders(ctx context.Context) ([]models.Order, error) {
	var orders []models.Order
	if err := s.DB.WithContext(ctx).Order("created_at desc").Find(&orders).Error; err != nil {
		return nil, err
	}
	return orders, nil
}
