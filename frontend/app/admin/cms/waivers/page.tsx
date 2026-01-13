"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet, apiPost } from "../../../../lib/api-client"
import { Plus } from "lucide-react"

type Waiver = {
    slug: string
    scope: string
    event_id?: number | null
    version: number
    title: string
    is_current: boolean
    effective_at: string
}

type Event = {
    id: number
    slug: string
    url_slug: string
    title: string
    start_at: string
}

export default function Page() {
    const [waivers, setWaivers] = useState<Waiver[]>([])
    const [events, setEvents] = useState<Event[]>([])
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)

    // ✅ field-level validation (no design changes)
    const [fieldErrors, setFieldErrors] = useState<{
        title?: string
        content?: string
        version?: string
        event_id?: string
    }>({})

    const [form, setForm] = useState({
        scope: "GLOBAL",
        version: "1",
        title: "",
        content: "",
        event_id: "",
        is_current: false
    })

    const loadWaivers = async () => {
        try {
            const data = await apiGet<Waiver[]>("/admin/waivers")
            setWaivers(Array.isArray(data) ? data : [])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load")
        }
    }

    const loadEvents = async () => {
        try {
            const data = await apiGet<Event[]>("/admin/events")
            setEvents(Array.isArray(data) ? data : [])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load events")
        }
    }

    useEffect(() => {
        void loadWaivers()
        void loadEvents()
    }, [])

    const eventsById = useMemo(() => {
        const m = new Map<number, Event>()
        events.forEach((e) => m.set(e.id, e))
        return m
    }, [events])

    const setFieldError = (key: keyof typeof fieldErrors, message?: string) => {
        setFieldErrors((prev) => {
            const next = { ...prev }
            if (!message) delete next[key]
            else next[key] = message
            return next
        })
    }

    const validate = () => {
        let ok = true

        if (!form.title.trim()) {
            setFieldError("title", "Title is required.")
            ok = false
        } else setFieldError("title", undefined)

        if (!form.content.trim()) {
            setFieldError("content", "Content is required.")
            ok = false
        } else setFieldError("content", undefined)

        const version = Number(form.version)
        if (!form.version.trim()) {
            setFieldError("version", "Version is required.")
            ok = false
        } else if (Number.isNaN(version)) {
            setFieldError("version", "Version must be numeric.")
            ok = false
        } else setFieldError("version", undefined)

        if (form.scope === "EVENT") {
            if (!form.event_id) {
                setFieldError("event_id", "Select an event.")
                ok = false
            } else if (Number.isNaN(Number(form.event_id))) {
                setFieldError("event_id", "Invalid event.")
                ok = false
            } else {
                setFieldError("event_id", undefined)
            }
        } else {
            setFieldError("event_id", undefined)
        }

        return ok
    }

    const handleCreate = async () => {
        setError(null)
        setStatus(null)

        if (!validate()) return

        const version = Number(form.version)

        try {
            await apiPost("/admin/waivers", {
                scope: form.scope,
                version,
                title: form.title.trim(),
                content: form.content.trim(),
                event_id: form.scope === "EVENT" && form.event_id ? Number(form.event_id) : undefined,
                is_current: form.is_current
            })
            setStatus("Waiver created")
            setForm({ scope: "GLOBAL", version: "1", title: "", content: "", event_id: "", is_current: false })
            setFieldErrors({})
            await loadWaivers()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create waiver")
        }
    }

    return (
        <main className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-forest">Waivers</h1>
                <p className="text-sm text-slate-600">
                    Manage the registration waiver text. You can set a global waiver or one per event.
                </p>
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
            {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">New Waiver</h2>
                <div className="grid gap-3 md:grid-cols-2">
                    <select
                        value={form.scope}
                        onChange={(e) => {
                            const nextScope = e.target.value
                            setForm((p) => ({ ...p, scope: nextScope, event_id: nextScope === "EVENT" ? p.event_id : "" }))
                            if (fieldErrors.event_id) setFieldError("event_id", undefined)
                        }}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="GLOBAL">All events (global)</option>
                        <option value="EVENT">Specific event</option>
                    </select>

                    <div className="space-y-1">
                        <input
                            value={form.version}
                            onChange={(e) => {
                                setForm({ ...form, version: e.target.value })
                                if (fieldErrors.version) setFieldError("version", undefined)
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Version number (e.g. 2)"
                        />
                        {fieldErrors.version ? <p className="px-2 text-xs text-rose-600">{fieldErrors.version}</p> : null}
                    </div>
                </div>

                {form.scope === "EVENT" && (
                    <div className="space-y-1">
                        <select
                            value={form.event_id}
                            onChange={(e) => {
                                setForm({ ...form, event_id: e.target.value })
                                if (fieldErrors.event_id) setFieldError("event_id", undefined)
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        >
                            <option value="">Select event</option>
                            {events.map((event) => (
                                <option key={event.id} value={event.id}>
                                    {event.title} ({event.start_at ? new Date(event.start_at).toLocaleDateString() : "TBD"})
                                </option>
                            ))}
                        </select>
                        {fieldErrors.event_id ? <p className="px-2 text-xs text-rose-600">{fieldErrors.event_id}</p> : null}
                    </div>
                )}

                <div className="space-y-1">
                    <input
                        value={form.title}
                        onChange={(e) => {
                            setForm({ ...form, title: e.target.value })
                            if (fieldErrors.title) setFieldError("title", undefined)
                        }}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Waiver title"
                    />
                    {fieldErrors.title ? <p className="px-2 text-xs text-rose-600">{fieldErrors.title}</p> : null}
                </div>

                <div className="space-y-1">
          <textarea
              value={form.content}
              onChange={(e) => {
                  setForm({ ...form, content: e.target.value })
                  if (fieldErrors.content) setFieldError("content", undefined)
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              rows={4}
              placeholder="Paste the full waiver text here."
          />
                    {fieldErrors.content ? <p className="px-2 text-xs text-rose-600">{fieldErrors.content}</p> : null}
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                        type="checkbox"
                        checked={form.is_current}
                        onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                    />
                    Set as current
                </label>

                {/* ✅ icon action, keep same button styling */}
                <button
                    onClick={handleCreate}
                    className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
                    aria-label="Create waiver"
                    title="Create waiver"
                >
                    <Plus className="h-4 w-4" />
                    <span>Create waiver</span>
                </button>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-4 py-3">Scope</th>
                        <th className="px-4 py-3">Version</th>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Event</th>
                        <th className="px-4 py-3">Current</th>
                        <th className="px-4 py-3">Effective</th>
                    </tr>
                    </thead>
                    <tbody>
                    {waivers.map((waiver) => {
                        const event = waiver.event_id ? eventsById.get(waiver.event_id) : null
                        return (
                            <tr key={waiver.slug} className="border-t border-slate-100">
                                <td className="px-4 py-3 font-medium text-slate-800">
                                    {waiver.scope === "EVENT" ? "Event" : "Global"}
                                </td>
                                <td className="px-4 py-3 text-slate-600">{waiver.version}</td>
                                <td className="px-4 py-3 text-slate-600">{waiver.title}</td>
                                <td className="px-4 py-3 text-slate-600">{event ? event.title : "All events"}</td>
                                <td className="px-4 py-3 text-slate-600">{waiver.is_current ? "Yes" : "No"}</td>
                                <td className="px-4 py-3 text-slate-600">
                                    {waiver.effective_at ? new Date(waiver.effective_at).toLocaleDateString() : "-"}
                                </td>
                            </tr>
                        )
                    })}
                    {waivers.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                                No waivers yet.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </section>
        </main>
    )
}
