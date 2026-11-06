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


## Public storefront and support

`/shop` is the merchandise storefront and `/support` is the restored Support us / Virtual participation page. `/merch` redirects to `/shop`. Header/footer links and the homepage make both visible. Existing DONATION_TIER products remain compatible and appear as support contributions; administrators can also create VIRTUAL_PARTICIPATION products. Virtual support uses orders and receipts; it does not create a race entry or promise a race-day bib. Each purchase selects one product/quantity, collects name/email/phone, and uses PesaPal checkout. There is no account or multi-item cart UI. Only active products are shown; no sample inventory is published automatically. Merch images/prices/stock come from the admin product catalogue. Use separate product SKUs for sizes or variants where needed.

Checkout is visible but disabled until the backend advertises enabled PesaPal. Products remain browsable during setup. The common PesaPal endpoint accepts order_slug. The client keeps its creation/payment keys and order reference when retrying the same checkout after an error, and records local order amounts in minor units.

## Order and inventory guarantees

Public order creation now requires X-Idempotency-Key. Matching key/body returns the same reference. A changed body conflicts, without exposing another buyer's details. Custom amounts override a preset price only when the product explicitly permits them; fixed merchandise prices cannot be overridden. Quantities, positive amounts and integer overflow are checked server-side. Order creation locks stock rows in product-ID order, reserves stock and saves item name/type/price snapshots plus a reservation-expiry job in one transaction. Concurrent buyers cannot reserve more than the stored stock.

Unpaid reservations expire after 30 minutes and the worker restores stock once before marking the order cancelled. A paid order is not expired. The worker must run; failed jobs need operational monitoring. Payment claiming rejects an expired reservation even if the expiry job is delayed. Money confirmed after reservation expiry/cancellation is flagged for finance review, without granting fulfillment. Do not hand over items or automatically charge again in that case. Inventory restocking after refunds is not automatic.

## Race-day confirmation and handover

Participants use the Race Day workspace: find the registration by name/bib/reference, verify eligibility, then record check-in and bib/pack collection. The API rejects pending/cancelled/refunded entries and requires a successful payment for a paid category. Bib collection also requires an assignment. Duplicate check-in calls preserve the original timestamps and audit once. Free confirmed entries remain eligible.

Merchandise desk staff use Admin → Shop → Orders. Ask for the paid order reference or receipt and confirm the buyer name. Search by buyer name, email or order UUID; inspect the purchased items and quantities. Receipts now include the order reference. Mark collected records handover once with actor/time/audit, and requires shop.fulfill. The API additionally checks a paid order, matching successful amount/currency and merchandise content. Support-only, unpaid and refunded orders cannot be collected. Collections are per order, with no partial handover workflow. Permission is seeded for ShopManager and full admins; grant shop.read plus shop.fulfill to other designated desk staff through reviewed role management.

Run migrations before deploying: orders gain checkout-key/fingerprint, reservation and collection fields; order items gain historical name/type fields. Register the order.expire worker handler through the standard API startup. Existing orders without an expiry remain unchanged, and historical item details fall back to current product names/types until a snapshot exists.
