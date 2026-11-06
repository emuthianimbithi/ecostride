package email

import (
	"context"
	"ecostride/backend/internal/common/config"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"testing"
	"time"
)

func TestResendConfiguration(t *testing.T) {
	if ValidateConfig(config.Config{EmailProvider: "resend"}) == nil {
		t.Fatal("missing credentials accepted")
	}
	if ValidateConfig(config.Config{EmailProvider: "resned"}) == nil {
		t.Fatal("unknown provider silently logged as sent")
	}
	cfg := config.Config{EmailProvider: "resend", ResendAPIKey: "fixture-key", ResendFrom: "EcoStride <receipts@example.com>"}
	if err := ValidateConfig(cfg); err != nil {
		t.Fatal(err)
	}
	if err := sendResend(context.Background(), cfg, "recipient@example.com", "Receipt\r\nBcc: injected@example.com", "body", "", "http://127.0.0.1:1/emails", resendHTTP); err == nil {
		t.Fatal("header injection accepted")
	}
}

func TestResendSimulation(t *testing.T) {
	base := os.Getenv("RESEND_SIMULATION_URL")
	if base == "" {
		t.Skip("RESEND_SIMULATION_URL not set")
	}
	u, err := url.Parse(base)
	if err != nil || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1") {
		t.Fatal("simulation must be local")
	}
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Post(base+"/__test/reset", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	cfg := config.Config{EmailProvider: "resend", ResendAPIKey: "fixture-key", ResendFrom: "EcoStride <receipts@example.com>"}
	ctx := WithIdempotencyKey(context.Background(), "job-original")
	for i := 0; i < 2; i++ {
		if err := sendResend(ctx, cfg, "buyer@example.com", "Receipt", "Receipt details", "<p>Receipt details</p>", base+"/emails", client, Attachment{Filename: "race-day.ics", ContentType: "text/calendar", Content: []byte("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")}); err != nil {
			t.Fatal(err)
		}
	}
	if err := sendResend(ctx, cfg, "buyer@example.com", "Receipt", "Changed receipt", "", base+"/emails", client); err == nil {
		t.Fatal("changed payload accepted for same key")
	}
	for _, subject := range []string{"rate-limit", "unavailable", "bad-request", "malformed"} {
		if err := sendResend(context.Background(), cfg, "buyer@example.com", subject, "Receipt details", "", base+"/emails", client); err == nil {
			t.Fatalf("%s treated as accepted", subject)
		}
	}
	if err := sendResend(WithIdempotencyKey(context.Background(), "job-intentional-resend"), cfg, "buyer@example.com", "Receipt", "Receipt details", "", base+"/emails", client); err != nil {
		t.Fatal(err)
	}
	response, err = client.Get(base + "/__test/state")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var state struct {
		Accepted int `json:"accepted"`
		Requests int `json:"requests"`
	}
	if err := json.NewDecoder(response.Body).Decode(&state); err != nil {
		t.Fatal(err)
	}
	if state.Accepted != 2 || state.Requests != 8 {
		t.Fatalf("unexpected provider calls: %+v", state)
	}
}
