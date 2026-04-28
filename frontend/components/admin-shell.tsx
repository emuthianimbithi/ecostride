"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Command, Menu, Search, X } from "lucide-react"
import { useAuth } from "./auth-provider"
import { EcoStrideLogo } from "./ecostride-logo"
import { adminNavGroups, canAccessAdminItem, type NavItem } from "../lib/admin-nav"

function getEnvLabel() {
  const raw =
    process.env.NEXT_PUBLIC_APP_ENV ??
    process.env.NEXT_PUBLIC_ENV ??
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.NODE_ENV ??
    "local"

  const value = String(raw).toUpperCase()
  if (value.includes("PROD")) return "PROD"
  if (value.includes("STAG")) return "STAGING"
  return "LOCAL"
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const canAccess = (item: NavItem) =>
    canAccessAdminItem(user ? { roles: user.roles, permissions: user.permissions } : null, item)

  const visibleNavGroups = useMemo(
    () =>
      adminNavGroups
        .map((group) => ({ ...group, items: group.items.filter((item) => canAccess(item)) }))
        .filter((group) => group.items.length > 0),
    [user]
  )

  const quickSearchItems = useMemo(() => {
    const flattened = visibleNavGroups.flatMap((group) =>
      group.items.map((item) => ({
        id: `${group.label}:${item.href}`,
        label: item.label,
        href: item.href,
        group: group.label
      }))
    )

    const globalEntityItems = [
      { id: "entity:events", label: "Search events", href: "/admin/events", group: "Quick Search" },
      { id: "entity:registrations", label: "Search registrations", href: "/admin/registrations", group: "Quick Search" },
      { id: "entity:payments", label: "Search payments", href: "/admin/payments", group: "Quick Search" }
    ]

    return [...globalEntityItems, ...flattened]
  }, [visibleNavGroups])

  const filteredSearchItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return quickSearchItems.slice(0, 12)
    return quickSearchItems
      .filter((item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q))
      .slice(0, 16)
  }, [quickSearchItems, searchQuery])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
      if (e.key === "Escape") {
        setSearchOpen(false)
        setMobileOpen(false)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setSearchOpen(false)
  }, [pathname])

  const envLabel = getEnvLabel()

  const sidebar = (
    <aside
      className={`h-full border-r border-tide-200 bg-gradient-to-b from-tide-50 via-sand-50 to-white px-3 py-4 transition-all ${
        collapsed ? "w-[84px]" : "w-[250px]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`${collapsed ? "hidden" : "block"} text-xs uppercase tracking-[0.3em] text-tide-700`}>
          Admin
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="hidden rounded-md border border-tide-200 bg-white p-1.5 text-tide-700 hover:bg-tide-50 lg:inline-flex"
          aria-label="Toggle sidebar collapse"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-forest-700">
        <EcoStrideLogo textClassName={collapsed ? "hidden" : "text-lg"} />
        {collapsed ? <span className="mx-auto text-sm font-semibold text-tide-700">ES</span> : null}
      </div>

      <div className="mt-6 space-y-5 text-sm">
        {visibleNavGroups.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <div className="px-2 text-[11px] uppercase tracking-[0.22em] text-tide-500">{group.label}</div>
            ) : null}
            <div className="mt-1 space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`block rounded-lg px-3 py-2 transition ${
                      active
                        ? "bg-tide-700 text-white shadow-sm"
                        : "text-slate-700 hover:bg-tide-100 hover:text-tide-800"
                    } ${collapsed ? "text-center text-xs" : ""}`}
                  >
                    {collapsed ? item.label.slice(0, 2).toUpperCase() : item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-sand-50/30">
      <div className="lg:hidden">
        <div className="flex items-center justify-between border-b border-border bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex rounded-md border border-border p-2 text-slate-700"
            aria-label="Open admin menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <EcoStrideLogo textClassName="text-base" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex rounded-md border border-border p-2 text-slate-700"
            aria-label="Open command search"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close admin menu backdrop"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[84%] max-w-[280px]">{sidebar}</div>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-[auto_1fr]">
        <div className="hidden lg:block">{sidebar}</div>

        <section className="px-4 py-4 md:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                aria-label="Open global search"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search admin</span>
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  <Command className="h-3 w-3" />K
                </span>
              </button>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  envLabel === "PROD"
                    ? "bg-danger/10 text-danger"
                    : envLabel === "STAGING"
                      ? "bg-warning/10 text-warning"
                      : "bg-success/10 text-success"
                }`}
              >
                {envLabel}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">
                {loading ? "Loading user..." : user ? `Signed in as ${user.name}` : "Not signed in"}
              </span>
              {user?.roles?.slice(0, 2).map((role) => (
                <span key={role} className="rounded-full border border-tide-200 bg-tide-50 px-2 py-0.5 text-xs font-medium text-tide-700">
                  {role}
                </span>
              ))}
              <a className="font-medium text-forest-700 hover:text-forest-800" href="/admin/login">
                Switch account
              </a>
            </div>
          </div>
          <div className="mt-5">{children}</div>
        </section>
      </div>

      {searchOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-[14vh]">
          <div className="w-full max-w-xl rounded-xl border border-border bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events, registrations, payments, pages..."
                className="w-full bg-transparent py-1 text-sm text-foreground outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[340px] overflow-auto p-2">
              {filteredSearchItems.length > 0 ? (
                filteredSearchItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{item.group}</span>
                  </Link>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">No matching admin route.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
