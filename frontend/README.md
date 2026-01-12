# EcoStride Frontend (Next.js)

EcoStride’s frontend is a Next.js App Router app with:
- Public site (events, registration, support/donations)
- Admin UI (CMS, events, sponsors, finance, results import, reconciliation)

## Tech stack
- Next.js: `14.1.0`
- React: `18.2`
- TypeScript: `5.x`
- Forms: `react-hook-form` + `zod`
- Tests: `vitest` + `@testing-library/react`
- E2E: `playwright`

## API Contract
- **Case Style:** `snake_case` keys are expected from the API and preserved throughout the app.
- **No Automatic Conversion:** The `api-client` does **not** convert keys to camelCase. Components must use snake_case properties (e.g., `user.first_name`, NOT `user.firstName`).
- **Normalizers:** Any data normalization (e.g. `normalizeProduct`) must return types with `snake_case` keys to match the schema.

## Local setup
1. Copy env:
   - `frontend/.env.local.example` → `frontend/.env.local`
2. Install + run:
   - `cd frontend && npm install`
   - `cd frontend && npm run dev`

API base URL is configured via `NEXT_PUBLIC_API_BASE` (defaults to `http://localhost:8080/api/v1`).

## Tests / build
- Unit: `cd frontend && npm run test`
- E2E: `cd frontend && npm run test:e2e`
- Build: `cd frontend && npm run build`

## Folder structure
- `frontend/app/`: routes (public + admin)
- `frontend/components/`: shared UI components (includes toast system)
- `frontend/lib/`: API client wrappers and utilities
- `frontend/tests/`: unit tests
- `frontend/e2e/`: Playwright tests

## Error handling (toasts)

All API failures should display a bottom toast.

Implementation:
- API wrapper: `frontend/lib/api-client.ts`
  - Throws `ApiError` for HTTP failures using the backend error contract
- Toast helper: `frontend/lib/toast-api-error.ts`
  - `toastApiError(toast, err)` maps errors to a consistent toast message

### Developer guide: add a new API call (with auto-toasts)
1. Use `apiGet/apiPost/apiPut/apiDelete/apiFetch` from `frontend/lib/api-client.ts`.
2. In the client component, get the toast function:
   - `const { toast } = useToast()`
3. Wrap the call:
   - `try { ... } catch (err) { toastApiError(toast, err) }`

See `frontend/docs/TOAST_ERRORS.md` for the rules and mapping.

## Permission-aware UI

The admin UI is permission-gated at multiple levels:

### Menu visibility
`lib/admin-nav.ts` defines nav items with `permission` fields. The `canAccessAdminItem()` helper filters menu items based on the user's permissions from `/api/v1/me`.

### Dashboard widgets
`app/admin/dashboard/page.tsx` defines widgets with `permission` requirements. Only widgets for which the user has permission are rendered, and API calls are skipped for hidden widgets.

### Testing with different seed modes
Backend provides 3 seed modes for testing:
- `make seed-local` — Rich dataset, all features populated
- `make seed-demo` — Polished client-facing data
- `make seed-onboarding` — Minimal setup

Login with different role accounts to test permission gating:
- `admin@ecostride.local` — SuperAdmin (all permissions)
- `finance@ecostride.local` — Finance (payments, finance only)
- `organizer@ecostride.local` — EventOrganizer (events, registrations)
- `content@ecostride.local` — ContentEditor (CMS only)

