"use client"

import { Suspense } from "react"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { apiFetch, apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { Upload, Eye, EyeOff } from "lucide-react"

// --------------------
// snake_case API types
// --------------------
type Event = {
    slug: string
    url_slug: string
    title: string
    start_at: string
    results_published?: boolean
}

type RowError = {
    row: number
    message: string
}

function ResultsAdminPageInner() {
    const searchParams = useSearchParams()
    const [events, setEvents] = useState<Event[]>([])
    const [selected_event_slug, setSelected_event_slug] = useState("")
    const [file, setFile] = useState<File | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [rowErrors, setRowErrors] = useState<RowError[]>([])
    const { toast } = useToast()

    // ✅ inline validation (no design change)
    const [fieldErrors, setFieldErrors] = useState<{ event?: string; file?: string }>({})

    const selectedEvent = events.find((event) => event.slug === selected_event_slug)

    const loadEvents = async () => {
        try {
            const data = await apiGet<Event[]>("/admin/events")
            setEvents(Array.isArray(data) ? data : [])
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load events")
        }
    }

    useEffect(() => {
        void loadEvents()
    }, [])

    useEffect(() => {
        if (events.length === 0 || selected_event_slug) return
        const eventParam = searchParams.get("event")
        if (!eventParam) return
        const match = events.find((event) => event.slug === eventParam || event.url_slug === eventParam)
        if (match) setSelected_event_slug(match.slug)
    }, [events, searchParams, selected_event_slug])

    const setFieldError = (key: "event" | "file", message?: string) => {
        setFieldErrors((prev) => {
            const next = { ...prev }
            if (!message) delete next[key]
            else next[key] = message
            return next
        })
    }

    const validateImport = () => {
        let ok = true

        if (!selectedEvent) {
            setFieldError("event", "Choose an event.")
            ok = false
        } else {
            setFieldError("event", undefined)
        }

        if (!file) {
            setFieldError("file", "Upload a CSV file.")
            ok = false
        } else if (!file.name.toLowerCase().endsWith(".csv")) {
            setFieldError("file", "File must be a .csv.")
            ok = false
        } else {
            setFieldError("file", undefined)
        }

        return ok
    }

    const handleImport = async () => {
        setError(null)
        setStatus(null)
        setRowErrors([])

        if (!validateImport() || !selectedEvent || !file) return

        setStatus("Importing...")

        const form = new FormData()
        form.append("file", file)

        try {
            const data = await apiFetch<{ imported: number; failed: number; errors?: RowError[] }>(
                `/admin/events/${selectedEvent.slug}/results/import`,
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
            setFieldError("event", "Choose an event.")
            setError("Choose an event first.")
            return
        }
        setFieldError("event", undefined)
        setError(null)
        setStatus(null)

        const path = publish ? "/results/publish" : "/results/unpublish"
        try {
            await apiPost(`/admin/events/${selectedEvent.slug}${path}`, {})
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
                    value={selected_event_slug}
                    onChange={(e) => {
                        setSelected_event_slug(e.target.value)
                        if (fieldErrors.event) setFieldError("event", undefined)
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                    <option value="">Choose an event</option>
                    {events.map((event) => (
                        <option key={event.slug} value={event.slug}>
                            {event.title} ({event.start_at ? new Date(event.start_at).toLocaleDateString() : "TBD"})
                        </option>
                    ))}
                </select>
                {fieldErrors.event ? <p className="px-2 text-xs text-rose-600">{fieldErrors.event}</p> : null}

                {selectedEvent && (
                    <div className="text-sm text-slate-600">
                        Results are {selectedEvent.results_published ? "published" : "unpublished"}.
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">Import Results</h2>
                <label className="block text-sm text-slate-600">Upload the results CSV template.</label>
                <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                        const next = e.target.files?.[0] ?? null
                        setFile(next)
                        if (fieldErrors.file) setFieldError("file", undefined)
                    }}
                />
                {fieldErrors.file ? <p className="px-2 text-xs text-rose-600">{fieldErrors.file}</p> : null}

                <div className="flex flex-wrap gap-3">
                    {/* ✅ icons only, same button styling */}
                    <button
                        onClick={handleImport}
                        className="inline-flex items-center justify-center rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
                        aria-label="Import results"
                        title="Import results"
                    >
                        <Upload className="h-4 w-4" />
                    </button>

                    <button
                        onClick={() => handlePublish(true)}
                        className="inline-flex items-center justify-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
                        aria-label="Publish results"
                        title="Publish"
                    >
                        <Eye className="h-4 w-4" />
                    </button>

                    <button
                        onClick={() => handlePublish(false)}
                        className="inline-flex items-center justify-center rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600"
                        aria-label="Unpublish results"
                        title="Unpublish"
                    >
                        <EyeOff className="h-4 w-4" />
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
