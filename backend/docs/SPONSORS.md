# Sponsors

## Public sponsors response shape

`GET /api/v1/public/sponsors` returns an array of:
- `slug` (uuid string)
- `url_slug` (string)
- `name` (string)
- `description` (string)
- `website_url` (string)
- `is_featured` (bool)
- `display_order` (int)
- `tier_name` (string|null)
- `tier_priority` (int|null)
- `logo_url` (string|null)
- `logo_alt` (string|null)

Notes:
- If `logo_url` is empty but a legacy local `media.path` exists, the API resolves it via the configured storage provider.

## Admin sponsors response shape

`GET /api/v1/admin/sponsors` returns an array of:
- `slug`, `url_slug`, `name`, `description`, `website_url`, `is_featured`, `display_order`
- `tier_slug`, `tier_name`, `tier_priority`
- `logo_media_id`, `logo_url`, `logo_alt`
- `placements`: `{ location_key, event_slug?, event_title? }[]`

