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
