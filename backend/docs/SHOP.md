# Shop

EcoStride uses a single `products` table for fundraising items (merch + donation-style items).

## Product fields
- `type`: use to distinguish categories (e.g. `MERCH`, `DONATION_TIER`, etc.)
- `price_*_minor`: per-currency prices (minor units)
- `allow_custom_amount`: if true, client may send `custom_amount_minor` at checkout
- `primary_image_media_id`: optional media reference; API returns `image_url`/`image_alt`

## Public endpoints
- `GET /api/v1/public/shop/products` (active products)
- `POST /api/v1/public/shop/orders`
- `POST /api/v1/public/shop/orders/:id/pay/stripe`
- `POST /api/v1/public/shop/orders/:id/pay/mpesa`

## Admin endpoints
- `GET/POST /api/v1/admin/products`
- `PUT/DELETE /api/v1/admin/products/:id`
- `GET /api/v1/admin/orders`

## Notes
- `payment_status` on orders is normalized to canonical statuses documented in `backend/docs/PAYMENTS.md`.

