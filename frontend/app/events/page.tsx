"use client"

import Link from "next/link"
import { MapPin } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { apiGet } from "../../lib/api-client"
import { formatDate } from "../../lib/format"

type Event = {
  slug: string
  url_slug: string
  title: string
  type: string
  location: string
  start_at: string
  status: string
  reg_open_at?: string | null
  reg_close_at?: string | null
}

const typeOptions = ["MARATHON", "SEMINAR", "BEACH_CLEANUP", "OTHER"]

function buildEventsPath(search: string) {
  const q = search.trim()
  if (!q) return "/public/events"
  const sp = new URLSearchParams({ search: q })
  return `/public/events?${sp.toString()}`
}

function inferDistanceBadge(title: string) {
  const normalized = title.toUpperCase()
  const patterns = ["42K", "21K", "10K", "5K"]
  for (const pattern of patterns) {
    if (normalized.includes(pattern)) {
      return pattern
    }
  }
  return "OPEN"
}

function ecoCauseTag(type: string) {
  const normalized = type.toUpperCase()
  if (normalized.includes("CLEANUP")) return "Plastic-free coast"
  if (normalized.includes("SEMINAR")) return "Citizen science"
  if (normalized.includes("MARATHON")) return "Mangrove restoration"
  return "Estuary action"
}

function registrationCloseLabel(closeAt?: string | null) {
  if (!closeAt) {
    return "Registration window available"
  }
  const close = new Date(closeAt)
  const now = new Date()
  const diff = close.getTime() - now.getTime()
  if (Number.isNaN(close.getTime())) {
    return "Registration window available"
  }
  if (diff <= 0) {
    return "Registration closed"
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  if (days > 0) return `Registration closes in ${days}d ${hours}h`
  return `Registration closes in ${Math.max(hours, 1)}h`
}

function registrationPillClass(closeAt?: string | null) {
  const close = closeAt ? new Date(closeAt) : null
  if (!close || Number.isNaN(close.getTime())) return "border-tide-200 bg-tide-50 text-tide-700"
  if (close.getTime() < Date.now()) return "border-danger/20 bg-danger/10 text-danger"
  return "border-warning/20 bg-warning/10 text-warning"
}

export default function Page() {
  const [events, setEvents] = useState<Event[]>([])
  const [query, setQuery] = useState("")
  const [type, setType] = useState("all")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)

      try {
        const path = buildEventsPath(query)
        // @ts-ignore
        const data = await apiGet<Event[]>(path, { signal: controller.signal })
        setEvents(Array.isArray(data) ? data : [])
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        if (err instanceof Error && err.message.includes("AbortError")) return
        setError(err instanceof Error ? err.message : "Failed to load events")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 700)

    return () => window.clearTimeout(handle)
  }, [query])

  const filtered = useMemo(
    () => events.filter((event) => (type === "all" ? true : event.type === type)),
    [events, type]
  )

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="space-y-3">
          <h1 className="font-display text-h1 tracking-tight text-foreground md:text-display-lg">Find your next estuary run</h1>
          <p className="text-body text-muted-foreground">Choose your distance, location, and cause. Every registration funds coastal conservation.</p>
        </div>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-border/70 bg-card/90 p-3 shadow-sm">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-[220px] flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            placeholder="Search event title or location"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="all">All types</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {loading ? <span className="ml-auto self-center text-caption uppercase tracking-[0.2em] text-muted-foreground">Loading…</span> : null}
        </div>

        {error ? <p className="text-body text-danger">{error}</p> : null}

        <div className="grid gap-5 md:grid-cols-2">
          {filtered.map((event) => (
            <Link
              key={event.slug}
              href={`/events/${event.url_slug}`}
              prefetch
              className="group rounded-2xl border border-border/70 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-tide-300 hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-tide-200 bg-tide-50 px-2.5 py-1 text-caption font-semibold uppercase tracking-[0.15em] text-tide-700">
                  {inferDistanceBadge(event.title)}
                </span>
                <span className="rounded-full border border-forest-200 bg-forest-50 px-2.5 py-1 text-caption font-semibold text-forest-700">
                  {ecoCauseTag(event.type)}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 text-caption font-semibold ${registrationPillClass(event.reg_close_at)}`}
                >
                  {registrationCloseLabel(event.reg_close_at)}
                </span>
              </div>

              <h2 className="mt-4 text-h3 font-semibold text-foreground group-hover:text-primary">{event.title}</h2>

              <div className="mt-2 flex items-center gap-2 text-body text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{event.location}</span>
              </div>

              <p className="mt-3 text-caption uppercase tracking-[0.18em] text-muted-foreground">{formatDate(event.start_at)}</p>
            </Link>
          ))}

          {!loading && filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-body text-muted-foreground">
              No events match your filters yet.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
