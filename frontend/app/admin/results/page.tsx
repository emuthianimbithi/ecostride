"use client"

import { Suspense } from "react"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { apiFetch, apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"

type Event = {
  Slug: string
  URLSlug: string
  Title: string
  StartAt: string
  ResultsPublished?: boolean
}

type RowError = {
  row: number
  message: string
}

function ResultsAdminPageInner() {
  const searchParams = useSearchParams()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventSlug, setSelectedEventSlug] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const { toast } = useToast()

  const selectedEvent = events.find((event) => event.Slug === selectedEventSlug)

  const loadEvents = async () => {
    try {
      const data = await apiGet<Event[]>("/admin/events")
      setEvents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events")
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

  const handleImport = async () => {
    if (!selectedEvent || !file) {
      setError("Select an event and upload a CSV file.")
      return
    }
    setError(null)
    setStatus("Importing...")
    setRowErrors([])

    const form = new FormData()
    form.append("file", file)

    try {
      const data = await apiFetch<{ imported: number; failed: number; errors?: RowError[] }>(
        `/admin/events/${selectedEvent.Slug}/results/import`,
        { method: "POST", body: form }
      )
      const errors = Array.isArray(data.errors) ? data.errors : []
      setRowErrors(errors)
      setStatus(`Imported ${data.imported} rows; ${data.failed} errors`)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Import failed")
      setStatus(null)
    }
  }

  const handlePublish = async (publish: boolean) => {
    if (!selectedEvent) {
      setError("Choose an event first.")
      return
    }
    setError(null)
    const path = publish ? "/results/publish" : "/results/unpublish"
    try {
      await apiPost(`/admin/events/${selectedEvent.Slug}${path}`, {})
      setStatus(publish ? "Results published" : "Results unpublished")
      await loadEvents()
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to update results status")
    }
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Results</h1>
        <p className="text-sm text-slate-600">Upload results, review errors, and publish when ready.</p>
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
            Results are {selectedEvent.ResultsPublished ? "published" : "unpublished"}.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Import Results</h2>
        <label className="block text-sm text-slate-600">Upload the results CSV template.</label>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleImport}
            className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
          >
            Import results
          </button>
          <button
            onClick={() => handlePublish(true)}
            className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
          >
            Publish
          </button>
          <button
            onClick={() => handlePublish(false)}
            className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600"
          >
            Unpublish
          </button>
        </div>
      </section>

      {rowErrors.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/30 p-6 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-rose-700">Row errors</h3>
            <p className="text-xs text-rose-600">Fix these rows and re-upload the CSV.</p>
          </div>
          <div className="max-h-64 overflow-auto rounded-xl border border-rose-100 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-rose-50 text-rose-600">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Issue</th>
                </tr>
              </thead>
              <tbody>
                {rowErrors.map((rowError, index) => (
                  <tr key={`${rowError.row}-${index}`} className="border-t border-rose-100">
                    <td className="px-3 py-2 text-rose-700">{rowError.row}</td>
                    <td className="px-3 py-2 text-rose-600">{rowError.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}

export default function ResultsAdminPage() {
  return (
    <Suspense fallback={null}>
      <ResultsAdminPageInner />
    </Suspense>
  )
}
