"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { apiFetchResponse, apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { Download, Eye, Mail, Receipt, Settings2, X, XCircle } from "lucide-react"
import { TypedConfirmDialog } from "../../../components/ui/typed-confirm-dialog"

type Registration = {
  slug: string
  athlete_name: string
  email: string
  phone: string
  status: string
  event_slug: string
  event_title: string
  event_start_at: string
  event_type: string
  category_name?: string
  bib_number?: number
  payment_status?: string
  payment_amount_minor?: number
  payment_currency?: string
  payment_provider?: string
  checked_in_at?: string
  created_at: string
}

type Event = {
  slug: string
  url_slug: string
  title: string
  start_at: string
}

type AuditLog = {
  Slug?: string
  ActorUserID?: number
  ActionKey?: string
  EntityType?: string
  EntityID?: string
  CreatedAt?: string
  slug?: string
  actor_user_id?: number
  action_key?: string
  entity_type?: string
  entity_id?: string
  created_at?: string
}

type ColumnKey = "athlete" | "event" | "category" | "payment" | "bib" | "status" | "created"

type FilterPreset = {
  id: string
  label: string
  filters: {
    event_slug: string
    status: string
    search: string
  }
}

const statusLabels: Record<string, string> = {
  created: "Created",
  pending_payment: "Pending payment",
  paid: "Paid",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  refunded: "Refunded"
}

const allColumns: Array<{ key: ColumnKey; label: string }> = [
  { key: "athlete", label: "Athlete" },
  { key: "event", label: "Event" },
  { key: "category", label: "Category" },
  { key: "payment", label: "Payment" },
  { key: "bib", label: "Bib" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" }
]

const defaultVisibleColumns: Record<ColumnKey, boolean> = {
  athlete: true,
  event: true,
  category: true,
  payment: true,
  bib: true,
  status: true,
  created: true
}

const presetsStorageKey = "admin_registrations_filter_presets"

const formatMoney = (currency?: string, minor?: number) => {
  if (!currency || minor == null) return "-"
  const value = minor / 100
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

const formatRelativeTime = (value?: string) => {
  if (!value) return "Unknown time"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown time"
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / (1000 * 60))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function normalizeAudit(log: AuditLog) {
  return {
    action: String(log.action_key ?? log.ActionKey ?? ""),
    entityType: String(log.entity_type ?? log.EntityType ?? ""),
    entityId: String(log.entity_id ?? log.EntityID ?? ""),
    createdAt: String(log.created_at ?? log.CreatedAt ?? ""),
    actorId: Number(log.actor_user_id ?? log.ActorUserID ?? 0)
  }
}

function RegistrationsPageInner() {
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [items, setItems] = useState<Registration[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [auditMap, setAuditMap] = useState<Record<string, { action: string; createdAt: string; actorId: number }>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [cancelTarget, setCancelTarget] = useState<Registration | null>(null)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(defaultVisibleColumns)
  const [savedPresets, setSavedPresets] = useState<FilterPreset[]>([])

  const [filters, setFilters] = useState({
    event_slug: "",
    status: "all",
    search: ""
  })
  const [filterErrors, setFilterErrors] = useState<Record<string, string>>({})

  const selectedSlugs = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([slug]) => slug),
    [selected]
  )

  const loadEvents = async () => {
    try {
      const data = await apiGet<Event[]>("/admin/events")
      setEvents(Array.isArray(data) ? data : [])
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load events")
    }
  }

  const loadAudit = async () => {
    try {
      const logs = await apiGet<AuditLog[]>("/admin/audit-logs?limit=300")
      const normalized = (Array.isArray(logs) ? logs : []).map(normalizeAudit)
      const byRegistration: Record<string, { action: string; createdAt: string; actorId: number }> = {}
      normalized.forEach((log) => {
        if (log.entityType !== "registration") return
        if (!log.entityId) return
        if (!byRegistration[log.entityId]) {
          byRegistration[log.entityId] = {
            action: log.action,
            createdAt: log.createdAt,
            actorId: log.actorId
          }
        }
      })
      setAuditMap(byRegistration)
    } catch {
      // non-blocking
    }
  }

  const loadRegistrations = async () => {
    setError(null)
    const params = new URLSearchParams()
    if (filters.event_slug) params.set("event_slug", filters.event_slug)
    if (filters.status !== "all") params.set("status", filters.status)
    if (filters.search.trim()) params.set("search", filters.search.trim())

    try {
      const data = await apiGet<Registration[]>(`/admin/registrations?${params.toString()}`)
      const rows = Array.isArray(data) ? data : []
      setItems(rows)
      setSelected((prev) => {
        const next: Record<string, boolean> = {}
        rows.forEach((row) => {
          if (prev[row.slug]) next[row.slug] = true
        })
        return next
      })
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load registrations")
    }
  }

  useEffect(() => {
    void loadEvents()
    void loadAudit()
    try {
      const raw = localStorage.getItem(presetsStorageKey)
      const parsed = raw ? (JSON.parse(raw) as FilterPreset[]) : []
      if (Array.isArray(parsed)) setSavedPresets(parsed)
    } catch {
      setSavedPresets([])
    }
  }, [])

  useEffect(() => {
    const eventParam = searchParams.get("event")
    if (eventParam && !filters.event_slug) {
      setFilters((prev) => ({ ...prev, event_slug: eventParam }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadRegistrations()
    }, 800)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.event_slug, filters.status, filters.search])

  const filtered = useMemo(() => items, [items])

  const setFilterErr = (k: string, msg?: string) => {
    setFilterErrors((prev) => {
      const next = { ...prev }
      if (!msg) delete next[k]
      else next[k] = msg
      return next
    })
  }

  const handleExport = async (format: "csv" | "xlsx") => {
    const params = new URLSearchParams()
    params.set("format", format)
    if (filters.event_slug) params.set("event_slug", filters.event_slug)
    if (filters.status !== "all") params.set("status", filters.status)
    if (filters.search.trim()) params.set("search", filters.search.trim())
    try {
      const res = await apiFetchResponse(`/admin/registrations/export?${params.toString()}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `registrations-export.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Export failed")
    }
  }

  const handleAction = async (path: string, successMessage: string) => {
    setError(null)
    setStatus(null)
    try {
      await apiPost(path, {})
      setStatus(successMessage)
      await Promise.all([loadRegistrations(), loadAudit()])
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Action failed")
    }
  }

  const saveCurrentFiltersAsPreset = () => {
    const name = window.prompt("Preset name")
    if (!name || !name.trim()) return
    const newPreset: FilterPreset = {
      id: `${Date.now()}`,
      label: name.trim(),
      filters: { ...filters }
    }
    const next = [newPreset, ...savedPresets].slice(0, 10)
    setSavedPresets(next)
    try {
      localStorage.setItem(presetsStorageKey, JSON.stringify(next))
    } catch {
      // ignore
    }
    toast({ title: "Filter saved", description: `Saved as "${newPreset.label}".`, variant: "success" })
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Registrations</h1>
        <p className="text-sm text-slate-600">See who registered, what they signed up for, and their payment status.</p>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <select
            value={filters.event_slug}
            onChange={(e) => setFilters((p) => ({ ...p, event_slug: e.target.value }))}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm"
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.slug} value={event.url_slug}>
                {event.title} ({event.start_at ? new Date(event.start_at).toLocaleDateString() : "TBD"})
              </option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="pending_payment">Pending payment</option>
            <option value="paid">Paid</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <div className="flex flex-col">
            <input
              value={filters.search}
              onChange={(e) => {
                const v = e.target.value
                setFilters((p) => ({ ...p, search: v }))
                if (filterErrors.search) setFilterErr("search", undefined)
              }}
              onBlur={() => {
                if (filters.search.trim().length > 120) setFilterErr("search", "Search is too long (max 120 chars).")
                else setFilterErr("search", undefined)
              }}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm"
              placeholder="Search by athlete, email, or event"
            />
            {filterErrors.search ? <p className="mt-1 pl-4 text-xs text-rose-600">{filterErrors.search}</p> : null}
          </div>

          <button
            onClick={saveCurrentFiltersAsPreset}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            title="Save current filters"
          >
            <Settings2 className="h-4 w-4" />
            Save filter
          </button>

          <div className="relative">
            <button
              onClick={() => setShowColumnMenu((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              <Eye className="h-4 w-4" />
              Columns
            </button>
            {showColumnMenu && (
              <div className="absolute z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Visible columns</div>
                <div className="space-y-2">
                  {allColumns.map((column) => (
                    <label key={column.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={visibleColumns[column.key]}
                        onChange={(e) =>
                          setVisibleColumns((prev) => ({
                            ...prev,
                            [column.key]: e.target.checked
                          }))
                        }
                      />
                      {column.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => handleExport("csv")}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button
            onClick={() => handleExport("xlsx")}
            className="inline-flex items-center gap-2 rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
            title="Export XLSX"
          >
            <Download className="h-4 w-4" />
            XLSX
          </button>
        </div>

        {savedPresets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {savedPresets.map((preset) => (
              <div key={preset.id} className="inline-flex items-center gap-1 rounded-full border border-tide-200 bg-tide-50 px-2 py-1 text-xs text-tide-700">
                <button
                  onClick={() => setFilters({ ...preset.filters })}
                  className="font-semibold"
                  title={`Apply ${preset.label}`}
                >
                  {preset.label}
                </button>
                <button
                  onClick={() => {
                    const next = savedPresets.filter((item) => item.id !== preset.id)
                    setSavedPresets(next)
                    try {
                      localStorage.setItem(presetsStorageKey, JSON.stringify(next))
                    } catch {
                      // ignore
                    }
                  }}
                  className="rounded-full p-0.5 hover:bg-tide-100"
                  aria-label={`Remove ${preset.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedSlugs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-sm">
            <span className="font-semibold text-warning">{selectedSlugs.length} selected</span>
            <button
              onClick={() => setBulkConfirmOpen(true)}
              className="rounded-full bg-danger px-3 py-1.5 text-xs font-semibold text-white"
            >
              Cancel selected
            </button>
            <button
              onClick={() => setSelected({})}
              className="rounded-full border border-border px-3 py-1.5 text-xs"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((item) => selected[item.slug])}
                  onChange={(e) => {
                    const checked = e.target.checked
                    const next: Record<string, boolean> = {}
                    filtered.forEach((item) => {
                      if (checked && item.status !== "cancelled") next[item.slug] = true
                    })
                    setSelected(next)
                  }}
                  aria-label="Select all rows"
                />
              </th>
              {visibleColumns.athlete && <th className="px-4 py-3">Athlete</th>}
              {visibleColumns.event && <th className="px-4 py-3">Event</th>}
              {visibleColumns.category && <th className="px-4 py-3">Category</th>}
              {visibleColumns.payment && <th className="px-4 py-3">Payment</th>}
              {visibleColumns.bib && <th className="px-4 py-3">Bib</th>}
              {visibleColumns.status && <th className="px-4 py-3">Status</th>}
              {visibleColumns.created && <th className="px-4 py-3">Created</th>}
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const audit = auditMap[item.slug]
              return (
                <tr key={item.slug} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[item.slug])}
                      onChange={(e) =>
                        setSelected((prev) => ({
                          ...prev,
                          [item.slug]: e.target.checked
                        }))
                      }
                      disabled={item.status === "cancelled"}
                      aria-label={`Select ${item.slug}`}
                    />
                  </td>
                  {visibleColumns.athlete && (
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{item.athlete_name}</div>
                      <div className="text-xs text-slate-500">{item.email}</div>
                    </td>
                  )}
                  {visibleColumns.event && (
                    <td className="px-4 py-3 text-slate-600">
                      <div className="font-medium text-slate-800">{item.event_title}</div>
                      <div className="text-xs text-slate-500">
                        {item.event_start_at ? new Date(item.event_start_at).toLocaleDateString() : "TBD"}
                      </div>
                    </td>
                  )}
                  {visibleColumns.category && <td className="px-4 py-3 text-slate-600">{item.category_name ?? "-"}</td>}
                  {visibleColumns.payment && (
                    <td className="px-4 py-3 text-slate-600">
                      <div className="font-medium text-slate-800">{formatMoney(item.payment_currency, item.payment_amount_minor)}</div>
                      <div className="text-xs text-slate-500">
                        {item.payment_provider ?? "No payment"} • {item.payment_status ? item.payment_status : "pending"}
                      </div>
                    </td>
                  )}
                  {visibleColumns.bib && <td className="px-4 py-3 text-slate-600">{item.bib_number ?? "-"}</td>}
                  {visibleColumns.status && (
                    <td className="px-4 py-3 text-slate-600">
                      <div className="font-medium text-slate-800">{statusLabels[item.status] ?? item.status}</div>
                      <div className="text-xs text-slate-500">{item.checked_in_at ? "Checked in" : "Not checked in"}</div>
                      {audit ? (
                        <div className="mt-1 text-[11px] text-slate-400" title={`${audit.action} • actor ${audit.actorId}`}>
                          Last audit: {audit.action} • {formatRelativeTime(audit.createdAt)}
                        </div>
                      ) : null}
                    </td>
                  )}
                  {visibleColumns.created && (
                    <td className="px-4 py-3 text-slate-600">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : "-"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAction(`/admin/registrations/${item.slug}/resend-confirmation`, "Confirmation queued")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-forest transition hover:bg-slate-50"
                        aria-label="Resend confirmation"
                        title="Resend confirmation"
                      >
                        <Mail className="h-4 w-4" />
                      </button>

                      {item.payment_status === "success" && (
                        <button
                          onClick={() => handleAction(`/admin/registrations/${item.slug}/resend-receipt`, "Receipt queued")}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sky-600 transition hover:bg-slate-50"
                          aria-label="Resend receipt"
                          title="Resend receipt"
                        >
                          <Receipt className="h-4 w-4" />
                        </button>
                      )}

                      {item.status !== "cancelled" && (
                        <button
                          onClick={() => setCancelTarget(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-rose-600 transition hover:bg-slate-50"
                          aria-label="Cancel registration"
                          title="Cancel registration"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                  No registrations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cancelTarget && (
        <TypedConfirmDialog
          open={Boolean(cancelTarget)}
          title="Cancel registration"
          description={`This action will cancel registration ${cancelTarget.slug}. Type the registration slug to continue.`}
          requiredText={cancelTarget.slug}
          confirmLabel="Cancel registration"
          onClose={() => setCancelTarget(null)}
          onConfirm={async () => {
            await handleAction(`/admin/registrations/${cancelTarget.slug}/cancel`, "Registration cancelled")
            setCancelTarget(null)
          }}
        />
      )}

      <TypedConfirmDialog
        open={bulkConfirmOpen}
        title="Cancel selected registrations"
        description={`This will cancel ${selectedSlugs.length} selected registrations. Type CANCEL ALL to proceed.`}
        requiredText="CANCEL ALL"
        confirmLabel="Cancel selected"
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={async () => {
          for (const slug of selectedSlugs) {
            await apiPost(`/admin/registrations/${slug}/cancel`, {})
          }
          setStatus(`Cancelled ${selectedSlugs.length} registrations`)
          setSelected({})
          setBulkConfirmOpen(false)
          await Promise.all([loadRegistrations(), loadAudit()])
        }}
      />
    </main>
  )
}

export default function RegistrationsPage() {
  return (
    <Suspense fallback={null}>
      <RegistrationsPageInner />
    </Suspense>
  )
}
