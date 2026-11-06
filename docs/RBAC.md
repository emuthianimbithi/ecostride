# RBAC

## Roles
- SuperAdmin
- OrgAdmin
- Finance
- EventOrganizer
- ContentEditor
- VolunteerManager
- ShopManager
- CheckInStaff
- Support

## Permissions (examples)
- cms.page.read/write/publish
- cms.post.read/write/publish
- cms.media.read/write/delete
- cms.waiver.read/write/publish
- event.read/write/publish
- event.category.write
- event.formfields.write
- registration.read/write/cancel
- payment.verify (check saved PesaPal status; Finance, OrgAdmin, SuperAdmin)
- payment.read
- payment.receipt.resend (Finance, OrgAdmin, SuperAdmin by default)
- payment.refund
- finance.reconcile.import
- finance.export
- bib.assign.auto
- bib.assign.manual
- results.import
- results.publish
- sponsor.read/write/publish
- volunteer.read/write/assign/communicate/export
- shop.fulfill (record merchandise handover; ShopManager, OrgAdmin and SuperAdmin seed defaults)
- shop.read/write
- checkin.access
- user.manage
- audit.read

## Enforcement
- Backend middleware: RequirePermission("...") for every admin endpoint.
- Frontend: hide menu + disable actions based on permissions returned from `/me`.

Both payment and registration receipt resend endpoints require payment.receipt.resend and a reason. They share saved-recipient delivery, pending-job deduplication and transactional auditing. Payment detail history requires payment.read.

Protected requests now reload the active account and current role permissions from the database. Removed grants take effect on the next request even with an unexpired JWT. Account status/password updates increment users.auth_version and revoke refresh tokens; previous access and refresh tokens stay invalid after re-enabling an account. Refresh rotation is transactional and single-use under concurrency. Requests already authorized and executing may complete before a permission change commits.

Race Day uses /admin/race-day/events and event-specific /entries endpoints, available to checkin.access, bib.assign.auto or bib.assign.manual. Lookup excludes email, phone, medical fields, payment amounts and provider references. Results are limited to 100 per search. Bib actions retain their separate permissions; check-in requires checkin.access; exports still require event.read. These are organization-wide grants; assignment of staff to specific events is not implemented.

Deployment: run the existing migration command to add users.auth_version before deploying the API. Deploy the frontend with it because the race desk endpoints and receipt reason contract changed. Populate payment.receipt.resend through reviewed role management. CheckInStaff seed defaults now grant only checkin.access; review existing deployed roles and remove unnecessary registration.read/finance grants explicitly. Do not run demo seeding against production data. Frontend permission menus update after profile reload; the API enforces current grants on every request.

Remaining hardening: browser credentials still use localStorage, privileged MFA is absent, and logout revokes the submitted refresh token while an access JWT remains valid until expiry (unless the account/password is changed). Cookie/session migration, full session logout, event-assigned access, broader audit redaction and end-to-end role testing remain separate work. These changes do not establish a complete production security review.
