# Transactional email with Resend

Resend is supported through its HTTPS API; SMTP remains an alternative. No credentials are committed and no real message was sent during implementation.

## VM setup

1. Add a sending domain in Resend and publish the DNS records it specifies. Wait for verified status. A sending subdomain can be used to keep transactional email separate from existing mailbox services. Do not replace existing mailbox MX records merely to enable outbound mail.
2. Create a sending API key restricted to that domain where available.
3. Set these values privately in `/opt/ecostride/.env`, which Docker Compose loads:

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=YOUR_PRIVATE_API_KEY
RESEND_FROM="EcoStride <receipts@YOUR_VERIFIED_DOMAIN>"
```

Use an address at the domain actually verified in Resend. Keep `.env` mode 0600. The API validates Resend credentials/sender presence at startup; domain ownership and key validity are established by Resend when sending. Never paste the key into chat or commit it.

Rebuild/recreate the backend for the new code/config. No database migration is added for Resend. Verify a receipt/confirmation using your own address and check both the inbox and Resend's delivery dashboard. API acceptance is not proof of inbox delivery; there is no Resend delivery/bounce webhook in this implementation.

## Queue and retries

Registration confirmation and payment receipt jobs call the same provider. Receipt emails include race/order details and a direct PDF download link. Only verified success issues a payment receipt; a failed payment does not.

The HTTP client has a 20-second timeout, cooperative job cancellation, bounded response decoding and no redirects or inline retries. A non-success HTTP response or missing message ID fails the job, allowing the existing bounded worker retry policy. Invalid credentials/domain, rate limiting and delivery problems must be checked in the worker/admin and Resend dashboard.

Receipt and registration jobs send `Idempotency-Key: ecostride-job-<job UUID>`; retries of the same job use the same key, while a deliberate admin resend queues a different job. Resend retains idempotency keys for 24 hours. Identical payloads replay within that window without another acceptance; changed payloads with the same key conflict and require review. This is not a permanent exactly-once delivery guarantee. SMTP does not have equivalent API idempotency.

Earlier console-mode jobs may already be recorded as sent without actual email delivery. Use the audited admin resend for an existing receipt after provider configuration; switching providers does not automatically resend historical messages.

## Local verification

```sh
postman simulation run postman/simulations/email-delivery.sim.yaml --port 4540 --no-history --output ndjson
```

From `backend`, run `RESEND_SIMULATION_URL=http://localhost:4540/resend go test ./internal/common/email`. The fixture only accepts fictitious data. Tests exercise matching retries, intentional resend, conflicting payload, HTTP 422/429/503, malformed acceptance and safe configuration. The real client is exercised against a stand-in, not a real Resend account.

Sources: [Send Email](https://resend.com/docs/api-reference/emails/send-email), [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [Verified Domains](https://resend.com/docs/dashboard/domains/introduction).

## Styled tickets, shop confirmations and calendar files

Paid signup no longer queues a pending-registration message. On verified success, the existing receipt email job sends one styled race confirmation with the event title, athlete, category, Nairobi race date/time, location and registration reference. Race ticket PDF, receipt PDF and an iCalendar file are attached. Free eligible registrations use the same visual layout for their ticket/calendar without a payment receipt. Older confirmation jobs whose entries remain pending are consumed without sending an email; public ticket/calendar downloads enforce the same eligibility.

Merchandise buyers receive a matching styled confirmation with saved item names, quantities, line totals, total paid, order reference and collection instructions, plus the receipt PDF. Support orders use support wording and explicitly exclude race entry/bib entitlements. Shop/support emails do not attach race calendars. Cancelled/refunded or otherwise ineligible entries receive no active race ticket; refunded receipts explain their historical status.

Templates use inline styles, presentation tables, escaped dynamic content, visible reference cards, prominent download buttons and plain-text alternatives. Resend carries base64 attachments; SMTP uses multipart/mixed with text/html alternatives and base64 files. No real emails were sent during preview/testing. Existing inbox messages do not change automatically; use an intentional admin resend to preview a previously paid entry/order with the new design.

Calendar files use a stable UID per registration, the event's saved time, UTC DTSTART, CRLF and UTF-8-safe line folding. Race details in the email/ticket are shown in Africa/Nairobi. The file includes a one-day VALARM but does not access a customer's calendar account; they must add/import it and their calendar settings govern alerts. If the event date is unset, no calendar file/link is sent. [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) and [Resend attachments](https://resend.com/docs/dashboard/emails/attachments) describe the formats.

Verification covers styled race/shop/support messages, attachment serialization, SMTP MIME decoding, header/content escaping, stable calendar IDs/timezones/reminders and paid-only downloads. Generated HTML was inspected at desktop and 390px mobile widths with no horizontal overflow. Actual rendering and attachment handling in Gmail/Outlook/Apple Mail and calendar imports still need an inbox check after deployment. This update requires only a backend rebuild/recreation, with no new database migration or Resend settings.

## Requested registration recovery emails

Returning customers can explicitly request an email verification link from the event signup page, then resume the existing entry without duplicate registration or an automatic charge. This is a requested account-access message, not a pending signup confirmation. It uses the configured Resend/SMTP provider and existing queue. See REGISTRATION_RECOVERY.md for privacy, expiry, retry behavior and the recovery-table migration required by this subsequent feature.
