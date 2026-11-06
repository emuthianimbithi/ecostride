package email

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"net/textproto"
	"strings"
)

func attachFiles(message []byte, attachments []Attachment) ([]byte, error) {
	parsed, err := mail.ReadMessage(bytes.NewReader(message))
	if err != nil {
		return nil, err
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{"Content-Type": {parsed.Header.Get("Content-Type")}}
	part, err := writer.CreatePart(header)
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, parsed.Body); err != nil {
		return nil, err
	}
	for _, attachment := range attachments {
		contentType := attachment.ContentType
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		header = textproto.MIMEHeader{"Content-Type": {contentType}, "Content-Disposition": {mime.FormatMediaType("attachment", map[string]string{"filename": attachment.Filename})}, "Content-Transfer-Encoding": {"base64"}}
		part, err = writer.CreatePart(header)
		if err != nil {
			return nil, err
		}
		encoded := base64.StdEncoding.EncodeToString(attachment.Content)
		for len(encoded) > 76 {
			if _, err := io.WriteString(part, encoded[:76]+"\r\n"); err != nil {
				return nil, err
			}
			encoded = encoded[76:]
		}
		if _, err := io.WriteString(part, encoded+"\r\n"); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	var headers strings.Builder
	for _, key := range []string{"From", "To", "Subject", "Date", "MIME-Version"} {
		if value := parsed.Header.Get(key); value != "" {
			headers.WriteString(key + ": " + value + "\r\n")
		}
	}
	headers.WriteString("Content-Type: " + mime.FormatMediaType("multipart/mixed", map[string]string{"boundary": writer.Boundary()}) + "\r\n\r\n")
	return append([]byte(headers.String()), body.Bytes()...), nil
}
