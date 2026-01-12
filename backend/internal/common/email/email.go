package email

import (
	"fmt"
	"net/smtp"
	"strings"

	"ecostride/backend/internal/common/config"
)

// Send delivers a plain text email using configured provider.
func Send(cfg config.Config, to, subject, body string) error {
	switch cfg.EmailProvider {
	case "smtp":
		if cfg.SMTPHost == "" || cfg.SMTPUser == "" {
			return fmt.Errorf("smtp not configured")
		}
		addr := cfg.SMTPHost
		if !strings.Contains(addr, ":") {
			addr = addr + ":587"
		}
		auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, strings.Split(addr, ":")[0])
		msg := []byte("To: " + to + "\r\n" + "Subject: " + subject + "\r\n\r\n" + body)
		return smtp.SendMail(addr, auth, cfg.SMTPUser, []string{to}, msg)
	default:
		fmt.Printf("[email] to=%s subject=%s body=%s\n", to, subject, body)
	}

	return nil
}
