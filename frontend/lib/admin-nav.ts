export type AuthUser = {
  roles: string[]
  permissions: string[]
}

export type NavItem = {
  label: string
  href: string
  permission?: string | string[]
  roles?: string[]
}

export const adminNavGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/admin/dashboard" }]
  },
  {
    label: "Content",
    items: [
      { label: "Site Pages", href: "/admin/cms/pages", permission: "cms.page.read" },
      { label: "Blog & Media", href: "/admin/cms/posts", permission: "cms.post.read" },
      { label: "Media Library", href: "/admin/cms/media", permission: "cms.media.read" },
      { label: "Gallery Albums", href: "/admin/cms/gallery", permission: "cms.media.read" },
      { label: "Hero Styles", href: "/admin/cms/hero-styles", permission: "cms.herostyle.read" }
    ]
  },
  {
    label: "Events",
    items: [
      { label: "Events", href: "/admin/events", permission: "event.read" },
      { label: "Registrations", href: "/admin/registrations", permission: "registration.read" },
      { label: "Payments", href: "/admin/payments", permission: "payment.read" },
      { label: "Race Day", href: "/admin/bibs", permission: ["bib.assign.auto", "bib.assign.manual", "checkin.access"] },
      { label: "Results", href: "/admin/results", permission: "results.import" },
      { label: "Waivers", href: "/admin/cms/waivers", permission: "cms.waiver.read" }
    ]
  },
  {
    label: "Finance",
    items: [
      { label: "Finance", href: "/admin/finance", permission: "finance.export" },
      { label: "Reconciliation", href: "/admin/reconciliation", permission: "finance.reconcile.import" }
    ]
  },
  {
    label: "Community",
    items: [
      { label: "Sponsors", href: "/admin/sponsors", permission: "sponsor.read" },
      { label: "Volunteers", href: "/admin/volunteers", permission: "volunteer.read" }
    ]
  },
  {
    label: "Fundraising",
    items: [{ label: "Shop", href: "/admin/shop", permission: "shop.read" }]
  },
  {
    label: "Access",
    items: [
      { label: "Users & Roles", href: "/admin/users-roles", permission: "user.manage" },
      { label: "Audit Trail", href: "/admin/audit", permission: "audit.read" }
    ]
  }
]

export function canAccessAdminItem(user: AuthUser | null, item: NavItem): boolean {
  if (!user) return false

  if (item.roles && item.roles.length > 0) {
    const userRoles = user.roles ?? []
    const hasRole = item.roles.some((r) => userRoles.includes(r))
    if (!hasRole) return false
  }

  const permission = item.permission
  if (!permission || (Array.isArray(permission) && permission.length === 0)) return true
  const perms = user.permissions ?? []
  if (Array.isArray(permission)) {
    return permission.some((p) => perms.includes(p))
  }
  return perms.includes(permission)
}

export function firstAllowedAdminRoute(user: AuthUser | null): string | null {
  if (!user) return null
  for (const group of adminNavGroups) {
    for (const item of group.items) {
      if (canAccessAdminItem(user, item)) return item.href
    }
  }
  return null
}
