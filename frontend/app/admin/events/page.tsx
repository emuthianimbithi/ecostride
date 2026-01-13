"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { ClipboardList, Medal, Settings2 } from "lucide-react"

type Event = {
    slug: string
    url_slug: string
    title: string
    type: string
    status: string
    start_at: string
}

export default function EventsPage() {
    const { toast } = useToast()
    const [events, setEvents] = useState<Event[]>([])
    const [showForm, setShowForm] = useState(false)

    // ✅ field-level validation errors
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState({
        slug: "",
        type: "MARATHON",
        title: "",
        description: "",
        location: "",
        map_url: "",
        start_at: "",
        reg_open_at: "",
        reg_close_at: "",
        status: "draft"
    })

    useEffect(() => {
        void loadEvents()
    }, [])

    const loadEvents = async () => {
        try {
            const data = await apiGet<Event[]>("/admin/events")
            setEvents(Array.isArray(data) ? data : [])
        } catch (err) {
            toast({
                title: "Failed to load events",
                description: err instanceof Error ? err.message : "Unknown error",
                variant: "destructive"
            })
        }
    }

    const setFieldError = (field: string, message?: string) => {
        setErrors((prev) => {
            const next = { ...prev }
            if (!message) delete next[field]
            else next[field] = message
            return next
        })
    }

    const validate = () => {
        const next: Record<string, string> = {}

        if (!form.slug.trim()) next.slug = "URL slug is required."
        if (!form.title.trim()) next.title = "Title is required."
        if (!form.start_at) next.start_at = "Start date/time is required."

        if (form.reg_open_at && form.reg_close_at) {
            const open = new Date(form.reg_open_at).getTime()
            const close = new Date(form.reg_close_at).getTime()
            if (!Number.isNaN(open) && !Number.isNaN(close) && close < open) {
                next.reg_close_at = "Registration close must be after registration open."
            }
        }

        setErrors(next)
        return Object.keys(next).length === 0
    }

    const handleCreate = async () => {
        if (!validate()) {
            toast({ title: "Validation Error", description: "Please fix the highlighted fields.", variant: "destructive" })
            return
        }

        try {
            await apiPost("/admin/events", {
                // ✅ backend expects snake_case
                url_slug: form.slug.trim(),
                type: form.type,
                title: form.title.trim(),
                description: form.description,
                location: form.location,
                map_url: form.map_url,
                start_at: new Date(form.start_at).toISOString(),
                reg_open_at: form.reg_open_at ? new Date(form.reg_open_at).toISOString() : undefined,
                reg_close_at: form.reg_close_at ? new Date(form.reg_close_at).toISOString() : undefined,
                status: form.status
            })

            toast({ title: "Success", description: "Event created successfully", variant: "success" })

            setForm({
                slug: "",
                type: "MARATHON",
                title: "",
                description: "",
                location: "",
                map_url: "",
                start_at: "",
                reg_open_at: "",
                reg_close_at: "",
                status: "draft"
            })
            setErrors({})
            setShowForm(false)
            await loadEvents()
        } catch (err) {
            toast({
                title: "Creation Failed",
                description: err instanceof Error ? err.message : "Failed to create event",
                variant: "destructive"
            })
        }
    }

    return (
        <main className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-forest">Events</h1>
                    <p className="text-sm text-slate-600">Manage event listings and publishing.</p>
                </div>
                <button
                    onClick={() => {
                        setShowForm((prev) => !prev)
                        setErrors({})
                    }}
                    className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
                >
                    {showForm ? "Close" : "New event"}
                </button>
            </div>

            {showForm && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-slate-800">New Event</h2>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                            <input
                                value={form.title}
                                onChange={(e) => {
                                    const v = e.target.value
                                    setForm({ ...form, title: v })
                                    if (errors.title) setFieldError("title", v.trim() ? undefined : "Title is required.")
                                }}
                                onBlur={() => setFieldError("title", form.title.trim() ? undefined : "Title is required.")}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="Title"
                            />
                            {errors.title ? <p className="text-xs text-rose-600">{errors.title}</p> : null}
                        </div>

                        <div className="space-y-1">
                            <input
                                value={form.slug}
                                onChange={(e) => {
                                    const v = e.target.value
                                    setForm({ ...form, slug: v })
                                    if (errors.slug) setFieldError("slug", v.trim() ? undefined : "URL slug is required.")
                                }}
                                onBlur={() => setFieldError("slug", form.slug.trim() ? undefined : "URL slug is required.")}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="URL slug"
                            />
                            {errors.slug ? <p className="text-xs text-rose-600">{errors.slug}</p> : null}
                        </div>

                        <select
                            value={form.type}
                            onChange={(e) => setForm({ ...form, type: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        >
                            <option value="MARATHON">Marathon</option>
                            <option value="SEMINAR">Seminar</option>
                            <option value="BEACH_CLEANUP">Beach Cleanup</option>
                            <option value="OTHER">Other</option>
                        </select>

                        <select
                            value={form.status}
                            onChange={(e) => setForm({ ...form, status: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="archived">Archived</option>
                        </select>

                        <input
                            value={form.location}
                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Location"
                        />

                        <input
                            value={form.map_url}
                            onChange={(e) => setForm({ ...form, map_url: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Map URL"
                        />

                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">
                                Start date/time
                                <input
                                    type="datetime-local"
                                    value={form.start_at}
                                    onChange={(e) => {
                                        const v = e.target.value
                                        setForm({ ...form, start_at: v })
                                        if (errors.start_at) setFieldError("start_at", v ? undefined : "Start date/time is required.")
                                    }}
                                    onBlur={() => setFieldError("start_at", form.start_at ? undefined : "Start date/time is required.")}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </label>
                            {errors.start_at ? <p className="text-xs text-rose-600">{errors.start_at}</p> : null}
                        </div>

                        <label className="text-xs text-slate-500">
                            Registration opens
                            <input
                                type="datetime-local"
                                value={form.reg_open_at}
                                onChange={(e) => {
                                    const v = e.target.value
                                    setForm({ ...form, reg_open_at: v })
                                    if (errors.reg_close_at) setFieldError("reg_close_at", undefined)
                                }}
                                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            />
                        </label>

                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">
                                Registration closes
                                <input
                                    type="datetime-local"
                                    value={form.reg_close_at}
                                    onChange={(e) => setForm({ ...form, reg_close_at: e.target.value })}
                                    onBlur={() => {
                                        if (form.reg_open_at && form.reg_close_at) {
                                            const open = new Date(form.reg_open_at).getTime()
                                            const close = new Date(form.reg_close_at).getTime()
                                            if (!Number.isNaN(open) && !Number.isNaN(close) && close < open) {
                                                setFieldError("reg_close_at", "Registration close must be after registration open.")
                                                return
                                            }
                                        }
                                        setFieldError("reg_close_at", undefined)
                                    }}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                />
                            </label>
                            {errors.reg_close_at ? <p className="text-xs text-rose-600">{errors.reg_close_at}</p> : null}
                        </div>
                    </div>

                    <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Description"
                    />

                    <button onClick={handleCreate} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        Create event
                    </button>
                </section>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Start</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {events.map((event) => (
                        <tr key={event.slug} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-800">{event.title}</td>
                            <td className="px-4 py-3 text-slate-600">{event.type}</td>
                            <td className="px-4 py-3 text-slate-600">{event.status}</td>
                            <td className="px-4 py-3 text-slate-600">
                                {event.start_at ? new Date(event.start_at).toLocaleDateString() : "-"}
                            </td>

                            {/* ✅ icons, same “chip link” style, just icon-only */}
                            <td className="px-4 py-3 text-xs">
                                <div className="flex flex-wrap gap-2">
                                    <Link
                                        href={`/admin/events/${event.slug}`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full font-semibold text-forest hover:bg-slate-50"
                                        aria-label="Manage event"
                                        title="Manage"
                                    >
                                        <Settings2 className="h-4 w-4" />
                                    </Link>

                                    <Link
                                        href={`/admin/registrations?event=${event.url_slug}`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full font-semibold text-slate-600 hover:bg-slate-50"
                                        aria-label="Registrations"
                                        title="Registrations"
                                    >
                                        <ClipboardList className="h-4 w-4" />
                                    </Link>

                                    <Link
                                        href={`/admin/results?event=${event.slug}`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full font-semibold text-slate-600 hover:bg-slate-50"
                                        aria-label="Results"
                                        title="Results"
                                    >
                                        <Medal className="h-4 w-4" />
                                    </Link>

                                    {/* kept Race Day link as-is unless you want an icon too */}
                                    <Link href={`/admin/bibs?event=${event.slug}`} className="font-semibold text-sky-600">
                                        Race Day
                                    </Link>
                                </div>
                            </td>
                        </tr>
                    ))}

                    {events.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                                No events found.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </main>
    )
}
