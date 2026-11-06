package email

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"
)

type Detail struct{ Label, Value string }
type LineItem struct{ Name, Quantity, Total string }
type Action struct{ Label, URL string }
type TransactionalData struct {
	Eyebrow, Title, Name, Intro, Amount, Reference, ReferenceLabel, Footer, ContactURL string
	Details                                                                            []Detail
	Items                                                                              []LineItem
	Primary                                                                            Action
	Secondary                                                                          []Action
}

func RenderTransactional(data TransactionalData) (string, string, error) {
	var text strings.Builder
	fmt.Fprintf(&text, "%s\n\nHi %s,\n%s\n", data.Title, data.Name, data.Intro)
	if data.Amount != "" {
		fmt.Fprintf(&text, "\n%s\n", data.Amount)
	}
	for _, detail := range data.Details {
		fmt.Fprintf(&text, "%s: %s\n", detail.Label, detail.Value)
	}
	for _, item := range data.Items {
		fmt.Fprintf(&text, "%s x%s - %s\n", item.Name, item.Quantity, item.Total)
	}
	fmt.Fprintf(&text, "\n%s: %s\n", data.ReferenceLabel, data.Reference)
	if data.Primary.URL != "" {
		fmt.Fprintf(&text, "\n%s: %s\n", data.Primary.Label, data.Primary.URL)
	}
	for _, action := range data.Secondary {
		fmt.Fprintf(&text, "%s: %s\n", action.Label, action.URL)
	}
	fmt.Fprintf(&text, "\n%s\nEcoStride - Malindi, Kenya\n", data.Footer)
	const layout = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f2eb;color:#153c34;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{.Intro}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2eb;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6e1d5;border-radius:20px;overflow:hidden;">
<tr><td style="background:#153c34;padding:28px 28px 26px;color:#ffffff;"><p style="margin:0 0 24px;font-size:18px;font-weight:700;letter-spacing:1px;">EcoStride<span style="color:#a6d9ce;font-weight:400;"> / COASTAL COMMUNITY</span></p><p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:2px;color:#b8dfcc;">{{.Eyebrow}}</p><h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:700;">{{.Title}}</h1></td></tr>
<tr><td style="padding:28px;"><p style="margin:0 0 10px;font-size:17px;line-height:1.6;">Hi {{.Name}},</p><p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#52645d;">{{.Intro}}</p>
{{if .Amount}}<p style="margin:0 0 24px;padding:18px 20px;background:#f1f6f0;border-radius:12px;font-size:27px;font-weight:700;color:#153c34;">{{.Amount}}</p>{{end}}
{{if .Details}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6e1d5;">{{range .Details}}<tr><td width="32%" valign="top" style="padding:13px 12px 13px 0;border-bottom:1px solid #e6e1d5;font-size:13px;line-height:1.5;color:#66776e;">{{.Label}}</td><td valign="top" style="padding:13px 0;border-bottom:1px solid #e6e1d5;font-size:14px;line-height:1.5;font-weight:600;word-break:break-word;">{{.Value}}</td></tr>{{end}}</table>{{end}}
{{if .Items}}<h2 style="margin:26px 0 10px;font-size:17px;">Your order</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{{range .Items}}<tr><td style="padding:12px 8px 12px 0;border-bottom:1px solid #e6e1d5;font-size:14px;line-height:1.5;">{{.Name}}<br><span style="font-size:12px;color:#66776e;">Quantity {{.Quantity}}</span></td><td align="right" style="padding:12px 0;border-bottom:1px solid #e6e1d5;font-size:14px;white-space:nowrap;">{{.Total}}</td></tr>{{end}}</table>{{end}}
<div style="margin:24px 0;padding:16px 18px;border:1px dashed #b9c5b7;background:#fcfbf7;border-radius:12px;"><p style="margin:0 0 8px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#66776e;">{{.ReferenceLabel}}</p><p style="margin:0;font-family:monospace;font-size:13px;line-height:1.6;word-break:break-all;">{{.Reference}}</p></div>
{{if .Primary.URL}}<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#153c34" style="border-radius:28px;"><a href="{{.Primary.URL}}" style="display:inline-block;padding:16px 24px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">{{.Primary.Label}} &rarr;</a></td></tr></table>{{end}}
{{range .Secondary}}<p style="margin:18px 0 0;font-size:14px;"><a href="{{.URL}}" style="color:#216d79;text-decoration:underline;">{{.Label}}</a></p>{{end}}
<p style="margin:28px 0 0;font-size:13px;line-height:1.7;color:#66776e;">{{.Footer}}</p></td></tr>
<tr><td style="padding:20px 28px;background:#faf8f2;border-top:1px solid #e6e1d5;"><p style="margin:0;font-size:12px;line-height:1.7;color:#66776e;">EcoStride Association &middot; Malindi, Kenya{{if .ContactURL}}<br><a href="{{.ContactURL}}" style="color:#216d79;">Questions? Contact the team</a>{{end}}</p></td></tr>
</table></td></tr></table></body></html>`
	tpl, err := template.New("transactional").Parse(layout)
	if err != nil {
		return "", "", err
	}
	var html bytes.Buffer
	if err := tpl.Execute(&html, data); err != nil {
		return "", "", err
	}
	return text.String(), html.String(), nil
}
