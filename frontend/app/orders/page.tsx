"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { listOrders, deleteOrder, type LocalOrder } from "../../lib/orders-db"

export default function Page() {
    const [orders, setOrders] = useState<LocalOrder[]>([])
    const [error, setError] = useState<string | null>(null)

    const load = async () => {
        try {
            const data = await listOrders()
            setOrders(data)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load orders")
        }
    }

    useEffect(() => {
        load()
    }, [])

    return (
        <main className="px-6 py-12 md:py-16">
            <div className="mx-auto max-w-4xl space-y-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Orders</h1>
                    <p className="text-sm text-muted-foreground md:text-base">
                        Orders saved on this browser.
                    </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                {orders.length === 0 ? (
                    <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
                        No saved orders yet.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {orders.map((o) => (
                            <div key={o.slug} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="text-sm text-muted-foreground">Order</p>
                                        <p className="font-mono text-sm text-foreground">{o.slug}</p>
                                        {o.status && <p className="text-xs text-muted-foreground">Status: {o.status}</p>}
                                    </div>

                                    <div className="flex gap-3">
                                        <Link className="text-sm font-semibold text-primary" href={`/orders/${o.slug}`}>
                                            View
                                        </Link>
                                        <button
                                            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                                            onClick={async () => {
                                                await deleteOrder(o.slug)
                                                load()
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-3">
                    <Link className="text-sm font-semibold text-primary" href="/events">
                        Browse events
                    </Link>
                    <Link className="text-sm font-semibold text-primary" href="/support">
                        Visit support
                    </Link>
                </div>
            </div>
        </main>
    )
}
