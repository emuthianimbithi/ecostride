package apierrors

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"unicode"

	"github.com/gin-gonic/gin"
)

// AssertNoUppercaseKeys recursively walks JSON and fails if any key contains uppercase letters.
// This enforces the snake_case contract for all API responses.
// Exempt patterns can be passed for known external API payloads (e.g., M-Pesa callbacks).
func AssertNoUppercaseKeys(t *testing.T, jsonBytes []byte, exemptPaths ...string) {
	t.Helper()

	var data interface{}
	if err := json.Unmarshal(jsonBytes, &data); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	var violations []string
	walkJSON(data, "", &violations)

	for _, v := range violations {
		t.Errorf("found uppercase key in response: %s", v)
	}
}

func walkJSON(data interface{}, path string, violations *[]string) {
	switch v := data.(type) {
	case map[string]interface{}:
		for key, val := range v {
			currentPath := key
			if path != "" {
				currentPath = path + "." + key
			}
			if hasUppercase(key) {
				*violations = append(*violations, currentPath)
			}
			walkJSON(val, currentPath, violations)
		}
	case []interface{}:
		for i, item := range v {
			walkJSON(item, path+"[]", violations)
			_ = i
		}
	}
}

func hasUppercase(s string) bool {
	for _, r := range s {
		if unicode.IsUpper(r) {
			return true
		}
	}
	return false
}

// TestErrorResponseSnakeCase verifies that error responses use snake_case keys
func TestErrorResponseSnakeCase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/test", func(c *gin.Context) {
		AbortWithError(c, http.StatusBadRequest, "TEST_ERROR", "test message", []Detail{
			{Field: "email_address", Issue: "required"},
		})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}

	body := recorder.Body.Bytes()

	// Check JSON structure
	var resp Response
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if resp.Error.Code != "TEST_ERROR" {
		t.Errorf("expected code TEST_ERROR, got %s", resp.Error.Code)
	}
	if resp.Error.Message != "test message" {
		t.Errorf("expected message 'test message', got %s", resp.Error.Message)
	}
	if len(resp.Error.Details) != 1 || resp.Error.Details[0].Field != "email_address" {
		t.Errorf("expected field 'email_address', got %v", resp.Error.Details)
	}

	// Verify no uppercase keys
	AssertNoUppercaseKeys(t, body)
}

// TestNoCamelCaseInResponse verifies that no camelCase keys appear in JSON responses
func TestNoCamelCaseInResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/test", func(c *gin.Context) {
		AbortWithError(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Validation failed", []Detail{
			{Field: "first_name", Issue: "required"},
			{Field: "email_address", Issue: "invalid"},
		})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	body := recorder.Body.String()

	// Regex to detect common camelCase patterns (expanded list)
	camelCasePatterns := []string{
		// Timestamps
		`"createdAt"`, `"updatedAt"`, `"publishedAt"`, `"effectiveAt"`,
		// Names
		`"firstName"`, `"lastName"`, `"emailAddress"`, `"phoneNumber"`,
		// Event/Registration
		`"eventSlug"`, `"eventTitle"`, `"eventId"`, `"categoryId"`,
		// Volunteers
		`"preferredRoles"`, `"preferredEventSlug"`, `"shiftStart"`, `"shiftEnd"`, `"roleName"`,
		// Sponsors
		`"logoUrl"`, `"websiteUrl"`, `"isFeatured"`, `"displayOrder"`, `"tierName"`, `"tierSlug"`,
		`"locationKey"`, `"urlSlug"`,
		// Payments
		`"amountMinor"`, `"providerRef"`, `"paymentId"`, `"paymentStatus"`,
		// CMS
		`"heroStyleId"`, `"heroStyle"`, `"layoutType"`, `"aspectRatio"`, `"focalPoint"`,
		`"textPlacement"`, `"paddingVariant"`, `"isActive"`, `"heroShowTitle"`,
		`"featuredImageUrl"`, `"featuredImageMediaId"`,
		// Shop
		`"allowCustomAmount"`, `"priceKesMinor"`, `"priceUsdMinor"`, `"priceEurMinor"`,
		`"stockQty"`, `"primaryImageMediaId"`, `"imageUrl"`, `"imageAlt"`,
		// Generic
		`"mediaId"`, `"userId"`, `"startAt"`, `"endAt"`,
	}

	for _, pattern := range camelCasePatterns {
		if matched, _ := regexp.MatchString(pattern, body); matched {
			t.Errorf("found camelCase key in response: %s", pattern)
		}
	}

	// Also run the recursive check
	AssertNoUppercaseKeys(t, recorder.Body.Bytes())
}

// TestValidationErrorFormat verifies 422 responses have the correct structure
func TestValidationErrorFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/test", func(c *gin.Context) {
		AbortValidationError(c, nil)
	})

	req := httptest.NewRequest("POST", "/test", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", recorder.Code)
	}

	var resp Response
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if resp.Error.Code != "VALIDATION_ERROR" {
		t.Errorf("expected code VALIDATION_ERROR, got %s", resp.Error.Code)
	}

	// Verify no uppercase keys in response
	AssertNoUppercaseKeys(t, recorder.Body.Bytes())
}

// TestValidationErrorFieldNamesSnakeCase verifies validation error field names use snake_case
func TestValidationErrorFieldNamesSnakeCase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/test", func(c *gin.Context) {
		AbortWithError(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Validation failed", []Detail{
			{Field: "first_name", Issue: "required"},
			{Field: "email_address", Issue: "invalid format"},
			{Field: "phone_number", Issue: "must be valid"},
		})
	})

	req := httptest.NewRequest("POST", "/test", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	var resp Response
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	// Verify each field name is snake_case (no uppercase)
	for _, detail := range resp.Error.Details {
		if hasUppercase(detail.Field) {
			t.Errorf("validation error field should be snake_case, got: %s", detail.Field)
		}
	}

	// Verify error structure exists
	if resp.Error.Code == "" {
		t.Error("error.code should not be empty")
	}
	if resp.Error.Message == "" {
		t.Error("error.message should not be empty")
	}
}
