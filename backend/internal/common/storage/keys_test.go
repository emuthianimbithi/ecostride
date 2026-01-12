package storage

import (
	"strings"
	"testing"
	"time"
)

func TestGenerateObjectKey_DatePrefixAndExt(t *testing.T) {
	now := time.Date(2026, 1, 11, 12, 0, 0, 0, time.UTC)
	key := GenerateObjectKey(now, "my photo.JPG", "image/jpeg")

	if !strings.HasPrefix(key, "2026/01/11/") {
		t.Fatalf("expected date prefix, got %q", key)
	}
	if !strings.HasSuffix(key, ".jpg") {
		t.Fatalf("expected .jpg suffix, got %q", key)
	}
	parts := strings.Split(key, "/")
	if len(parts) != 4 {
		t.Fatalf("expected 4 path parts, got %d (%q)", len(parts), key)
	}
	if parts[3] == "" || strings.Contains(parts[3], "..") {
		t.Fatalf("expected safe filename part, got %q", parts[3])
	}
}
