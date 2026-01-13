"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { apiFetchResponse, apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { Download, Mail, Receipt, XCircle } from "lucide-react"

// --------------------
// snake_case API types
// --------------------
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
    bib_collected_at?: string
    pack_collected_at?: string
    created_at: string
}

type Event = {
    slug: string
    url_slug: string
    title: string
    start_at: string
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
    const { toast } = useToast()

    const [items, setItems] = useState<Registration[]>([])
    const [events, setEvents] = useState<Event[]>([])
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)

    // ✅ snake_case filter keys + field-level validation
    const [filters, setFilters] = useState({
        event_slug: "",
        status: "all",
        search: ""
    })
    const [filterErrors, setFilterErrors] = useState<Record<string, string>>({})

    const loadEvents = async () => {
        try {
            const data = await apiGet<Event[]>("/admin/events")
            setEvents(Array.isArray(data) ? data : [])
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load events")
        }
    }

    const loadRegistrations = async () => {
        setError(null)
        const params = new URLSearchParams()
        if (filters.event_slug) params.set("event_slug", filters.event_slug)
        if (filters.status !== "all") params.set("status", filters.status)
        if (filters.search.trim()) params.set("search", filters.search.trim()) // ✅ server-side search

        try {
            const data = await apiGet<Registration[]>(`/admin/registrations?${params.toString()}`)
            setItems(Array.isArray(data) ? data : [])
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load registrations")
        }
    }

    useEffect(() => {
        void loadEvents()
    }, [])

    // ✅ read URL param once and store into snake_case filter
    useEffect(() => {
        const eventParam = searchParams.get("event")
        if (eventParam && !filters.event_slug) {
            setFilters((prev) => ({ ...prev, event_slug: eventParam }))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    // ✅ debounce server-side search (1s after they stop typing)
    useEffect(() => {
        const t = window.setTimeout(() => {
            void loadRegistrations()
        }, 1000)
        return () => window.clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.event_slug, filters.status, filters.search])

    // ✅ keep memo for quick client-side filtering if backend doesn't support search fully
    const filtered = useMemo(() => {
        // if server search is used, return items as-is
        return items
    }, [items])

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
            await loadRegistrations()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Action failed")
        }
    }

    const setFilterErr = (k: string, msg?: string) => {
        setFilterErrors((prev) => {
            const next = { ...prev }
            if (!msg) delete next[k]
            else next[k] = msg
            return next
        })
    }

    return (
        <main className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-forest">Registrations</h1>
                <p className="text-sm text-slate-600">See who registered, what they signed up for, and their payment status.</p>
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
            {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

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
                            // optional: prevent super-long searches that can stress the backend
                            if (filters.search.trim().length > 120) setFilterErr("search", "Search is too long (max 120 chars).")
                            else setFilterErr("search", undefined)
                        }}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm"
                        placeholder="Search by athlete, email, or event"
                    />
                    {filterErrors.search ? <p className="mt-1 pl-4 text-xs text-rose-600">{filterErrors.search}</p> : null}
                </div>

                {/* ✅ icons for export, same button styling */}
                <button
                    onClick={() => handleExport("csv")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                    title="Export CSV"
                    aria-label="Export CSV"
                >
                    <Download className="h-4 w-4" />
                    CSV
                </button>
                <button
                    onClick={() => handleExport("xlsx")}
                    className="inline-flex items-center gap-2 rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
                    title="Export XLSX"
                    aria-label="Export XLSX"
                >
                    <Download className="h-4 w-4" />
                    XLSX
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
                        <tr key={item.slug} className="border-t border-slate-100 align-top">
                            <td className="px-4 py-3">
                                <div className="font-medium text-slate-800">{item.athlete_name}</div>
                                <div className="text-xs text-slate-500">{item.email}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                                <div className="font-medium text-slate-800">{item.event_title}</div>
                                <div className="text-xs text-slate-500">
                                    {item.event_start_at ? new Date(item.event_start_at).toLocaleDateString() : "TBD"}
                                </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{item.category_name ?? "-"}</td>
                            <td className="px-4 py-3 text-slate-600">
                                <div className="font-medium text-slate-800">{formatMoney(item.payment_currency, item.payment_amount_minor)}</div>
                                <div className="text-xs text-slate-500">
                                    {item.payment_provider ?? "No payment"} • {item.payment_status ? item.payment_status : "pending"}
                                </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{item.bib_number ?? "-"}</td>
                            <td className="px-4 py-3 text-slate-600">
                                <div className="font-medium text-slate-800">{statusLabels[item.status] ?? item.status}</div>
                                <div className="text-xs text-slate-500">{item.checked_in_at ? "Checked in" : "Not checked in"}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                                {item.created_at ? new Date(item.created_at).toLocaleDateString() : "-"}
                            </td>

                            {/* ✅ icon action buttons (same rounded style, just icons) */}
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
                                            onClick={() => {
                                                if (window.confirm("Cancel this registration?")) {
                                                    void handleAction(`/admin/registrations/${item.slug}/cancel`, "Registration cancelled")
                                                }
                                            }}
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
