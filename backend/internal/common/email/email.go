package email

import (
	"bytes"
	"context"
	"fmt"
	"mime/multipart"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"

	"ecostride/backend/internal/common/config"
)

// Send delivers a plain text email using configured provider.
func Send(cfg config.Config, to, subject, body string) error {
	return SendRich(cfg, to, subject, body, "")
}

// SendRich delivers multipart email (text + optional HTML) using configured provider.
func SendRich(cfg config.Config, to, subject, textBody, htmlBody string) error {
	return SendRichContext(context.Background(), cfg, to, subject, textBody, htmlBody)
}

func SendRichContext(ctx context.Context, cfg config.Config, to, subject, textBody, htmlBody string) error {
	return SendMessage(ctx, cfg, to, Message{Subject: subject, Text: textBody, HTML: htmlBody})
}

type Attachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type,omitempty"`
	Content     []byte `json:"content"`
}
type Message struct {
	Subject, Text, HTML string
	Attachments         []Attachment
}

func SendMessage(ctx context.Context, cfg config.Config, to string, message Message) error {
	subject, textBody, htmlBody := message.Subject, message.Text, message.HTML
	if strings.ContainsAny(to+subject, "\r\n") {
		return fmt.Errorf("invalid email headers")
	}
	switch cfg.EmailProvider {
	case "resend":
		return sendResend(ctx, cfg, to, subject, textBody, htmlBody, "https://api.resend.com/emails", resendHTTP, message.Attachments...)
	case "smtp":
		if cfg.SMTPHost == "" || cfg.SMTPUser == "" {
			return fmt.Errorf("smtp not configured")
		}
		addr := cfg.SMTPHost
		if !strings.Contains(addr, ":") {
			port := cfg.SMTPPort
			if port == "" {
				port = "587"
			}
			addr = addr + ":" + port
		}
		auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, strings.Split(addr, ":")[0])
		from := cfg.SMTPFrom
		if from == "" {
			from = cfg.SMTPUser
		}
		msg, err := buildMessage(from, to, subject, textBody, htmlBody)
		if err == nil && len(message.Attachments) > 0 {
			msg, err = attachFiles(msg, message.Attachments)
		}
		if err != nil {
			return err
		}
		return smtp.SendMail(addr, auth, cfg.SMTPUser, []string{to}, msg)
	default:
		fmt.Printf("[email] to=%s subject=%s body=%s\n", to, subject, textBody)
		if htmlBody != "" {
			fmt.Printf("[email-html] to=%s subject=%s html=%s\n", to, subject, htmlBody)
		}
	}

	return nil
}

func buildMessage(from, to, subject, textBody, htmlBody string) ([]byte, error) {
	if htmlBody == "" {
		msg := []byte("To: " + to + "\r\n" +
			"From: " + from + "\r\n" +
			"Subject: " + subject + "\r\n" +
			"MIME-Version: 1.0\r\n" +
			"Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
			textBody)
		return msg, nil
	}

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	boundary := writer.Boundary()
	_ = writer.Close()

	headers := fmt.Sprintf(
		"To: %s\r\nFrom: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=%q\r\n\r\n",
		to, from, subject, time.Now().Format(time.RFC1123Z), boundary,
	)

	var bodyBuf bytes.Buffer
	mw := multipart.NewWriter(&bodyBuf)
	_ = mw.SetBoundary(boundary)

	textHeader := textproto.MIMEHeader{}
	textHeader.Set("Content-Type", `text/plain; charset="UTF-8"`)
	textPart, err := mw.CreatePart(textHeader)
	if err != nil {
		return nil, err
	}
	if _, err := textPart.Write([]byte(textBody)); err != nil {
		return nil, err
	}

	htmlHeader := textproto.MIMEHeader{}
	htmlHeader.Set("Content-Type", `text/html; charset="UTF-8"`)
	htmlPart, err := mw.CreatePart(htmlHeader)
	if err != nil {
		return nil, err
	}
	if _, err := htmlPart.Write([]byte(htmlBody)); err != nil {
		return nil, err
	}

	if err := mw.Close(); err != nil {
		return nil, err
	}

	return append([]byte(headers), bodyBuf.Bytes()...), nil
}
