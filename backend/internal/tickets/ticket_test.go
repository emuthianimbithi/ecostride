package tickets

import (
	"ecostride/backend/internal/common/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestCalendarUTCReminderEscapingAndStableUID(t *testing.T) {
	start := time.Date(2027, 1, 15, 6, 0, 0, 0, time.FixedZone("EAT", 3*60*60))
	reg := models.Registration{Model: gorm.Model{CreatedAt: start.AddDate(0, -1, 0)}, Slug: uuid.New(), AthleteName: "Amina Runner"}
	ticket := Ticket{Registration: reg, Event: models.Event{Title: "Estuary Marathon, Coastal; Run\n" + strings.Repeat("é", 80), Location: "Malindi, Kenya", StartAt: start}, Eligible: true}
	content := string(Calendar(ticket, "https://estuarymarathon.com"))
	if strings.Contains(strings.ReplaceAll(content, "\r\n", ""), "\n") {
		t.Fatal("calendar contains bare newline")
	}
	for _, line := range strings.Split(content, "\r\n") {
		if len(line) > 75 || !utf8.ValidString(line) {
			t.Fatalf("invalid folded line: %q", line)
		}
	}
	unfolded := strings.ReplaceAll(content, "\r\n ", "")
	for _, want := range []string{"DTSTART:20270115T030000Z", "TRIGGER:-P1D", "BEGIN:VALARM", "SUMMARY:Estuary Marathon\\, Coastal\\; Run\\n", "LOCATION:Malindi\\, Kenya", "UID:" + reg.Slug.String() + "@estuarymarathon.com"} {
		if !strings.Contains(unfolded, want) {
			t.Fatalf("missing %q", want)
		}
	}
	if content != string(Calendar(ticket, "https://estuarymarathon.com")) {
		t.Fatal("calendar changes across retries")
	}
	if !strings.Contains(RaceDate(start), "6:00 AM EAT") {
		t.Fatalf("wrong race timezone: %s", RaceDate(start))
	}
	ticket.Eligible = false
	if len(Calendar(ticket, "https://example.com")) != 0 {
		t.Fatal("ineligible ticket has calendar")
	}
}
