"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
    clearRegistrations,
    deleteRegistration,
    listRegistrations,
    type StoredRegistration
} from "../../lib/registrations-db"

function fmtDate(s?: string) {
    if (!s) return "-"
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleDateString()
}

export default function Page() {
    const [items, setItems] = useState<StoredRegistration[]>([])
    const [loading, setLoading] = useState(true)

    const load = async () => {
        setLoading(true)
        try {
            const all = await listRegistrations()
            setItems(all)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const empty = useMemo(() => !loading && items.length === 0, [loading, items.length])

    return (
        <main className="px-6 py-12 md:py-16">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Your registrations</h1>
                    <p className="text-sm text-muted-foreground md:text-base">
                        These are registrations made from this browser (saved locally).
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={load}
                        className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
                    >
                        Refresh
                    </button>
                    <button
                        onClick={async () => {
                            await clearRegistrations()
                            await load()
                        }}
                        className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
                    >
                        Clear all
                    </button>
                    <Link className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/events">
                        Browse events
                    </Link>
                </div>

                {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

                {empty && (
                    <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
                        No registrations saved on this browser yet.
                    </div>
                )}

                {items.length > 0 && (
                    <div className="grid gap-4">
                        {items.map((r) => (
                            <div key={r.slug} className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                            {r.event_title ?? r.event_slug ?? "Event"}
                                        </p>
                                        <p className="text-lg font-semibold text-foreground">{r.athlete_name || r.email || "Registration"}</p>
                                        <p className="text-sm text-muted-foreground">
                                            Code: <span className="font-mono">{r.slug}</span> • Status: {r.status}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Category: {r.category_name ?? "General"} • Registered: {fmtDate(r.created_at)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Last seen: {fmtDate(r.last_seen_at)}</p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Link
                                            className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                                            href={`/confirm/${r.slug}`}
                                        >
                                            View confirmation
                                        </Link>

                                        <button
                                            onClick={async () => {
                                                await deleteRegistration(r.slug)
                                                await load()
                                            }}
                                            className="inline-flex rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    )
}
