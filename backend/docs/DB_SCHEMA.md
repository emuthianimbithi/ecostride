# Database schema (summary)

The schema is defined by GORM models in `backend/internal/common/models/models.go`.

Key tables (non-exhaustive):
- `users`, `roles`, `permissions`, join tables (`user_roles`, `role_permissions`)
- `pages`, `posts`, `categories`, `tags`
- `media` (uploaded objects; `url` may be empty and derived from storage provider)
- `events`, `event_categories`, `event_form_fields`
- `registrations`
- `payments`, `payment_events`
- `results` (imported rows) and publish flags on events
- `bank_imports`, reconciliation match tables

For an ERD overview see `docs/ERD.md` at the repo root.

