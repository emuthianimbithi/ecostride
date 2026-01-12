package http

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ecostride/backend/internal/common/apierrors"
	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/storage"

	"github.com/gin-gonic/gin"
)

type MediaHandler struct {
	Config  config.Config
	Storage storage.StorageProvider
}

func NewMediaHandler(cfg config.Config, provider storage.StorageProvider) *MediaHandler {
	return &MediaHandler{Config: cfg, Storage: provider}
}

func (h *MediaHandler) Serve(c *gin.Context) {
	rawKey := strings.TrimPrefix(c.Param("key"), "/")
	if rawKey == "" {
		apierrors.AbortWithError(c, http.StatusBadRequest, "", "missing key", nil)
		return
	}

	if local, ok := h.Storage.(*storage.LocalProvider); ok {
		fullPath, err := safeJoinLocalPath(local.MediaDir, rawKey)
		if err != nil {
			apierrors.AbortWithError(c, http.StatusBadRequest, "", "invalid key", nil)
			return
		}
		c.File(fullPath)
		return
	}

	publicURL := h.Storage.GetPublicURL(c.Request.Context(), rawKey)
	if publicURL == "" {
		signed, err := h.Storage.GetSignedURL(c.Request.Context(), rawKey, 15*time.Minute)
		if err == nil && signed != "" {
			c.Redirect(http.StatusFound, signed)
			return
		}
	}
	if publicURL != "" {
		c.Redirect(http.StatusFound, publicURL)
		return
	}

	apierrors.AbortWithError(c, http.StatusNotFound, "", "not found", nil)
}

func safeJoinLocalPath(mediaDir, objectKey string) (string, error) {
	objectKey = strings.TrimPrefix(objectKey, "/")
	if strings.TrimSpace(mediaDir) == "" || objectKey == "" {
		return "", os.ErrInvalid
	}

	clean := filepath.Clean(filepath.FromSlash(objectKey))
	if clean == "." {
		return "", os.ErrInvalid
	}

	full := filepath.Join(mediaDir, clean)
	rel, err := filepath.Rel(mediaDir, full)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", os.ErrInvalid
	}

	return full, nil
}
