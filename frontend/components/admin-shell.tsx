"use client"

import Link from "next/link"
import { useAuth } from "./auth-provider"
import { EcoStrideLogo } from "./ecostride-logo"

import { adminNavGroups, canAccessAdminItem, type NavItem } from "../lib/admin-nav"

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, hasPermission } = useAuth()
  const canAccess = (item: NavItem) => {
    return canAccessAdminItem(user ? { roles: user.roles, permissions: user.permissions } : null, item)
  }

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-white/70">
      <aside className="border-r border-slate-200 bg-white/80 px-4 py-6">
        <div className="text-xs uppercase tracking-[0.3em] text-tide">Admin</div>
        <div className="mt-2 flex items-center gap-2 text-forest">
          <EcoStrideLogo textClassName="text-lg" />
        </div>
        <div className="mt-6 space-y-6 text-sm">
          {adminNavGroups.map((group) => {
            const visibleItems = group.items.filter((item) => canAccess(item))
            if (visibleItems.length === 0) return null
            return (
              <div key={group.label}>
                <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{group.label}</div>
                <div className="mt-2 space-y-1">
                  {visibleItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </aside>
      <section className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {loading ? "Loading user..." : user ? `Signed in as ${user.name}` : "Not signed in"}
          </div>
          <a className="text-sm font-medium text-forest" href="/admin/login">
            Switch account
          </a>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  )
}
