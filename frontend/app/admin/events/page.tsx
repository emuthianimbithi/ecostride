"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"

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
  // removed error/status states
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    slug: "",
    type: "MARATHON",
    title: "",
    description: "",
    location: "",
    mapUrl: "",
    startAt: "",
    regOpenAt: "",
    regCloseAt: "",
    status: "draft"
  })

  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    try {
      const data = await apiGet<Event[]>("/admin/events")
      setEvents(data)
    } catch (err) {
      toast({ title: "Failed to load events", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" })
    }
  }

  const handleCreate = async () => {
    if (!form.slug || !form.title || !form.startAt) {
      toast({ title: "Validation Error", description: "Slug, title, and start date are required.", variant: "destructive" })
      return
    }

    try {
      await apiPost("/admin/events", {
        Slug: form.slug,
        Type: form.type,
        Title: form.title,
        Description: form.description,
        Location: form.location,
        MapURL: form.mapUrl,
        StartAt: new Date(form.startAt).toISOString(),
        RegOpenAt: form.regOpenAt ? new Date(form.regOpenAt).toISOString() : undefined,
        RegCloseAt: form.regCloseAt ? new Date(form.regCloseAt).toISOString() : undefined,
        Status: form.status
      })
      toast({ title: "Success", description: "Event created successfully", variant: "success" })
      setForm({
        slug: "",
        type: "MARATHON",
        title: "",
        description: "",
        location: "",
        mapUrl: "",
        startAt: "",
        regOpenAt: "",
        regCloseAt: "",
        status: "draft"
      })
      setShowForm(false)
      await loadEvents()
    } catch (err) {
      toast({ title: "Creation Failed", description: err instanceof Error ? err.message : "Failed to create event", variant: "destructive" })
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
          onClick={() => setShowForm((prev) => !prev)}
          className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Close" : "New event"}
        </button>
      </div>

      {/* Error/Status banners removed in favor of toasts */}

      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">New Event</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Title"
            />
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="URL slug"
            />
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
              value={form.mapUrl}
              onChange={(e) => setForm({ ...form, mapUrl: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Map URL"
            />
            <label className="text-xs text-slate-500">
              Start date/time
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              Registration opens
              <input
                type="datetime-local"
                value={form.regOpenAt}
                onChange={(e) => setForm({ ...form, regOpenAt: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              Registration closes
              <input
                type="datetime-local"
                value={form.regCloseAt}
                onChange={(e) => setForm({ ...form, regCloseAt: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            placeholder="Description"
          />
          <button
            onClick={handleCreate}
            className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
          >
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
                <td className="px-4 py-3 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/events/${event.slug}`} className="font-semibold text-forest">
                      Manage
                    </Link>
                    <Link href={`/admin/registrations?event=${event.url_slug}`} className="font-semibold text-slate-600">
                      Registrations
                    </Link>
                    <Link href={`/admin/bibs?event=${event.slug}`} className="font-semibold text-sky-600">
                      Race Day
                    </Link>
                    <Link href={`/admin/results?event=${event.slug}`} className="font-semibold text-slate-600">
                      Results
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
