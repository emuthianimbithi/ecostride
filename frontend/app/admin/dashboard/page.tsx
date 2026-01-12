"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../../components/auth-provider"
import { apiGet } from "../../../lib/api-client"

type FinanceSummary = {
  Currency: string
  Status: string
  Count: number
  AmountMinor: number
}

type FinanceDashboard = {
  Summary: FinanceSummary[]
}

type Registration = {
  Slug: string
}

type Volunteer = {
  Slug: string
}

type Event = {
  Slug: string
  Title: string
}

type Sponsor = {
  Slug: string
}

type AuditLog = {
  ID: number
}

// Widget configuration with permission gating
type WidgetConfig = {
  id: string
  title: string
  permission: string
  loadData: () => Promise<unknown>
  render: (data: unknown) => { value: string; note: string }
}

export default function AdminDashboardPage() {
  const { user, hasPermission } = useAuth()
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Define widgets with their permissions
  const widgetConfigs: WidgetConfig[] = useMemo(
    () => [
      {
        id: "registrations",
        title: "Registrations",
        permission: "registration.read",
        loadData: () => apiGet<Registration[]>("/admin/registrations"),
        render: (data) => ({
          value: Array.isArray(data) ? data.length.toString() : "0",
          note: "Total registrations across all events"
        })
      },
      {
        id: "payments",
        title: "Payments",
        permission: "payment.read",
        loadData: () => apiGet<FinanceDashboard>("/admin/finance/dashboard"),
        render: (data) => {
          const dashboard = data as FinanceDashboard
          const success = (dashboard?.Summary ?? []).filter((r) => r.Status === "success")
          const totalCount = success.reduce((sum, row) => sum + row.Count, 0)
          const amounts = success.reduce<Record<string, number>>((acc, row) => {
            acc[row.Currency] = (acc[row.Currency] || 0) + row.AmountMinor
            return acc
          }, {})
          const detail = Object.entries(amounts)
            .map(([currency, amountMinor]) => `${currency} ${(amountMinor / 100).toFixed(2)}`)
            .join(" • ")
          return {
            value: totalCount.toString(),
            note: detail || "No successful payments yet"
          }
        }
      },
      {
        id: "volunteers",
        title: "Volunteers",
        permission: "volunteer.read",
        loadData: () => apiGet<Volunteer[]>("/admin/volunteers"),
        render: (data) => ({
          value: Array.isArray(data) ? data.length.toString() : "0",
          note: "Total volunteer signups"
        })
      },
      {
        id: "events",
        title: "Upcoming Events",
        permission: "event.read",
        loadData: () => apiGet<Event[]>("/admin/events"),
        render: (data) => ({
          value: Array.isArray(data) ? data.length.toString() : "0",
          note: "Events in the system"
        })
      },
      {
        id: "sponsors",
        title: "Sponsors",
        permission: "sponsor.read",
        loadData: () => apiGet<Sponsor[]>("/admin/sponsors"),
        render: (data) => ({
          value: Array.isArray(data) ? data.length.toString() : "0",
          note: "Active sponsors"
        })
      },
      {
        id: "audit",
        title: "Audit Feed",
        permission: "audit.read",
        loadData: () => apiGet<AuditLog[]>("/admin/audit-logs"),
        render: (data) => ({
          value: Array.isArray(data) ? data.length.toString() : "0",
          note: "Recent audit entries"
        })
      }
    ],
    []
  )

  // Filter widgets by permission
  const allowedWidgets = useMemo(
    () => widgetConfigs.filter((w) => hasPermission(w.permission)),
    [widgetConfigs, hasPermission]
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const results = await Promise.allSettled(
          allowedWidgets.map(async (widget) => {
            const data = await widget.loadData()
            return { id: widget.id, data }
          })
        )

        const newData: Record<string, unknown> = {}
        for (const result of results) {
          if (result.status === "fulfilled") {
            newData[result.value.id] = result.value.data
          }
        }
        setWidgetData(newData)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    }

    if (allowedWidgets.length > 0) {
      void load()
    } else {
      setLoading(false)
    }
  }, [allowedWidgets])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Welcome back{user ? `, ${user.name}` : ""}. Review activity snapshots for your permissions.
        </p>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="mt-4 h-6 w-16 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-32 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : allowedWidgets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          No dashboard widgets available for your permissions.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {allowedWidgets.map((widget) => {
            const data = widgetData[widget.id]
            const { value, note } = widget.render(data)
            return (
              <div key={widget.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{widget.title}</div>
                <div className="mt-2 text-2xl font-semibold text-forest">{value}</div>
                <div className="mt-2 text-xs text-slate-500">{note}</div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
