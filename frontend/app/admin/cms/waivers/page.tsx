"use client"

import { useEffect, useState } from "react"
import { apiGet, apiPost } from "../../../../lib/api-client"

type Waiver = {
  Slug: string
  Scope: string
  EventID?: number | null
  Version: number
  Title: string
  IsCurrent: boolean
  EffectiveAt: string
}

type Event = {
  ID: number
  Slug: string
  URLSlug: string
  Title: string
  StartAt: string
}

export default function Page() {
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [form, setForm] = useState({
    scope: "GLOBAL",
    version: "1",
    title: "",
    content: "",
    eventId: "",
    isCurrent: false
  })

  const loadWaivers = async () => {
    try {
      const data = await apiGet<Waiver[]>("/admin/waivers")
      setWaivers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    }
  }

  const loadEvents = async () => {
    try {
      const data = await apiGet<Event[]>("/admin/events")
      setEvents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events")
    }
  }

  useEffect(() => {
    void loadWaivers()
    void loadEvents()
  }, [])

  const handleCreate = async () => {
    setError(null)
    setStatus(null)
    if (!form.title || !form.content) {
      setError("Title and content required.")
      return
    }
    const version = Number(form.version)
    if (Number.isNaN(version)) {
      setError("Version must be numeric.")
      return
    }
    try {
      await apiPost("/admin/waivers", {
        scope: form.scope,
        version,
        title: form.title,
        content: form.content,
        event_id: form.scope === "EVENT" && form.eventId ? Number(form.eventId) : undefined,
        is_current: form.isCurrent
      })
      setStatus("Waiver created")
      setForm({ scope: "GLOBAL", version: "1", title: "", content: "", eventId: "", isCurrent: false })
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
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="GLOBAL">All events (global)</option>
            <option value="EVENT">Specific event</option>
          </select>
          <input
            value={form.version}
            onChange={(e) => setForm({ ...form, version: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Version number (e.g. 2)"
          />
        </div>
        {form.scope === "EVENT" && (
          <select
            value={form.eventId}
            onChange={(e) => setForm({ ...form, eventId: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Select event</option>
            {events.map((event) => (
              <option key={event.ID} value={event.ID}>
                {event.Title} ({event.StartAt ? new Date(event.StartAt).toLocaleDateString() : "TBD"})
              </option>
            ))}
          </select>
        )}
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Waiver title"
        />
        <textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          rows={4}
          placeholder="Paste the full waiver text here."
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.isCurrent}
            onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })}
          />
          Set as current
        </label>
        <button
          onClick={handleCreate}
          className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
        >
          Create waiver
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
            {waivers.map((waiver) => (
              <tr key={waiver.Slug} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {waiver.Scope === "EVENT" ? "Event" : "Global"}
                </td>
                <td className="px-4 py-3 text-slate-600">{waiver.Version}</td>
                <td className="px-4 py-3 text-slate-600">{waiver.Title}</td>
                <td className="px-4 py-3 text-slate-600">
                  {waiver.EventID
                    ? events.find((event) => event.ID === waiver.EventID)?.Title ?? "Event waiver"
                    : "All events"}
                </td>
                <td className="px-4 py-3 text-slate-600">{waiver.IsCurrent ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {waiver.EffectiveAt ? new Date(waiver.EffectiveAt).toLocaleDateString() : "-"}
                </td>
              </tr>
            ))}
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
