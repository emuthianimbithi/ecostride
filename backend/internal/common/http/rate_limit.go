package http

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"ecostride/backend/internal/common/apierrors"

	"github.com/gin-gonic/gin"
)

type rateEntry struct {
	count   int
	resetAt time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	entries map[string]*rateEntry
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{entries: make(map[string]*rateEntry)}
}

func (r *rateLimiter) allow(key string, limit int, window time.Duration) (bool, time.Time, int) {
	now := time.Now()

	r.mu.Lock()
	defer r.mu.Unlock()

	entry, exists := r.entries[key]
	if !exists || now.After(entry.resetAt) {
		entry = &rateEntry{count: 0, resetAt: now.Add(window)}
		r.entries[key] = entry
	}

	if entry.count >= limit {
		return false, entry.resetAt, 0
	}

	entry.count++
	remaining := limit - entry.count
	return true, entry.resetAt, remaining
}

var defaultLimiter = newRateLimiter()

// RateLimit applies a simple IP-based limiter to the route.
func RateLimit(name string, limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := name + ":" + c.ClientIP()
		allowed, resetAt, remaining := defaultLimiter.allow(key, limit, window)
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(resetAt.Unix(), 10))
		if !allowed {
			retryAfter := int(time.Until(resetAt).Seconds())
			if retryAfter < 1 {
				retryAfter = 1
			}
			c.Header("Retry-After", strconv.Itoa(retryAfter))
			apierrors.AbortWithError(c, http.StatusTooManyRequests, "RATE_LIMITED", "rate limit exceeded", nil)
			return
		}
		c.Next()
	}
}
