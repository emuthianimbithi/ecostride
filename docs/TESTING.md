# Testing

## Backend
- Set `TEST_DATABASE_URL` to a disposable Postgres database for test runs.
- Run all tests: `go test ./internal/...`
- Key coverage:
  - Bib auto-assign: `backend/internal/bibs/auto_assign_test.go`
  - Consent versioning: `backend/internal/registrations/consent_test.go`
  - Reconciliation matching: `backend/internal/finance/reconciliation_test.go`
  - Webhook signature verification + payment flow: `backend/internal/payments/webhook_test.go`

## Frontend
- Install deps: `npm install`
- Component tests (React Testing Library + Vitest): `npm run test`
- E2E tests (Playwright): `npm run test:e2e`
  - Requires the Next.js dev server; Playwright config will start it via `npm run dev`.

This file will be expanded as test suites are implemented.
