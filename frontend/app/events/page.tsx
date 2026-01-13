"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { apiGet } from "../../lib/api-client"
import { formatDate, registrationWindowLabel, registrationWindowStatus } from "../../lib/format"

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

export default function Page() {
    const [events, setEvents] = useState<Event[]>([])
    const [query, setQuery] = useState("")
    const [type, setType] = useState("all")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        const handle = window.setTimeout(async () => {
            // cancel previous request
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
                // Ignore abort errors
                if (err instanceof DOMException && err.name === "AbortError") return
                if (err instanceof Error && err.message.includes("AbortError")) return

                setError(err instanceof Error ? err.message : "Failed to load events")
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }, 1000)

        return () => window.clearTimeout(handle)
    }, [query])

    // client-side type filter only (search is server-side)
    const filtered = useMemo(() => {
        return events.filter((event) => {
            if (type !== "all" && event.type !== type) return false
            return true
        })
    }, [events, type])

    return (
        <main className="px-6 py-12 md:py-16">
            <div className="mx-auto max-w-6xl space-y-10">
                <div className="space-y-3">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Events</h1>
                    <p className="text-sm text-muted-foreground md:text-base">Explore races, cleanups, and seminars.</p>
                </div>

                <div className="flex flex-wrap gap-3 rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="min-w-[220px] flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Search by event or location"
                    />

                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="all">All types</option>
                        {typeOptions.map((option) => (
                            <option key={option} value={option}>
                                {option.replace("_", " ")}
                            </option>
                        ))}
                    </select>

                    {loading && (
                        <span className="ml-auto self-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Loading…
            </span>
                    )}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="grid gap-5 md:grid-cols-2">
                    {filtered.map((event) => {
                        const regStatus = registrationWindowStatus(event.reg_open_at, event.reg_close_at)
                        const regBadgeClass =
                            regStatus === "open"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : regStatus === "closed"
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700"

                        return (
                            <Link
                                key={event.slug}
                                href={`/events/${event.url_slug}`}
                                className="group rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <h2 className="text-xl font-semibold text-foreground">{event.title}</h2>
                                        <p className="text-sm text-muted-foreground">{event.location}</p>
                                    </div>
                                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {event.type?.replace("_", " ") ?? ""}
                  </span>
                                </div>

                                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-muted-foreground/80">
                                    {formatDate(event.start_at)}
                                </p>

                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-1 uppercase tracking-wide">
                    {event.status}
                  </span>
                                    <span className={`rounded-full border px-2 py-1 uppercase tracking-wide ${regBadgeClass}`}>
                    {registrationWindowLabel(event.reg_open_at, event.reg_close_at)}
                  </span>
                                </div>
                            </Link>
                        )
                    })}

                    {!loading && filtered.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                            No events match your filters yet.
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}
