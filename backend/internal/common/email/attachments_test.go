package email

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"
	"testing"
)

func TestStyledTemplateEscapesDetailsAndMIMEAttachments(t *testing.T) {
	text, html, err := RenderTransactional(TransactionalData{Title: "Estuary <Marathon>", Name: "<script>alert(1)</script>", Intro: "Your ticket is confirmed.", ReferenceLabel: "Registration", Reference: "reference", Primary: Action{Label: "Get ticket", URL: "https://example.com/ticket"}, Details: []Detail{{Label: "Location", Value: "Malindi & coast"}}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(html, "<script>") || !strings.Contains(html, "&lt;Marathon&gt;") || !strings.Contains(html, `role="presentation"`) || !strings.Contains(text, "Get ticket: https://example.com/ticket") {
		t.Fatal("unsafe or incomplete template")
	}
	message, err := buildMessage("receipts@example.com", "runner@example.com", "Race ticket", text, html)
	if err != nil {
		t.Fatal(err)
	}
	calendar := []byte("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n")
	message, err = attachFiles(message, []Attachment{{Filename: "race-ticket.pdf", ContentType: "application/pdf", Content: []byte("%PDF-1.4")}, {Filename: "race-day.ics", ContentType: "text/calendar", Content: calendar}})
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := mail.ReadMessage(bytes.NewReader(message))
	if err != nil {
		t.Fatal(err)
	}
	kind, params, err := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
	if err != nil || kind != "multipart/mixed" {
		t.Fatal("missing mixed MIME")
	}
	reader := multipart.NewReader(parsed.Body, params["boundary"])
	first, err := reader.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(first.Header.Get("Content-Type"), "multipart/alternative") {
		t.Fatal("lost text/html fallback")
	}
	for _, want := range []string{"%PDF-1.4", string(calendar)} {
		part, err := reader.NextPart()
		if err != nil {
			t.Fatal(err)
		}
		raw, err := io.ReadAll(part)
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(string(raw), "\r\n", ""))
		if err != nil || string(decoded) != want {
			t.Fatal("attachment encoding corrupted")
		}
	}
}
