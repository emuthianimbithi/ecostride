# Payments

## Canonical status enum (frontend/backend contract)

All payment responses use one of these lowercase statuses:
- `pending`
- `success`
- `failed`
- `refunded`
- `chargeback` (not emitted unless explicitly set upstream)

Legacy/status mapping strategy (read-time normalization):
- `paid`, `completed`, `succeeded` -> `success`
- `processing` -> `pending`
- `canceled`, `cancelled`, `error` -> `failed`

Public payment status endpoint returns:
- `payment_id` (uuid string)
- `status` (canonical)
- `provider` (`MPESA` or `STRIPE`)
- `currency` (`KES`, `USD`, `EUR`)
- `amount_minor` (integer)
- `provider_ref` (string)
- `created_at` (RFC3339 string)

## Stripe Checkout
- Initiation: `POST /api/v1/public/payments/stripe/checkout`
- Webhook: `POST /api/v1/webhooks/stripe` (configured via `STRIPE_WEBHOOK_SECRET`)

Idempotency:
- Client supplies `X-Idempotency-Key` when creating a checkout session.

## M-Pesa STK
- Initiation: `POST /api/v1/public/payments/mpesa/stk`
- Webhook: `POST /api/v1/webhooks/mpesa`

Env vars are listed in `backend/.env.example`.

## Retry and duplicate protection

All registration and shop payment initiation endpoints require `X-Idempotency-Key` (1–200 characters). Reuse the key for the same request. The database serializes key claims and target claims before provider submission; exactly one caller submits a new attempt. Fingerprints include target, provider, currency, amount and phone or effective redirect URLs. Reusing a key with different inputs returns 409 without returning the other payment. A different key cannot create another attempt while the target has pending, processing, successful, refunded or chargeback payments. A failed attempt may be retried with a new key.

A replay returns the saved payment reference and available checkout URL. HTTP 202 means the existing pending attempt has no provider result yet. Follow `/public/payments/{id}/status`; do not assume a provider timeout means no charge occurred. Reconciliation/resubmission recovery remains a follow-up, so these uncertain attempts deliberately block fresh charges. Existing attempts created before request fingerprints were introduced return conflict on key reuse; they are not automatically resubmitted. Public UUID access still uses the existing bearer-reference model; scoped customer authorization remains separate work.

Stripe fulfillment checks paid status, exact amount/currency and provider identity, and accepts delayed successful checkout events. See [Stripe fulfillment guidance](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted). Payment-event completion, local payment/entry changes, receipt creation and email/PDF job enqueue commit together. A failed transaction leaves the event retryable. Existing event rows without processed_at are resumed. Duplicate callbacks do not duplicate receipts/jobs. Late failure cannot downgrade success; late success cannot overwrite refunded/chargeback state. Money received after registration/order cancellation is recorded with requires_review metadata without restoring eligibility.

Receipt generation/delivery now runs through durable jobs even when the payment service was constructed without a worker reference. The API worker must be running. Worker lease recovery, resend repairs, provider reconciliation, immutable quotes, refund idempotency, and the admin review queue are still pending.

## Email uniqueness and deployment

One active registration per event is enforced on LOWER(BTRIM(email)) by idx_reg_event_email_active_v2. Active statuses are created, pending, pending_payment, paid, confirmed and failed. Cancelled/refunded entries may register again; records marked deleted do not occupy the new index. Concurrent public creation conflicts return 409 without participant data.

Run the migration command before deploying the API: it adds payment_events.processed_at and builds the new email index before removing the old one. Existing duplicate active emails cause migration to fail; resolve them deliberately, without deleting records automatically. Identify conflicts first:

```sql
SELECT event_id, LOWER(BTRIM(email)) AS email, COUNT(*)
FROM registrations
WHERE deleted_at IS NULL
  AND status IN ('created','pending','pending_payment','paid','confirmed','failed')
GROUP BY event_id, LOWER(BTRIM(email)) HAVING COUNT(*) > 1;
```

## Admin recovery and worker leases

`GET /admin/payments/{id}` requires payment.read and provides safe payment-event and delivery-job summaries (latest 50 each). Raw provider payloads, metadata and worker errors are excluded. `GET /admin/payments?needs_review=true` filters old pending entries (15 minutes) and explicit review flags. These flags do not establish a provider outcome or permit a new charge.

`POST /admin/payments/{id}/resend-receipt` requires payment.receipt.resend and a reason (1–500 characters). It queues delivery to the saved receipt recipient, reuses an existing pending/processing email job, and commits the audit record in the same transaction. It requires an existing receipt for a successful/refunded payment. Missing receipts, retrying PDF generation and provider reconciliation are separate recovery tasks. The older registration resend route has not been migrated to this workflow.

Workers reclaim processing jobs after a two-minute lease. Attempts count claims, including crashed attempts, with a three-attempt limit. Updates are fenced by claim timestamp and attempt. Handler contexts have a 90-second deadline; handlers must honor cancellation. Receipt delivery remains at least once: a process can crash after an external email send and before saving its delivery marker. This change does not promise exactly-once SMTP delivery. Original email/PDF jobs skip already-completed delivery/artifacts; explicit resend jobs intentionally send again.

Partial refunds are rejected until cumulative refund accounting is implemented; the admin form offers full refunds only and distinguishes recording a completed manual M-Pesa refund from requesting a provider refund. Refund-operation idempotency and provider confirmation remain pending work.

PesaPal checkout, verified notifications, bounded pending recovery and admin verification are now implemented behind PESAPAL_ENABLED. See [PESAPAL.md](PESAPAL.md) for activation, deployment prerequisites, test evidence and remaining merchant acceptance requirements. PesaPal refunds and shop UI migration remain pending.
