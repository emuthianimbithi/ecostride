# Architecture (high level)

## Modules
- `auth`: JWT login/refresh/logout, auth context
- `rbac`: roles/permissions enforcement
- `cms`: pages/posts/media + gallery
- `events`: events + categories + form fields
- `registrations`: public registration + admin management
- `payments`: Stripe + M-Pesa flows + webhooks
- `results`: CSV import + publish + public results endpoints
- `finance`: exports + reconciliation import/matching
- `audit`: admin action audit logging

## Request flow
- Gin router: `backend/internal/common/http/router.go`
- Routes: `backend/internal/common/http/routes.go`
- Auth middleware: adds `authClaims` to context, RBAC checks permissions
- Handlers call services (GORM) and return JSON

## RBAC + audit
- Admin routes require auth + permissions (see `backend/docs/RBAC.md`)
- Mutating admin actions are logged to `audit_entries`

