package http

import (
	"strings"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

// RegisterValidation attaches custom validators to Gin binding.
func RegisterValidation() {
	engine, ok := binding.Validator.Engine().(*validator.Validate)
	if !ok {
		return
	}

	_ = engine.RegisterValidation("phone", func(fl validator.FieldLevel) bool {
		value := strings.TrimSpace(fl.Field().String())
		if value == "" {
			return true
		}
		for _, r := range value {
			if r < '0' || r > '9' {
				if r != '+' {
					return false
				}
			}
		}
		length := len(strings.TrimLeft(value, "+"))
		return length >= 9 && length <= 15
	})
}
