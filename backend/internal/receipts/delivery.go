package receipts

import (
	"context"
	"ecostride/backend/internal/common/email"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/tickets"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func (s *Service) buildEmail(ctx context.Context, receipt models.Receipt, payment models.Payment) (email.Message, error) {
	base := strings.TrimRight(s.Config.BaseURL, "/")
	receiptURL := base + "/api/v1/public/payments/" + payment.Slug.String() + "/receipt.pdf"
	data := email.TransactionalData{Eyebrow: "PAYMENT RECEIPT", Title: "Thank you for your support.", Name: "there", Intro: "Your payment has been received. Your receipt is attached and available to download below.", Amount: formatMoney(payment.Currency, payment.AmountMinor), ReferenceLabel: "Payment reference", Reference: payment.Slug.String(), Primary: email.Action{Label: "Download receipt", URL: receiptURL}, ContactURL: base + "/contact", Footer: "Keep your receipt and reference for your records.", Details: []email.Detail{{Label: "Receipt", Value: receipt.ReceiptNumber}, {Label: "Payment method", Value: strings.ToUpper(payment.Provider)}}}
	message := email.Message{Subject: "EcoStride receipt " + receipt.ReceiptNumber, Attachments: []email.Attachment{{Filename: "receipt-" + receipt.ReceiptNumber + ".pdf", ContentType: "application/pdf", Content: s.BuildReceiptPDF(ctx, receipt, payment)}}}
	if payment.RegistrationID != nil {
		ticket, err := tickets.Load(ctx, s.DB, *payment.RegistrationID)
		if err != nil {
			return message, err
		}
		reg, event := ticket.Registration, ticket.Event
		data.Name = reg.AthleteName
		data.ReferenceLabel = "Registration reference"
		data.Reference = reg.Slug.String()
		data.Details = append(data.Details, email.Detail{Label: "Event", Value: event.Title}, email.Detail{Label: "Race day", Value: tickets.RaceDate(event.StartAt)}, email.Detail{Label: "Location", Value: event.Location})
		if ticket.Category != nil {
			data.Details = append(data.Details, email.Detail{Label: "Category", Value: ticket.Category.Name})
		}
		var metadata map[string]interface{}
		_ = json.Unmarshal(payment.Metadata, &metadata)
		if ticket.Eligible && payment.Status == "success" && metadata["category_superseded"] != true {
			message.Subject = "Your " + event.Title + " ticket & receipt"
			data.Eyebrow = "RACE ENTRY CONFIRMED"
			data.Title = event.Title
			data.Intro = "You're on the start line. Your entry is confirmed, and your race ticket and payment receipt are attached. We look forward to seeing you on race day."
			data.Primary = email.Action{Label: "Download your race ticket", URL: base + "/api/v1/public/registrations/" + reg.Slug.String() + "/confirmation.pdf"}
			data.Secondary = []email.Action{{Label: "Download payment receipt", URL: receiptURL}}
			data.Footer = "Bring your ticket or registration reference for race-day lookup. Bib and race-pack collection are recorded separately."
			message.Attachments = append(message.Attachments, email.Attachment{Filename: "race-ticket.pdf", ContentType: "application/pdf", Content: tickets.PDF(ticket)})
			if calendar := tickets.Calendar(ticket, base); len(calendar) > 0 {
				message.Attachments = append(message.Attachments, email.Attachment{Filename: "race-day.ics", ContentType: "text/calendar", Content: calendar})
				data.Secondary = append(data.Secondary, email.Action{Label: "Add race day to your calendar", URL: base + "/api/v1/public/registrations/" + reg.Slug.String() + "/calendar.ics"})
				data.Footer += " The calendar file includes a one-day reminder; your calendar app controls whether it is enabled."
			}
		} else {
			data.Intro = "Your payment receipt is attached. This email does not confirm an active race entry. Please contact the team if you need help with your registration."
		}
	}
	if payment.OrderID != nil {
		var order models.Order
		if err := s.DB.WithContext(ctx).First(&order, *payment.OrderID).Error; err != nil {
			return message, err
		}
		data.Name = order.BuyerName
		data.ReferenceLabel = "Order reference"
		data.Reference = order.Slug.String()
		var items []models.OrderItem
		if err := s.DB.WithContext(ctx).Where("order_id = ?", order.ID).Order("id").Find(&items).Error; err != nil {
			return message, err
		}
		merchandise := false
		for _, item := range items {
			name, kind := item.ProductName, item.ProductType
			if name == "" || kind == "" {
				var product models.Product
				if s.DB.WithContext(ctx).First(&product, item.ProductID).Error == nil {
					if name == "" {
						name = product.Name
					}
					if kind == "" {
						kind = product.Type
					}
				}
			}
			if strings.EqualFold(kind, "MERCH") {
				merchandise = true
			}
			data.Items = append(data.Items, email.LineItem{Name: name, Quantity: strconv.Itoa(item.Qty), Total: formatMoney(order.Currency, item.LineTotalMinor)})
		}
		if order.Status == "paid" && payment.Status == "success" {
			data.Eyebrow = "ORDER CONFIRMED"
			data.Title = "Your order is confirmed."
			data.Intro = "Thank you for your purchase. Your payment is confirmed and your receipt is attached. Here's everything you ordered."
			message.Subject = "Your EcoStride order confirmation & receipt"
			data.Footer = "Bring your order reference and receipt to the race-day merchandise collection point. The team will record your collection when your items are handed over."
			if !merchandise {
				data.Eyebrow = "SUPPORT RECEIVED"
				data.Title = "Thank you for taking part."
				data.Intro = "Your support makes a difference. Your contribution is confirmed and your receipt is attached."
				data.Footer = "Virtual participation and support do not include a race-day entry or bib."
				message.Subject = "Thank you for supporting EcoStride - your receipt"
			}
			if merchandise && order.CollectedAt != nil {
				data.Footer = "Your merchandise collection has already been recorded. Keep this receipt for your records."
			}
			data.Secondary = []email.Action{{Label: "View your order", URL: base + "/orders/" + order.Slug.String()}}
		} else {
			data.Intro = "Your payment receipt is attached. This order is not currently eligible for collection. Please contact the team for help."
		}
	}
	if payment.Status == "refunded" {
		data.Eyebrow = "PAYMENT RECORD"
		data.Intro = "This receipt records the original payment. The payment has since been refunded; this is not a new charge or a valid race-day entry."
	}
	if data.Name == "" {
		data.Name = "there"
	}
	text, html, err := email.RenderTransactional(data)
	if err != nil {
		return message, fmt.Errorf("render receipt email: %w", err)
	}
	message.Text = text
	message.HTML = html
	return message, nil
}
