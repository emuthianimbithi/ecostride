package storage_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"ecostride/backend/internal/common/config"
	httpserver "ecostride/backend/internal/common/http"
	"ecostride/backend/internal/common/storage"

	"github.com/gin-gonic/gin"
)

func TestLocalProvider_SaveAndServe(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mediaDir := t.TempDir()
	provider := storage.NewLocalProvider(mediaDir, "http://localhost:8080")

	obj, err := provider.Save(t.Context(), bytes.NewReader([]byte("hello")), "hello.txt", "text/plain")
	if err != nil {
		t.Fatalf("save failed: %v", err)
	}

	router := gin.New()
	router.GET("/media/*key", httpserver.NewMediaHandler(config.Config{MediaDir: mediaDir}, provider).Serve)

	req := httptest.NewRequest(http.MethodGet, "/media/"+obj.Key, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if body := w.Body.String(); body != "hello" {
		t.Fatalf("expected body %q, got %q", "hello", body)
	}

	req = httptest.NewRequest(http.MethodGet, "/media/../secret", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for traversal, got %d", w.Code)
	}
}
