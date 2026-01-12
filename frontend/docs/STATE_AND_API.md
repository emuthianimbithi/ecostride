# State + API patterns

Use `frontend/lib/api-client.ts` for client-side API calls:
- `apiGet<T>(path)`
- `apiPost<T>(path, body)`
- `apiPut<T>(path, body)`
- `apiDelete<T>(path)`
- `apiFetch<T>(path, init)` for FormData uploads
- `apiFetchResponse(path, init)` for downloads (CSV/XLSX/PDF)

Errors:
- HTTP failures throw `ApiError` with `status`, `code`, `message`, and optional `details`.
- Components should catch and call `toastApiError(...)`.

## Normalization adapters

Some backend endpoints may return legacy/mixed shapes. Keep UI components clean by normalizing at the boundary:
- Volunteers: `frontend/lib/normalize-volunteer.ts` (handles `preferences` object vs array).
- Sponsors: `frontend/lib/normalize-sponsor.ts` (handles `tier_name` vs nested tier, `logo_url` vs media references).
- Shop products: `frontend/lib/normalize-product.ts` (handles snake_case vs legacy field names).
