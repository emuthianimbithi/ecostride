package apierrors

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

type Detail struct {
	Field string `json:"field,omitempty"`
	Issue string `json:"issue,omitempty"`
}

type Body struct {
	Code    string   `json:"code"`
	Message string   `json:"message"`
	Details []Detail `json:"details,omitempty"`
}

type Response struct {
	Error Body `json:"error"`
}

func AbortWithError(c *gin.Context, status int, code, message string, details []Detail) {
	if strings.TrimSpace(code) == "" {
		code = statusDefaultCode(status)
	}
	if strings.TrimSpace(message) == "" {
		message = statusDefaultMessage(status)
	}
	c.AbortWithStatusJSON(status, Response{Error: Body{Code: code, Message: message, Details: details}})
}

func AbortValidationError(c *gin.Context, err error) {
	details := extractValidationDetails(err)
	AbortWithError(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Validation failed", details)
}

func BindJSON(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		AbortValidationError(c, err)
		return false
	}
	return true
}

func extractValidationDetails(err error) []Detail {
	var verrs validator.ValidationErrors
	if errors.As(err, &verrs) {
		out := make([]Detail, 0, len(verrs))
		for _, fe := range verrs {
			field := strings.TrimSpace(fe.Field())
			issue := strings.TrimSpace(fe.Tag())
			if issue == "" {
				issue = "invalid"
			}
			out = append(out, Detail{Field: field, Issue: issue})
		}
		return out
	}
	return nil
}

func statusDefaultCode(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "BAD_REQUEST"
	case http.StatusUnauthorized:
		return "UNAUTHORIZED"
	case http.StatusForbidden:
		return "FORBIDDEN"
	case http.StatusNotFound:
		return "NOT_FOUND"
	case http.StatusConflict:
		return "CONFLICT"
	case http.StatusUnprocessableEntity:
		return "VALIDATION_ERROR"
	default:
		if status >= 500 {
			return "INTERNAL_SERVER_ERROR"
		}
		return "ERROR"
	}
}

func statusDefaultMessage(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "Bad request"
	case http.StatusUnauthorized:
		return "Unauthorized"
	case http.StatusForbidden:
		return "Forbidden"
	case http.StatusNotFound:
		return "Not found"
	case http.StatusConflict:
		return "Conflict"
	case http.StatusUnprocessableEntity:
		return "Validation failed"
	default:
		if status >= 500 {
			return "Internal server error"
		}
		return "Error"
	}
}
