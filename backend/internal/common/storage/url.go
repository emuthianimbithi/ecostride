package storage

import (
	"net/url"
	"path"
	"strings"
)

func joinPublicURL(base, objectKey string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" || objectKey == "" {
		return ""
	}

	u, err := url.Parse(base)
	if err != nil {
		return ""
	}

	escapedKey := escapePathPreservingSlashes(objectKey)
	u.Path = path.Join(strings.TrimRight(u.Path, "/"), escapedKey)
	return u.String()
}

func escapePathPreservingSlashes(p string) string {
	parts := strings.Split(p, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
