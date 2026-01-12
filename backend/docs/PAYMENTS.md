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
