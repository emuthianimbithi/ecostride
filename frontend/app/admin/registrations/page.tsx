"use client"

import { Suspense } from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { apiFetchResponse, apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"

type Registration = {
  Slug: string
  AthleteName: string
  Email: string
  Phone: string
  Status: string
  EventSlug: string
  EventTitle: string
  EventStartAt: string
  EventType: string
  CategoryName?: string
  BibNumber?: number
  PaymentStatus?: string
  PaymentAmountMinor?: number
  PaymentCurrency?: string
  PaymentProvider?: string
  CheckedInAt?: string
  BibCollectedAt?: string
  PackCollectedAt?: string
  CreatedAt: string
}

type Event = {
  Slug: string
  URLSlug: string
  Title: string
  StartAt: string
}

const statusLabels: Record<string, string> = {
  created: "Created",
  pending_payment: "Pending payment",
  paid: "Paid",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  refunded: "Refunded"
}

const formatMoney = (currency?: string, minor?: number) => {
  if (!currency || minor == null) return "-"
  const value = minor / 100
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function RegistrationsPageInner() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Registration[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const { toast } = useToast()
  const [filters, setFilters] = useState({
    eventSlug: "",
    status: "all",
    query: ""
  })

  const loadEvents = async () => {
    try {
      const data = await apiGet<Event[]>("/admin/events")
      setEvents(data ?? [])
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load events")
    }
  }

  const loadRegistrations = async () => {
    setError(null)
    const params = new URLSearchParams()
    if (filters.eventSlug) params.set("event_slug", filters.eventSlug)
    if (filters.status !== "all") params.set("status", filters.status)
    const queryString = params.toString()
    try {
      const data = await apiGet<Registration[]>(`/admin/registrations${queryString ? `?${queryString}` : ""}`)
      setItems(data ?? [])
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load registrations")
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [])

  useEffect(() => {
    const eventParam = searchParams.get("event")
    if (eventParam && !filters.eventSlug) {
      setFilters((prev) => ({ ...prev, eventSlug: eventParam }))
    }
  }, [searchParams, filters.eventSlug])

  useEffect(() => {
    void loadRegistrations()
  }, [filters.eventSlug, filters.status])

  const filtered = useMemo(() => {
    if (!filters.query.trim()) return items
    const q = filters.query.trim().toLowerCase()
    return items.filter(
      (item) =>
        item.AthleteName.toLowerCase().includes(q) ||
        item.Email.toLowerCase().includes(q) ||
        item.EventTitle.toLowerCase().includes(q)
    )
  }, [items, filters.query])

  const handleExport = async (format: "csv" | "xlsx") => {
    const params = new URLSearchParams()
    params.set("format", format)
    if (filters.eventSlug) params.set("event_slug", filters.eventSlug)
    if (filters.status !== "all") params.set("status", filters.status)
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
      await loadRegistrations()
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Action failed")
    }
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Registrations</h1>
        <p className="text-sm text-slate-600">
          See who registered, what they signed up for, and their payment status.
        </p>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

      <div className="flex flex-wrap gap-3">
        <select
          value={filters.eventSlug}
          onChange={(e) => setFilters({ ...filters, eventSlug: e.target.value })}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm"
        >
          <option value="">All events</option>
          {events.map((event) => (
            <option key={event.Slug} value={event.URLSlug}>
              {event.Title} ({event.StartAt ? new Date(event.StartAt).toLocaleDateString() : "TBD"})
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="pending_payment">Pending payment</option>
          <option value="paid">Paid</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm"
          placeholder="Search by athlete, email, or event"
        />
        <button
          onClick={() => handleExport("csv")}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Export CSV
        </button>
        <button
          onClick={() => handleExport("xlsx")}
          className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
        >
          Export XLSX
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Athlete</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Bib</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.Slug} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{item.AthleteName}</div>
                  <div className="text-xs text-slate-500">{item.Email}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="font-medium text-slate-800">{item.EventTitle}</div>
                  <div className="text-xs text-slate-500">
                    {item.EventStartAt ? new Date(item.EventStartAt).toLocaleDateString() : "TBD"}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.CategoryName ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="font-medium text-slate-800">
                    {formatMoney(item.PaymentCurrency, item.PaymentAmountMinor)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {item.PaymentProvider ?? "No payment"} •{" "}
                    {item.PaymentStatus ? item.PaymentStatus : "pending"}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.BibNumber ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="font-medium text-slate-800">{statusLabels[item.Status] ?? item.Status}</div>
                  <div className="text-xs text-slate-500">
                    {item.CheckedInAt ? "Checked in" : "Not checked in"}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {item.CreatedAt ? new Date(item.CreatedAt).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        handleAction(`/admin/registrations/${item.Slug}/resend-confirmation`, "Confirmation queued")
                      }
                      className="font-semibold text-forest"
                    >
                      Resend confirmation
                    </button>
                    {item.PaymentStatus === "success" && (
                      <button
                        onClick={() => handleAction(`/admin/registrations/${item.Slug}/resend-receipt`, "Receipt queued")}
                        className="font-semibold text-sky-600"
                      >
                        Resend receipt
                      </button>
                    )}
                    {item.Status !== "cancelled" && (
                      <button
                        onClick={() => {
                          if (window.confirm("Cancel this registration?")) {
                            void handleAction(`/admin/registrations/${item.Slug}/cancel`, "Registration cancelled")
                          }
                        }}
                        className="font-semibold text-rose-600"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No registrations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
