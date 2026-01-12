# RBAC System Documentation

This document describes the Role-Based Access Control (RBAC) system enforced in the EcoStride backend.

## Permission Keys (41 Total)

All permissions are enforced at the route level via `RequirePermission(...)` middleware.

### CMS Permissions (14)
| Key | Description |
|-----|-------------|
| `cms.page.read` | Read CMS pages |
| `cms.page.write` | Create/update CMS pages |
| `cms.page.publish` | Publish CMS pages |
| `cms.post.read` | Read CMS posts |
| `cms.post.write` | Create/update CMS posts |
| `cms.post.publish` | Publish CMS posts |
| `cms.media.read` | Read media |
| `cms.media.write` | Create media |
| `cms.herostyle.read` | Read hero styles |
| `cms.herostyle.write` | Create/update hero styles |
| `cms.herostyle.disable` | Disable hero styles |
| `cms.settings.write` | Update CMS settings |
| `cms.waiver.read` | Read waivers |
| `cms.waiver.write` | Create/update waivers |

### Event Permissions (5)
| Key | Description |
|-----|-------------|
| `event.read` | Read events |
| `event.write` | Create/update events |
| `event.publish` | Publish events |
| `event.category.write` | Manage event categories |
| `event.formfields.write` | Manage event form fields |

### Registration Permissions (3)
| Key | Description |
|-----|-------------|
| `registration.read` | Read registrations |
| `registration.write` | Update registrations |
| `registration.cancel` | Cancel registrations |

### Payment & Finance Permissions (4)
| Key | Description |
|-----|-------------|
| `payment.read` | Read payments |
| `payment.refund` | Refund payments |
| `finance.reconcile.import` | Import reconciliation data |
| `finance.export` | Export finance data |

### Bib & Results Permissions (4)
| Key | Description |
|-----|-------------|
| `bib.assign.auto` | Auto-assign bibs |
| `bib.assign.manual` | Manual bib assignment |
| `results.import` | Import results |
| `results.publish` | Publish results |

### Sponsor Permissions (2)
| Key | Description |
|-----|-------------|
| `sponsor.read` | Read sponsors |
| `sponsor.write` | Create/update sponsors |

### Volunteer Permissions (4)
| Key | Description |
|-----|-------------|
| `volunteer.read` | Read volunteers |
| `volunteer.assign` | Assign volunteers |
| `volunteer.communicate` | Communicate with volunteers |
| `volunteer.export` | Export volunteer data |

### Shop Permissions (2)
| Key | Description |
|-----|-------------|
| `shop.read` | Read shop |
| `shop.write` | Manage shop |

### Access Control Permissions (3)
| Key | Description |
|-----|-------------|
| `checkin.access` | Check-in access |
| `user.manage` | Manage users and roles |
| `audit.read` | Read audit logs |

---

## Role Definitions

### SuperAdmin & OrgAdmin
All 41 permissions.

### Finance
- `payment.read`, `payment.refund`
- `finance.export`, `finance.reconcile.import`
- `registration.read`, `audit.read`

### EventOrganizer
- `event.read`, `event.write`, `event.publish`
- `event.category.write`, `event.formfields.write`
- `registration.read`, `registration.write`, `registration.cancel`
- `bib.assign.auto`, `bib.assign.manual`
- `results.import`, `results.publish`
- `checkin.access`

### ContentEditor
- All `cms.*` permissions (14 keys)

### VolunteerManager
- `volunteer.read`, `volunteer.assign`
- `volunteer.communicate`, `volunteer.export`

### ShopManager
- `shop.read`, `shop.write`
- `cms.media.read`, `cms.media.write`
- `payment.read`

### CheckInStaff
- `checkin.access`, `registration.read`

### Support
- `registration.read`, `payment.read`
- `cms.page.read`, `cms.post.read`, `cms.media.read`
- `audit.read`

---

## How RBAC is Enforced

1. **Route-level**: `RequirePermission("permission.key")` middleware in `routes.go`
2. **JWT Claims**: Permissions are embedded in the access token
3. **Check**: `rbac.HasPermission(claims.Permissions, required)` in middleware
