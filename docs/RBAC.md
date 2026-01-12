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
- payment.read
- payment.refund
- finance.reconcile.import
- finance.export
- bib.assign.auto
- bib.assign.manual
- results.import
- results.publish
- sponsor.read/write/publish
- volunteer.read/write/assign/communicate/export
- shop.read/write
- checkin.access
- user.manage
- audit.read

## Enforcement
- Backend middleware: RequirePermission("...") for every admin endpoint.
- Frontend: hide menu + disable actions based on permissions returned from `/me`.
