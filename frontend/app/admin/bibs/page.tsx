"use client"

import { Suspense } from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { apiFetchResponse, apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"

type Event = {
  Slug: string
  URLSlug: string
  Title: string
  Type: string
  Location: string
  StartAt: string
}

type Registration = {
  Slug: string
  AthleteName: string
  Email: string
  Status: string
  CategoryName?: string
  BibNumber?: number
  PaymentStatus?: string
  PaymentAmountMinor?: number
  PaymentCurrency?: string
  CheckedInAt?: string
  BibCollectedAt?: string
  PackCollectedAt?: string
}

function BibsPageInner() {
  const searchParams = useSearchParams()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventSlug, setSelectedEventSlug] = useState("")
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [query, setQuery] = useState("")
  const [manualAssign, setManualAssign] = useState({
    registrationSlug: "",
    bibNumber: ""
  })
  const [status, setStatus] = useState<string | null>(null)
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)

  const selectedEvent = events.find((event) => event.Slug === selectedEventSlug)

  const loadEvents = async () => {
    try {
      const data = await apiGet<Event[]>("/admin/events")
      setEvents(data)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load events")
    }
  }

  const loadRegistrations = async (event: Event) => {
    try {
      const data = await apiGet<Registration[]>(`/admin/registrations?event_slug=${event.URLSlug}`)
      setRegistrations(data)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load registrations")
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [])

  useEffect(() => {
    if (events.length === 0 || selectedEventSlug) return
    const eventParam = searchParams.get("event")
    if (!eventParam) return
    const match = events.find((event) => event.Slug === eventParam || event.URLSlug === eventParam)
    if (match) {
      setSelectedEventSlug(match.Slug)
    }
  }, [events, searchParams, selectedEventSlug])

  useEffect(() => {
    if (selectedEvent) {
      void loadRegistrations(selectedEvent)
    }
  }, [selectedEventSlug])

  const filtered = useMemo(() => {
    if (!query.trim()) return registrations
    const q = query.toLowerCase()
    return registrations.filter(
      (item) =>
        item.AthleteName.toLowerCase().includes(q) ||
        item.Email.toLowerCase().includes(q) ||
        (item.CategoryName ?? "").toLowerCase().includes(q) ||
        (item.BibNumber != null && item.BibNumber.toString().includes(q))
    )
  }, [registrations, query])

  const summary = useMemo(() => {
    const total = registrations.length
    const paid = registrations.filter((reg) => ["paid", "confirmed"].includes(reg.Status)).length
    const pending = registrations.filter((reg) => reg.Status === "pending_payment").length
    const bibAssigned = registrations.filter((reg) => reg.BibNumber != null).length
    const checkedIn = registrations.filter((reg) => reg.CheckedInAt).length
    const revenue: Record<string, number> = {}
    registrations.forEach((reg) => {
      if (reg.PaymentStatus !== "success") return
      if (!reg.PaymentCurrency || reg.PaymentAmountMinor == null) return
      revenue[reg.PaymentCurrency] = (revenue[reg.PaymentCurrency] || 0) + reg.PaymentAmountMinor
    })
    return { total, paid, pending, bibAssigned, checkedIn, revenue }
  }, [registrations])

  const handleAutoAssign = async () => {
    if (!selectedEvent) {
      setError("Choose an event first.")
      return
    }
    setError(null)
    setStatus(null)
    try {
      const data = await apiPost<{ assigned: number }>(`/admin/events/${selectedEvent.Slug}/bibs/auto-assign`, {})
      setStatus(`Auto-assigned ${data.assigned} bibs`)
      await loadRegistrations(selectedEvent)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Auto-assign failed")
    }
  }

  const handleManualAssign = async () => {
    if (!selectedEvent) {
      setError("Choose an event first.")
      return
    }
    if (!manualAssign.registrationSlug || !manualAssign.bibNumber) {
      setError("Pick a registration and bib number.")
      return
    }
    const bibNumber = Number(manualAssign.bibNumber)
    if (Number.isNaN(bibNumber)) {
      setError("Bib number must be numeric.")
      return
    }
    setError(null)
    setStatus(null)
    try {
      await apiPost(`/admin/events/${selectedEvent.Slug}/bibs/manual-assign`, {
        registration_slug: manualAssign.registrationSlug,
        bib_number: bibNumber
      })
      setStatus("Bib assigned")
      setManualAssign({ registrationSlug: "", bibNumber: "" })
      await loadRegistrations(selectedEvent)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Manual assign failed")
    }
  }

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!selectedEvent) {
      setError("Choose an event first.")
      return
    }
    try {
      const res = await apiFetchResponse(`/admin/events/${selectedEvent.Slug}/start-list/export?format=${format}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `start-list.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Export failed")
    }
  }

  const updateCheckin = async (slug: string, payload: { checked_in?: boolean; bib_collected?: boolean; pack_collected?: boolean }) => {
    setError(null)
    setStatus(null)
    try {
      await apiPost(`/admin/checkin/${slug}`, payload)
      setStatus("Check-in updated")
      if (selectedEvent) {
        await loadRegistrations(selectedEvent)
      }
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to update check-in")
    }
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Race Day</h1>
        <p className="text-sm text-slate-600">Assign bibs, export the start list, and check athletes in.</p>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Select Event</h2>
        <select
          value={selectedEventSlug}
          onChange={(e) => setSelectedEventSlug(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Choose an event</option>
          {events.map((event) => (
            <option key={event.Slug} value={event.Slug}>
              {event.Title} ({event.StartAt ? new Date(event.StartAt).toLocaleDateString() : "TBD"})
            </option>
          ))}
        </select>
        {selectedEvent && (
          <div className="text-sm text-slate-600">
            {selectedEvent.Type} • {selectedEvent.Location || "Location TBD"}
          </div>
        )}
      </section>

      {selectedEvent && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-800">Event snapshot</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-5">
            {[
              { label: "Registrations", value: summary.total },
              { label: "Paid / Confirmed", value: summary.paid },
              { label: "Pending payment", value: summary.pending },
              { label: "Bibs assigned", value: summary.bibAssigned },
              { label: "Checked in", value: summary.checkedIn }
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-forest">{card.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 text-sm text-slate-600">
            Revenue:{" "}
            {Object.keys(summary.revenue).length > 0
              ? Object.entries(summary.revenue)
                  .map(([currency, amount]) => `${currency} ${(amount / 100).toFixed(2)}`)
                  .join(" • ")
              : "No confirmed payments yet"}
          </div>
        </section>
      )}

      {selectedEvent && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Bib Assignment</h2>
              <p className="text-sm text-slate-600">Auto-assign bibs or assign a specific bib number.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleAutoAssign}
                className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
              >
                Auto-assign
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
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
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={manualAssign.registrationSlug}
              onChange={(e) => setManualAssign({ ...manualAssign, registrationSlug: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select registration</option>
              {registrations.map((reg) => (
                <option key={reg.Slug} value={reg.Slug}>
                  {reg.AthleteName} {reg.CategoryName ? `(${reg.CategoryName})` : ""}
                </option>
              ))}
            </select>
            <input
              value={manualAssign.bibNumber}
              onChange={(e) => setManualAssign({ ...manualAssign, bibNumber: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Bib number"
            />
            <button
              onClick={handleManualAssign}
              className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
            >
              Assign bib
            </button>
          </div>
        </section>
      )}

      {selectedEvent && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Check-In Board</h2>
              <p className="text-sm text-slate-600">Search athletes and mark check-in activity.</p>
            </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm"
          placeholder="Search by name, email, category, or bib"
        />
          </div>
          <div className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Athlete</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Bib</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((reg) => (
                  <tr key={reg.Slug} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{reg.AthleteName}</div>
                      <div className="text-xs text-slate-500">{reg.Email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{reg.CategoryName ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{reg.PaymentStatus ?? "pending"}</td>
                    <td className="px-4 py-3 text-slate-600">{reg.BibNumber ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{reg.CheckedInAt ? "Checked in" : "Not checked in"}</div>
                      <div className="text-xs text-slate-500">
                        {reg.BibCollectedAt ? "Bib collected" : "Bib not collected"} •{" "}
                        {reg.PackCollectedAt ? "Pack collected" : "Pack not collected"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-wrap gap-2">
                        {!reg.CheckedInAt && (
                          <button
                            onClick={() => updateCheckin(reg.Slug, { checked_in: true })}
                            className="font-semibold text-forest"
                          >
                            Check in
                          </button>
                        )}
                        {!reg.BibCollectedAt && (
                          <button
                            onClick={() => updateCheckin(reg.Slug, { bib_collected: true })}
                            className="font-semibold text-sky-600"
                          >
                            Mark bib
                          </button>
                        )}
                        {!reg.PackCollectedAt && (
                          <button
                            onClick={() => updateCheckin(reg.Slug, { pack_collected: true })}
                            className="font-semibold text-slate-600"
                          >
                            Mark pack
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No registrations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}

export default function BibsPage() {
  return (
    <Suspense fallback={null}>
      <BibsPageInner />
    </Suspense>
  )
}
