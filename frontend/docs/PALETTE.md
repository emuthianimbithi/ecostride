# EcoStride Palette (Estuary System)

## Palette Roles

- `tide` (brand primary): trust, action, navigation, CTAs.
- `forest` (impact positive): restoration outcomes, success states, environmental metrics.
- `sun` (accent/energy): highlights, countdown urgency, warnings.
- `sand` (neutral warmth): page surfaces, dividers, calm backgrounds.

## Semantic Tokens

- `primary` → `tide-700`
- `secondary` → `sand-100`
- `success` → forest-derived green
- `warning` → sun-derived amber
- `danger` → high-contrast red
- `surface` / `card` / `background` use warm sand-biased neutrals.

## Usage Rules

- Primary actions: use `bg-primary` with `text-primary-foreground`.
- Positive impact metrics: use `forest-*` or `success`.
- Use `sun-*` only for accents, urgency, and highlights; avoid large full-sun backgrounds.
- Body copy should stay on `foreground`; reserve `text-strong` for hero headlines and key KPIs.
- Keep decorative gradients low saturation so media and race photography stay dominant.

## Contrast Baseline

- Body text combinations target WCAG AA contrast.
- Focus style uses `--ring` from `sun-600` for visible keyboard navigation.
- Muted text uses a darker neutral (`--muted-foreground`) to avoid low-contrast gray-on-sand.
