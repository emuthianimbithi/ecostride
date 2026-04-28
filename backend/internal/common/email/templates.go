package email

import (
	"bytes"
	"fmt"
	"html/template"
)

type RegistrationConfirmationData struct {
	EventTitle         string
	CategoryName       string
	AthleteName        string
	Status             string
	ConfirmationCode   string
	ConfirmationPDFURL string
}

func RenderRegistrationConfirmation(data RegistrationConfirmationData) (textBody string, htmlBody string, err error) {
	textBody = fmt.Sprintf(
		"Thanks for registering!\n\nEvent: %s\nCategory: %s\nAthlete: %s\nStatus: %s\nConfirmation code: %s\n\nDownload confirmation PDF: %s\n",
		data.EventTitle,
		data.CategoryName,
		data.AthleteName,
		data.Status,
		data.ConfirmationCode,
		data.ConfirmationPDFURL,
	)

	const htmlTpl = `
<html>
  <body style="font-family:Arial,sans-serif;color:#0f2f2b;line-height:1.5;">
    <h2>EcoStride Registration Confirmation</h2>
    <p>Thanks for registering.</p>
    <p><strong>Event:</strong> {{.EventTitle}}</p>
    <p><strong>Category:</strong> {{.CategoryName}}</p>
    <p><strong>Athlete:</strong> {{.AthleteName}}</p>
    <p><strong>Status:</strong> {{.Status}}</p>
    <p><strong>Confirmation code:</strong> {{.ConfirmationCode}}</p>
    <p><a href="{{.ConfirmationPDFURL}}">Download confirmation PDF</a></p>
  </body>
</html>`

	tpl, err := template.New("registration_confirmation").Parse(htmlTpl)
	if err != nil {
		return "", "", err
	}

	var buf bytes.Buffer
	if err := tpl.Execute(&buf, data); err != nil {
		return "", "", err
	}

	return textBody, buf.String(), nil
}
