package pdf

import (
	"bytes"
	"fmt"
	"strings"
)

// RaceTicket contains the details printed on a branded race ticket.
type RaceTicket struct {
	EventTitle string
	Athlete    string
	RaceDate   string
	Location   string
	Category   string
	Reference  string
}

// BuildRaceTicket creates a one-page ticket card using the EcoStride email palette.
func BuildRaceTicket(ticket RaceTicket) []byte {
	var content strings.Builder
	// Warm cream page and white ticket card.
	content.WriteString("0.961 0.949 0.922 rg 0 0 612 792 re f\n")
	content.WriteString("1 1 1 rg 36 56 540 624 re f\n")
	// Forest header.
	content.WriteString("0.082 0.235 0.204 rg 36 438 540 242 re f\n")
	text(&content, "F2", 14, 64, 642, "EcoStride  /  COASTAL COMMUNITY", "0.78 0.91 0.84")
	text(&content, "F2", 9, 64, 608, "RACE ENTRY CONFIRMED", "0.72 0.87 0.80")
	writeWrappedText(&content, "F2", 28, 64, 566, 38, 484, ticket.EventTitle, "1 1 1", 2)
	text(&content, "F1", 12, 64, 466, "YOUR RACE TICKET", "0.86 0.93 0.88")
	// Confirmation strip.
	content.WriteString("0.945 0.965 0.941 rg 64 388 484 30 re f\n")
	text(&content, "F2", 10, 78, 399, "ENTRY CONFIRMED", "0.082 0.235 0.204")
	text(&content, "F1", 10, 420, 399, "Bring this ticket or reference on race day", "0.32 0.39 0.36")
	// Attendee details.
	text(&content, "F1", 9, 64, 355, "ATHLETE", "0.40 0.47 0.43")
	writeWrappedText(&content, "F2", 17, 64, 332, 22, 484, ticket.Athlete, "0.08 0.18 0.16", 2)
	content.WriteString("0.90 0.88 0.84 RG 64 282 m 548 282 l S\n")
	text(&content, "F1", 9, 64, 258, "RACE DAY", "0.40 0.47 0.43")
	writeWrappedText(&content, "F2", 12, 64, 238, 18, 220, ticket.RaceDate, "0.08 0.18 0.16", 2)
	text(&content, "F1", 9, 330, 258, "LOCATION", "0.40 0.47 0.43")
	writeWrappedText(&content, "F2", 12, 330, 238, 18, 218, ticket.Location, "0.08 0.18 0.16", 2)
	if ticket.Category != "" {
		text(&content, "F1", 9, 64, 202, "CATEGORY", "0.40 0.47 0.43")
		writeWrappedText(&content, "F2", 12, 64, 182, 16, 484, ticket.Category, "0.08 0.18 0.16", 2)
	}
	// Dashed rule and reference block.
	content.WriteString("[4 4] 0 d 0.72 0.76 0.72 RG 64 160 m 548 160 l S [] 0 d\n")
	content.WriteString("0.984 0.980 0.961 rg 64 100 484 46 re f\n")
	text(&content, "F1", 8, 78, 130, "REGISTRATION REFERENCE", "0.40 0.47 0.43")
	text(&content, "F2", 12, 78, 111, ticket.Reference, "0.08 0.18 0.16")
	text(&content, "F1", 9, 64, 78, "Bib and race-pack collection will be recorded separately.", "0.40 0.47 0.43")

	stream := content.String()
	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
	offsets := make([]int, 7)
	writeObj := func(index int, body string) {
		offsets[index] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", index, body)
	}
	writeObj(1, "<< /Type /Catalog /Pages 2 0 R >>")
	writeObj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
	writeObj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>")
	writeObj(4, fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(stream), stream))
	writeObj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
	writeObj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
	xref := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(offsets))
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i < len(offsets); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF", len(offsets), xref)
	return buf.Bytes()
}

func text(builder *strings.Builder, font string, size, x, y int, value, color string) {
	fmt.Fprintf(builder, "%s rg BT /%s %d Tf %d %d Td (%s) Tj ET\n", color, font, size, x, y, escapePDFText(value))
}

func writeWrappedText(builder *strings.Builder, font string, size, x, y, lineHeight, width int, value, color string, maxLines int) {
	maxChars := int(float64(width) / (float64(size) * 0.55))
	lines := wrapTicketText(value, maxChars)
	if len(lines) > maxLines {
		lines = lines[:maxLines]
		lastRunes := []rune(lines[len(lines)-1])
		if len(lastRunes) > 3 {
			lastRunes = lastRunes[:len(lastRunes)-3]
		}
		lines[len(lines)-1] = string(lastRunes) + "..."
	}
	for i, line := range lines {
		text(builder, font, size, x, y-i*lineHeight, line, color)
	}
}

func wrapTicketText(value string, limit int) []string {
	if limit < 1 {
		limit = 1
	}
	words := strings.Fields(value)
	if len(words) == 0 {
		return []string{"-"}
	}
	var lines []string
	line := ""
	for _, word := range words {
		wordRunes := []rune(word)
		for len(wordRunes) > limit {
			if line != "" {
				lines = append(lines, line)
				line = ""
			}
			lines = append(lines, string(wordRunes[:limit]))
			wordRunes = wordRunes[limit:]
		}
		word = string(wordRunes)
		if line == "" {
			line = word
		} else if len([]rune(line))+1+len([]rune(word)) <= limit {
			line += " " + word
		} else {
			lines = append(lines, line)
			line = word
		}
	}
	if line != "" {
		lines = append(lines, line)
	}
	return lines
}
