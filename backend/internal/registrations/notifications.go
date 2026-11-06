package registrations

import (
	"context"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/email"
	"ecostride/backend/internal/tickets"
	"gorm.io/gorm"
	"strings"
)

// Pending jobs from older deployments are consumed without sending a ticket.
func SendConfirmationEmail(ctx context.Context, cfg config.Config, db *gorm.DB, registrationID uint) error {
	ticket, err := tickets.Load(ctx, db, registrationID)
	if err != nil {
		return err
	}
	if !ticket.Eligible {
		return nil
	}
	reg, event := ticket.Registration, ticket.Event
	base := strings.TrimRight(cfg.BaseURL, "/")
	data := email.TransactionalData{Eyebrow: "RACE ENTRY CONFIRMED", Title: event.Title, Name: reg.AthleteName, Intro: "Your entry is confirmed. Your race ticket is attached - we look forward to seeing you on the start line.", ReferenceLabel: "Registration reference", Reference: reg.Slug.String(), Details: []email.Detail{{Label: "Race day", Value: tickets.RaceDate(event.StartAt)}, {Label: "Location", Value: event.Location}}, Primary: email.Action{Label: "Download your race ticket", URL: base + "/api/v1/public/registrations/" + reg.Slug.String() + "/confirmation.pdf"}, ContactURL: base + "/contact", Footer: "Bring this ticket or registration reference for race-day lookup. Bib and race-pack collection are recorded separately."}
	if ticket.Category != nil {
		data.Details = append(data.Details, email.Detail{Label: "Category", Value: ticket.Category.Name})
	}
	attachments := []email.Attachment{{Filename: "race-ticket.pdf", ContentType: "application/pdf", Content: tickets.PDF(ticket)}}
	if calendar := tickets.Calendar(ticket, base); len(calendar) > 0 {
		attachments = append(attachments, email.Attachment{Filename: "race-day.ics", ContentType: "text/calendar", Content: calendar})
		data.Secondary = []email.Action{{Label: "Add race day to your calendar", URL: base + "/api/v1/public/registrations/" + reg.Slug.String() + "/calendar.ics"}}
		data.Footer += " The calendar file includes a one-day reminder; your calendar app controls whether it is enabled."
	}
	text, html, err := email.RenderTransactional(data)
	if err != nil {
		return err
	}
	return email.SendMessage(ctx, cfg, reg.Email, email.Message{Subject: "Your " + event.Title + " race ticket", Text: text, HTML: html, Attachments: attachments})
}
