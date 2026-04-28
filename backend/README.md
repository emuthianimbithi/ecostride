# EcoStride Backend (Go + Gin)

EcoStride’s backend is a Go API (Gin + GORM) powering:
- Public site content (CMS pages/posts, gallery, sponsors)
- Event listings and registration flows
- Payments (Stripe Checkout + M-Pesa STK) + webhooks
- Admin tools (RBAC-protected CRUD, exports, results import, reconciliation)
- Audit logging for admin actions

## Tech stack
- Go: `go 1.24.x` (see `backend/go.mod`)
- HTTP: `github.com/gin-gonic/gin`
- ORM: `gorm.io/gorm` (+ Postgres driver)
- DB: PostgreSQL
- OpenAPI: `backend/openapi/openapi.yaml`

## Local setup
1. Start dependencies (Postgres):
   - `docker-compose up -d`
2. Configure env:
   - Copy `backend/.env.example` → `backend/.env`
   - Set at least `DATABASE_URL`, `JWT_SECRET`, `REFRESH_SECRET`
3. Run migrations + seed:
   - `cd backend && go run ./cmd/migrate`
   - `cd backend && go run ./cmd/seed`
4. Run API:
   - `cd backend && go run ./cmd/api`

Health check: `GET http://localhost:8080/health`

## Migrations / seed
- Up: `cd backend && go run ./cmd/migrate`
- Down: `cd backend && go run ./cmd/migrate -down`

### Seed modes

| Mode | Command | Purpose |
|------|---------|---------|
| **local** (default) | `make seed-local` | Rich dev dataset for testing all screens |
| **demo** | `make seed-demo` | Polished client-facing dataset |
| **onboarding** | `make seed-onboarding` | Minimal dataset for new dev setup |

Or run directly with env var: `SEED_PROFILE=local go run ./cmd/seed`

## Tests
- `cd backend && go test ./...`

Tip: if your environment blocks the system Go cache, run with workspace-local caches:
`cd backend && GOCACHE=$PWD/.gocache GOMODCACHE=$PWD/.gomodcache GOPATH=$PWD/.gopath go test ./...`

## Lint / format
- Format: `cd backend && gofmt -w .`
- Vet: `cd backend && go vet ./...`

## OpenAPI
- Source: `backend/openapi/openapi.yaml`
- Update workflow: edit YAML and keep endpoints in sync with routes in `backend/internal/common/http/routes.go`.

## Contract Rules
- **Formatting:** All JSON request/response keys must be `snake_case`. No `camelCase` or `PascalCase`.
- **Errors:** Must follow `{ "error": { "code": "...", "message": "...", "details": [...] } }`.
- **Validation:** Validation errors must return `422 Unprocessable Entity` with `details` array containing `field` (in snake_case) and `issue`.

## Directory structure
- `backend/cmd/`: entrypoints (`api`, `migrate`, `seed`)
- `backend/internal/`: application modules (handlers/services/models)
- `backend/internal/common/http/`: router/middleware/validation helpers
- `backend/openapi/`: OpenAPI spec used by frontend and tooling

## Troubleshooting
- DB connection errors: verify `DATABASE_URL` and that Postgres is running (`docker-compose ps`).
- Migration issues: ensure DB is reachable and `gen_random_uuid()` is available (Postgres `pgcrypto`).
- Webhook testing:
  - Stripe: configure `STRIPE_WEBHOOK_SECRET` and use Stripe CLI to forward to `POST /api/v1/webhooks/stripe`.
  - M-Pesa: set `MPESA_*` env vars and ensure callback route is reachable.

## Email (SMTP)
Backend supports SMTP delivery with plaintext + HTML multipart messages.

Set:
- `EMAIL_PROVIDER=smtp`
- `SMTP_HOST`
- `SMTP_PORT` (default `587`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (optional, falls back to `SMTP_USER`)

If `EMAIL_PROVIDER` is not `smtp`, emails are logged to console for local development.

## More docs
See `backend/docs/`:
- `backend/docs/ARCHITECTURE.md`
- `backend/docs/API_ERRORS.md`
- `backend/docs/PAYMENTS.md`
- `backend/docs/RESULTS_IMPORT.md`
- `backend/docs/RECONCILIATION.md`
- `backend/docs/RBAC.md`
- `backend/docs/DB_SCHEMA.md`
