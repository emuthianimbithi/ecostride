# EcoStride Final Build Execution

This file maps the final build plan to the current repository and tracks implementation status.

## Status Legend

- `DONE`: implemented in repo
- `IN PROGRESS`: partially implemented
- `TODO`: not yet implemented

## Phase 0 — Foundations

- `DONE` UI kit folder scaffolded at `frontend/components/ui` with:
  - `button`, `input`, `select`, `textarea`, `card`, `table`, `dialog`, `toast`, `badge`, `empty-state`, `skeleton`, `tabs`, `stepper`
- `DONE` Shared utility `frontend/lib/cn.ts` for class merging.
- `DONE` Design tokens expanded in:
  - `frontend/tailwind.config.ts`
  - `frontend/app/globals.css`
  Includes tide/forest/sun/sand 50–900 scales + semantic aliases (`surface`, `text-strong`, `danger`, `success`, `warning`).
- `DONE` Palette rules documented in `frontend/docs/PALETTE.md` for consistent public/admin usage.
- `DONE` Typography scale locked in Tailwind (`display-xl`, `display-lg`, `h1`–`h4`, `body`, `caption`) with Playfair Display + Space Grotesk.
- `DONE` Accessibility baseline in global styles:
  - focus-visible outline
  - `prefers-reduced-motion` guard
- `IN PROGRESS` i18n scaffolding:
  - `frontend/messages/en.json`
  - `frontend/messages/sw.json`
  - `frontend/lib/i18n.ts`
  Next step: wire into Next app router with `next-intl`.

## Phase 1 — Public Site

- `IN PROGRESS` Home rebuilt with:
  - full-bleed hero video + estuary gradient overlay
  - impact stat band (currently API-derived counts; not CMS-editable yet)
  - three-pillar block with custom SVG icons (wave / mangrove / science)
  - featured event card + registration-close countdown
  - gallery mosaic previews + 3-card blog teaser
  - wave SVG section dividers + motion-safe reveal utility
- `DONE` Events list redesigned with card badges:
  - distance badge (inferred from title where present)
  - eco-cause tag by event type
  - registration-close countdown pill
  - location pin + date emphasis
- `DONE` Event detail redesigned with:
  - sticky right-rail registration card (starting fee + category prices)
  - course/estuary map slot
  - event impact block
  - sponsor strip
- `IN PROGRESS` Registration flow upgrades:
  - visible 5-step stepper component
  - IndexedDB per-event autosave/hydrate (`registration_drafts` store)
  - inline validation + submit error summary panel
  - Stripe / M-Pesa payment selector cards
  - floating labels polish completed for core athlete/extras/payment fields
- `DONE` Confirmation shareable impact card added on confirmation page.
- `DONE` Footer enhancements shipped:
  - newsletter signup flow with endpoint-attempt + local queue fallback
  - partner strip sourced from sponsor API
  - social links + legal links cleanup
  - EN/SW language preference selector (local persistence, pre-next-intl wiring)

## Phase 2 — Admin Robustness

- `DONE` Admin shell upgrades:
  - tide-tinted sidebar with active-state styling
  - desktop collapse toggle + mobile drawer navigation
  - environment badge (`LOCAL` / `STAGING` / `PROD`) in top bar
  - user role chips in header
- `DONE` ⌘K quick-search modal across key admin routes, including events / registrations / payments shortcuts.
- `DONE` Dashboard overhaul:
  - KPI cards (registrations today, 7-day revenue by currency, outstanding payments, volunteers confirmed)
  - 7-day trend sparklines (registrations and successful payments)
  - payment-status donut visualization
  - "Needs attention" panel (failed payments, unassigned bibs, pending reconciliation)
- `DONE` Table controls (implemented on registrations):
  - saved filter chips (local presets)
  - column visibility toggles
  - CSV/XLSX export kept in-table workflow
  - bulk select + bulk cancel action behind typed-confirm
- `DONE` Safety rails (implemented across registrations/events):
  - typed-confirm modals for destructive cancel/delete actions
  - inline audit trail hints per entity row (latest action + age)
  - confirm dialogs replaced `window.confirm` destructive flow
- `DONE` Sticky save bar + draft autosave for long forms:
  - blog post editor (`admin/cms/posts`) local draft autosave + `⌘S/Ctrl+S` + sticky save bar
  - event create form (`admin/events`) local draft autosave + `⌘S/Ctrl+S` + sticky save bar
- `DONE` Media manager upgrade:
  - functional media manager page (`admin/cms/media`) with drag/drop bulk upload
  - required alt text for uploads
  - entity assignment metadata fields (event/post/gallery)
  - server-side variant/poster behavior documented in-page and wired for backend support

## Phase 3 — Cross-Cutting Polish

- `DONE` SMTP email pipeline with template rendering:
  - multipart text+HTML email sending (`SendRich`)
  - registration confirmation templating (`RenderRegistrationConfirmation`)
  - env-driven SMTP config expanded (`SMTP_PORT`, `SMTP_FROM`)
- `DONE` Local variant image pipeline alignment:
  - frontend cache policy for `/media/*` set to immutable long-cache in Next headers
  - uploader and media manager aligned to alt-text + bulk upload workflows for variant generation paths
- `DONE` Standardized `DataState` wrapper:
  - reusable component added at `frontend/components/data-state.tsx`
  - applied to admin finance and media views
- `DONE` Performance pass:
  - route-level loading states added (`/events`, `/blog`, `/admin`)
  - hover prefetch maintained on event/navigation links
  - ISR/revalidate usage retained on public data-fetching pages (home/blog/gallery/event detail)
- `DONE` Accessibility pass:
  - alt text required in media upload workflows
  - toast/live status semantics preserved
  - focus/keyboard navigation controls added across new dialogs, toggles, and command flows

## Phase 4 — Ongoing Quality

- `TODO` Storybook
- `TODO` Playwright visual diff coverage
- `TODO` Lighthouse CI budgets

## Deployment/Infra Alignment

- `IN PROGRESS` Docker compose exists at repo root, but needs explicit final services alignment (`web`, `api`, `db`, `nginx`, `certbot`) and healthcheck/migration ordering validation.
- `TODO` Droplet hardening and backup scripts verification against final checklist.
