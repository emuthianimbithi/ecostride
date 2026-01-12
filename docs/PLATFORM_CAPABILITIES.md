# EcoStride Platform Capabilities

This document outlines what the EcoStride platform currently supports.

---

## 1. Multi-Event Management

- Dynamic event creation (marathons, cleanups, seminars, awareness campaigns)
- Event categories with custom branding
- Configurable registration forms with custom fields
- Waiver consent tracking with timestamps

## 2. Public Website & CMS

- Static pages (About, Contact, FAQ, Privacy Policy)
- Blog/news with categories and featured images
- Media gallery with tagged photos and videos
- SEO controls (meta titles, descriptions, Open Graph)
- Sponsor showcase pages

## 3. Registration & Payments

- **M-Pesa**: STK Push integration
- **Stripe**: Credit/debit card support
- Multi-currency pricing (KES, USD, EUR)
- Real-time transaction status tracking (pending, success, failed, refunded)
- Idempotency handling to prevent duplicate charges

## 4. Electronic Receipts

- Automatic email receipts on payment confirmation
- Receipt archive accessible via admin panel

## 5. Finance & Reporting

- Finance dashboard with revenue and registration metrics
- CSV exports for registrations, payments, and reconciliation
- Bank statement import and payment matching

## 6. Bib Assignment & Check-In

- Automatic bib assignment by sequence or category
- Manual bib overrides
- Start list generation and export
- Check-in operations with barcode/QR support

## 7. Results Management

- CSV import from timing providers
- Results review and publication workflow
- Public results pages with search by name, bib, or category

## 8. Sponsors & Partners

- Sponsor tiers (Platinum, Gold, Silver, etc.)
- Sponsor profile pages with logo, description, website
- Configurable placements (homepage, event pages, footer)
- Basic impression tracking

## 9. Volunteer Management

- Public volunteer signup with role/shift preferences
- Assignment to tasks, locations, and time slots
- Bulk email communications
- Attendance tracking
- Roster exports

## 10. Fundraising: Merch & Donations

- Merchandise listings with images and pricing
- Donation tiers with predefined or custom amounts
- Cause-based donation campaigns
- Order and payment status tracking

## 11. Administration & Security

- **RBAC**: 8 roles, 41 permissions
- Audit logs for all admin actions
- JWT-based authentication
- Password complexity enforcement

## 12. API

- RESTful endpoints under `/api/v1/...`
- Consistent `snake_case` responses
- OpenAPI specification available

---

## Roles

| Role | Access |
|------|--------|
| SuperAdmin / OrgAdmin | Full access |
| Finance | Payments, refunds, reconciliation, exports |
| EventOrganizer | Events, registrations, bibs, results, check-in |
| ContentEditor | CMS (pages, posts, media, waivers) |
| VolunteerManager | Volunteer assignments and communications |
| ShopManager | Products, orders, media |
| CheckInStaff | Check-in and registration lookup |
| Support | Read-only access for troubleshooting |
