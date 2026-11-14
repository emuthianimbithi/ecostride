package tickets

import (
	"context"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/pdf"
	"fmt"
	"gorm.io/gorm"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

type Ticket struct {
	Registration models.Registration
	Event        models.Event
	Category     *models.EventCategory
	Eligible     bool
}

func Load(ctx context.Context, db *gorm.DB, id uint) (Ticket, error) {
	var result Ticket
	if err := db.WithContext(ctx).First(&result.Registration, id).Error; err != nil {
		return result, err
	}
	if err := db.WithContext(ctx).First(&result.Event, result.Registration.EventID).Error; err != nil {
		return result, err
	}
	reg := result.Registration
	result.Eligible = reg.Status == "confirmed" || reg.Status == "paid"
	if reg.CategoryID != nil {
		var category models.EventCategory
		// A retired category remains part of an existing entry's history.
		if err := db.WithContext(ctx).Unscoped().Where("id = ? AND event_id = ?", *reg.CategoryID, reg.EventID).First(&category).Error; err != nil {
			return result, err
		}
		result.Category = &category
		paid := category.PriceKESMinor > 0 || (category.PriceUSDMinor != nil && *category.PriceUSDMinor > 0) || (category.PriceEURMinor != nil && *category.PriceEURMinor > 0)
		if paid {
			var count int64
			if err := db.WithContext(ctx).Model(&models.Payment{}).Where("registration_id = ? AND ((status = 'success' AND amount_minor > 0) OR (status = 'waived' AND provider = 'admin_waiver'))", reg.ID).Count(&count).Error; err != nil {
				return result, err
			}
			result.Eligible = result.Eligible && count > 0
		}
	}
	return result, nil
}
func RaceDate(start time.Time) string {
	if start.IsZero() {
		return "To be confirmed"
	}
	loc, err := time.LoadLocation("Africa/Nairobi")
	if err != nil {
		loc = time.FixedZone("EAT", 3*60*60)
	}
	return start.In(loc).Format("Monday, 2 January 2006 at 3:04 PM") + " EAT"
}
func PDF(ticket Ticket) []byte {
	reg, event := ticket.Registration, ticket.Event
	category := ""
	if ticket.Category != nil {
		category = ticket.Category.Name
	}
	return pdf.BuildRaceTicket(pdf.RaceTicket{
		EventTitle: event.Title,
		Athlete:    reg.AthleteName,
		RaceDate:   RaceDate(event.StartAt),
		Location:   event.Location,
		Category:   category,
		Reference:  reg.Slug.String(),
	})
}
func Calendar(ticket Ticket, base string) []byte {
	if !ticket.Eligible || ticket.Event.StartAt.IsZero() {
		return nil
	}
	reg, event := ticket.Registration, ticket.Event
	host := "ecostride.local"
	if u, err := url.Parse(base); err == nil && u.Hostname() != "" {
		host = u.Hostname()
	}
	stamp := reg.CreatedAt
	if stamp.IsZero() {
		stamp = event.StartAt
	}
	summary := event.Title
	if ticket.Category != nil {
		summary += " - " + ticket.Category.Name
	}
	link := strings.TrimRight(base, "/") + "/confirm/" + reg.Slug.String()
	lines := []string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EcoStride//Race Ticket//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:" + reg.Slug.String() + "@" + host, "DTSTAMP:" + stamp.UTC().Format("20060102T150405Z"), "DTSTART:" + event.StartAt.UTC().Format("20060102T150405Z"), "SUMMARY:" + escape(summary), "LOCATION:" + escape(event.Location), "DESCRIPTION:" + escape(fmt.Sprintf("Race entry for %s\nRegistration reference: %s\n%s", reg.AthleteName, reg.Slug, link)), "URL:" + link, "STATUS:CONFIRMED", "TRANSP:OPAQUE", "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Race day is tomorrow", "END:VALARM", "END:VEVENT", "END:VCALENDAR"}
	for i, line := range lines {
		lines[i] = fold(line)
	}
	return []byte(strings.Join(lines, "\r\n") + "\r\n")
}
func escape(s string) string {
	return strings.NewReplacer("\\", "\\\\", "\r\n", "\\n", "\n", "\\n", "\r", "\\n", ",", "\\,", ";", "\\;").Replace(s)
}
func fold(s string) string {
	var out strings.Builder
	for len(s) > 75 {
		end := 75
		for end > 0 && !utf8.RuneStart(s[end]) {
			end--
		}
		out.WriteString(s[:end])
		out.WriteString("\r\n")
		s = " " + s[end:]
	}
	out.WriteString(s)
	return out.String()
}
