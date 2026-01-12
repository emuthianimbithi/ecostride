package apierrors

import (
	"bytes"
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
)

type captureWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func (w *captureWriter) Write(b []byte) (int, error) {
	return w.body.Write(b)
}

func (w *captureWriter) WriteString(s string) (int, error) {
	return w.body.WriteString(s)
}

// EnvelopeMiddleware ensures all JSON error responses follow:
// { "error": { "code": "...", "message": "...", "details": [...] } }
func EnvelopeMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		orig := c.Writer
		w := &captureWriter{ResponseWriter: orig}
		c.Writer = w

		c.Next()

		status := c.Writer.Status()
		ct := c.Writer.Header().Get("Content-Type")
		raw := bytes.TrimSpace(w.body.Bytes())
		if len(raw) == 0 {
			return
		}

		// Pass through unchanged for non-JSON or non-errors.
		if status < 400 || !strings.Contains(ct, "application/json") {
			orig.WriteHeader(status)
			_, _ = orig.Write(raw)
			return
		}

		// If it's already in the new shape, don't touch it.
		var already Response
		if err := json.Unmarshal(raw, &already); err == nil && strings.TrimSpace(already.Error.Code) != "" && strings.TrimSpace(already.Error.Message) != "" {
			orig.WriteHeader(status)
			_, _ = orig.Write(raw)
			return
		}

		// Legacy shape: {"error":"..."}.
		var legacy struct {
			Error any `json:"error"`
		}
		if err := json.Unmarshal(raw, &legacy); err != nil {
			orig.WriteHeader(status)
			_, _ = orig.Write(raw)
			return
		}

		message := ""
		code := statusDefaultCode(status)
		switch v := legacy.Error.(type) {
		case string:
			message = v
		case map[string]any:
			if m, ok := v["message"].(string); ok {
				message = m
			} else if m, ok := v["error"].(string); ok {
				message = m
			} else {
				message = statusDefaultMessage(status)
			}
			if ccode, ok := v["code"].(string); ok && strings.TrimSpace(ccode) != "" {
				code = ccode
			}
		default:
			message = statusDefaultMessage(status)
		}
		if strings.TrimSpace(message) == "" {
			message = statusDefaultMessage(status)
		}

		orig.Header().Set("Content-Type", "application/json; charset=utf-8")
		orig.WriteHeader(status)
		_ = json.NewEncoder(orig).Encode(Response{Error: Body{Code: code, Message: message}})
	}
}
