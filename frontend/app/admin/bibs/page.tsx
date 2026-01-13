"use client"

import { Suspense } from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { apiFetchResponse, apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import {
    CheckCircle2,
    ClipboardCheck,
    PackageCheck,
    Hash,
    Sparkles,
    Download
} from "lucide-react"

// --------------------
// snake_case API types
// --------------------
type Event = {
    slug: string
    url_slug: string
    title: string
    type: string
    location: string
    start_at: string
}

type Registration = {
    slug: string
    athlete_name: string
    email: string
    status: string
    category_name?: string
    bib_number?: number
    payment_status?: string
    payment_amount_minor?: number
    payment_currency?: string
    checked_in_at?: string
    bib_collected_at?: string
    pack_collected_at?: string
}

function BibsPageInner() {
    const searchParams = useSearchParams()
    const [events, setEvents] = useState<Event[]>([])
    const [selected_event_slug, setSelected_event_slug] = useState("")
    const [registrations, setRegistrations] = useState<Registration[]>([])
    const [query, setQuery] = useState("")
    const [manualAssign, setManualAssign] = useState({
        registration_slug: "",
        bib_number: ""
    })
    const [status, setStatus] = useState<string | null>(null)
    const { toast } = useToast()
    const [error, setError] = useState<string | null>(null)

    // ✅ for inline (field-level) validation
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

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

    const loadRegistrations = async (event: Event) => {
        try {
            const data = await apiGet<Registration[]>(`/admin/registrations?event_slug=${event.url_slug}`)
            setRegistrations(Array.isArray(data) ? data : [])
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load registrations")
        }
    }

    useEffect(() => {
        void loadEvents()
    }, [])

    useEffect(() => {
        if (events.length === 0 || selected_event_slug) return
        const eventParam = searchParams.get("event")
        if (!eventParam) return
        // allow either event.slug or event.url_slug in URL param
        const match = events.find((event) => event.slug === eventParam || event.url_slug === eventParam)
        if (match) setSelected_event_slug(match.slug)
    }, [events, searchParams, selected_event_slug])

    useEffect(() => {
        if (selectedEvent) void loadRegistrations(selectedEvent)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected_event_slug])

    const filtered = useMemo(() => {
        if (!query.trim()) return registrations
        const q = query.toLowerCase()
        return registrations.filter(
            (item) =>
                item.athlete_name.toLowerCase().includes(q) ||
                item.email.toLowerCase().includes(q) ||
                (item.category_name ?? "").toLowerCase().includes(q) ||
                (item.bib_number != null && item.bib_number.toString().includes(q))
        )
    }, [registrations, query])

    const summary = useMemo(() => {
        const total = registrations.length
        const paid = registrations.filter((reg) => ["paid", "confirmed"].includes(reg.status)).length
        const pending = registrations.filter((reg) => reg.status === "pending_payment").length
        const bibAssigned = registrations.filter((reg) => reg.bib_number != null).length
        const checkedIn = registrations.filter((reg) => reg.checked_in_at).length
        const revenue: Record<string, number> = {}
        registrations.forEach((reg) => {
            if (reg.payment_status !== "success") return
            if (!reg.payment_currency || reg.payment_amount_minor == null) return
            revenue[reg.payment_currency] = (revenue[reg.payment_currency] || 0) + reg.payment_amount_minor
        })
        return { total, paid, pending, bibAssigned, checkedIn, revenue }
    }, [registrations])

    const setFieldError = (key: string, message?: string) => {
        setFieldErrors((prev) => {
            const next = { ...prev }
            if (!message) delete next[key]
            else next[key] = message
            return next
        })
    }

    const handleAutoAssign = async () => {
        if (!selectedEvent) {
            setError("Choose an event first.")
            return
        }
        setError(null)
        setStatus(null)
        try {
            const data = await apiPost<{ assigned: number }>(`/admin/events/${selectedEvent.slug}/bibs/auto-assign`, {})
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

        // inline validation (no design change: uses small text under fields)
        let ok = true
        if (!manualAssign.registration_slug) {
            setFieldError("registration_slug", "Pick a registration.")
            ok = false
        } else {
            setFieldError("registration_slug", undefined)
        }

        if (!manualAssign.bib_number.trim()) {
            setFieldError("bib_number", "Enter a bib number.")
            ok = false
        } else if (!/^\d+$/.test(manualAssign.bib_number.trim())) {
            setFieldError("bib_number", "Bib number must be numeric.")
            ok = false
        } else {
            setFieldError("bib_number", undefined)
        }

        if (!ok) return

        const bibNumber = Number(manualAssign.bib_number.trim())
        setError(null)
        setStatus(null)

        try {
            await apiPost(`/admin/events/${selectedEvent.slug}/bibs/manual-assign`, {
                registration_slug: manualAssign.registration_slug,
                bib_number: bibNumber
            })
            setStatus("Bib assigned")
            setManualAssign({ registration_slug: "", bib_number: "" })
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
            const res = await apiFetchResponse(`/admin/events/${selectedEvent.slug}/start-list/export?format=${format}`)
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

    const updateCheckin = async (
        slug: string,
        payload: { checked_in?: boolean; bib_collected?: boolean; pack_collected?: boolean }
    ) => {
        setError(null)
        setStatus(null)
        try {
            await apiPost(`/admin/checkin/${slug}`, payload)
            setStatus("Check-in updated")
            if (selectedEvent) await loadRegistrations(selectedEvent)
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
                    value={selected_event_slug}
                    onChange={(e) => setSelected_event_slug(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                    <option value="">Choose an event</option>
                    {events.map((event) => (
                        <option key={event.slug} value={event.slug}>
                            {event.title} ({event.start_at ? new Date(event.start_at).toLocaleDateString() : "TBD"})
                        </option>
                    ))}
                </select>
                {selectedEvent && (
                    <div className="text-sm text-slate-600">
                        {selectedEvent.type} • {selectedEvent.location || "Location TBD"}
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

                        {/* ✅ icons only (no layout change, just replaces text inside buttons) */}
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleAutoAssign}
                                className="inline-flex items-center justify-center rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
                                aria-label="Auto-assign bibs"
                                title="Auto-assign"
                            >
                                <Sparkles className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => handleExport("csv")}
                                className="inline-flex items-center justify-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
                                aria-label="Export CSV"
                                title="Export CSV"
                            >
                                <Download className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => handleExport("xlsx")}
                                className="inline-flex items-center justify-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
                                aria-label="Export XLSX"
                                title="Export XLSX"
                            >
                                <Download className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="flex flex-col">
                            <select
                                value={manualAssign.registration_slug}
                                onChange={(e) => {
                                    setManualAssign({ ...manualAssign, registration_slug: e.target.value })
                                    if (fieldErrors.registration_slug) setFieldError("registration_slug", undefined)
                                }}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            >
                                <option value="">Select registration</option>
                                {registrations.map((reg) => (
                                    <option key={reg.slug} value={reg.slug}>
                                        {reg.athlete_name} {reg.category_name ? `(${reg.category_name})` : ""}
                                    </option>
                                ))}
                            </select>
                            {fieldErrors.registration_slug ? (
                                <p className="mt-1 px-2 text-xs text-rose-600">{fieldErrors.registration_slug}</p>
                            ) : null}
                        </div>

                        <div className="flex flex-col">
                            <input
                                value={manualAssign.bib_number}
                                onChange={(e) => {
                                    setManualAssign({ ...manualAssign, bib_number: e.target.value })
                                    if (fieldErrors.bib_number) setFieldError("bib_number", undefined)
                                }}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="Bib number"
                            />
                            {fieldErrors.bib_number ? (
                                <p className="mt-1 px-2 text-xs text-rose-600">{fieldErrors.bib_number}</p>
                            ) : null}
                        </div>

                        <button
                            onClick={handleManualAssign}
                            className="inline-flex items-center justify-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
                            aria-label="Assign bib"
                            title="Assign bib"
                        >
                            <Hash className="h-4 w-4" />
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
                                <tr key={reg.slug} className="border-t border-slate-100">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800">{reg.athlete_name}</div>
                                        <div className="text-xs text-slate-500">{reg.email}</div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{reg.category_name ?? "-"}</td>
                                    <td className="px-4 py-3 text-slate-600">{reg.payment_status ?? "pending"}</td>
                                    <td className="px-4 py-3 text-slate-600">{reg.bib_number ?? "-"}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <div>{reg.checked_in_at ? "Checked in" : "Not checked in"}</div>
                                        <div className="text-xs text-slate-500">
                                            {reg.bib_collected_at ? "Bib collected" : "Bib not collected"} •{" "}
                                            {reg.pack_collected_at ? "Pack collected" : "Pack not collected"}
                                        </div>
                                    </td>

                                    {/* ✅ icons for actions, same visual language */}
                                    <td className="px-4 py-3 text-xs">
                                        <div className="flex flex-wrap gap-2">
                                            {!reg.checked_in_at && (
                                                <button
                                                    onClick={() => updateCheckin(reg.slug, { checked_in: true })}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-forest transition hover:bg-slate-50"
                                                    aria-label="Check in"
                                                    title="Check in"
                                                >
                                                    <CheckCircle2 className="h-4 w-4" />
                                                </button>
                                            )}
                                            {!reg.bib_collected_at && (
                                                <button
                                                    onClick={() => updateCheckin(reg.slug, { bib_collected: true })}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sky-600 transition hover:bg-slate-50"
                                                    aria-label="Mark bib collected"
                                                    title="Mark bib"
                                                >
                                                    <ClipboardCheck className="h-4 w-4" />
                                                </button>
                                            )}
                                            {!reg.pack_collected_at && (
                                                <button
                                                    onClick={() => updateCheckin(reg.slug, { pack_collected: true })}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                                                    aria-label="Mark pack collected"
                                                    title="Mark pack"
                                                >
                                                    <PackageCheck className="h-4 w-4" />
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
