"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { apiGet } from "../../../lib/api-client"
import { formatMoney } from "../../../lib/format"
import { getOrder, upsertOrder, type LocalOrder } from "../../../lib/orders-db"

type OrderApiResponse = {
    slug: string
    status?: string
    buyer_name?: string
    email?: string
    currency?: string
    total_minor: number
    CreatedAt?: string
    // add more fields if your backend returns them
}

function safeDate(value?: string) {
    if (!value) return ""
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString()
}

export default function Page() {
    const params = useParams()
    const orderSlug = String(params.orderSlug || "")

    const [order, setOrder] = useState<OrderApiResponse | null>(null)
    const [localOrder, setLocalOrder] = useState<LocalOrder | null>(null)
    const [error, setError] = useState<string | null>(null)

    // 1) Load from IndexedDB so you always show something
    useEffect(() => {
        if (!orderSlug) return
        getOrder(orderSlug)
            .then((o) => setLocalOrder(o))
            .catch(() => setLocalOrder(null))
    }, [orderSlug])

    // 2) Try backend (if you have an endpoint)
    useEffect(() => {
        if (!orderSlug) return

            ;(async () => {
            try {
                // ✅ CHANGE THIS if your backend uses a different endpoint
                // Common options:
                // - /public/shop/orders/:slug
                // - /public/orders/:slug
                const data = await apiGet<OrderApiResponse>(`/public/shop/${orderSlug}`)
                setOrder(data)
                setError(null)

                // also keep IndexedDB updated
                await upsertOrder({
                    slug: data.slug,
                    status: data.status,
                    name: data.buyer_name,
                    email: data.email,
                    currency: data.currency,
                    amount_minor: data.total_minor / 100,
                    created_at: data.CreatedAt
                })
            } catch (err) {
                // If endpoint doesn't exist, we still show the local copy
                setOrder(null)
                setError(err instanceof Error ? err.message : "Failed to load order")
            }
        })()
    }, [orderSlug])

    const display = useMemo(() => {
        // prefer backend, fallback to local
        if (order) {
            return {
                slug: order.slug,
                status: order.status ?? "unknown",
                name: order.buyer_name ?? "",
                email: order.email ?? "",
                currency: order.currency ?? "",
                amount_minor: order.total_minor ?? 0,
                created_at: order.CreatedAt ?? ""
            }
        }
        if (localOrder) {
            return {
                slug: localOrder.slug,
                status: localOrder.status ?? "unknown",
                name: localOrder.name ?? "",
                email: localOrder.email ?? "",
                currency: localOrder.currency ?? "",
                amount_minor: localOrder.amount_minor ?? 0,
                created_at: localOrder.created_at ?? ""
            }
        }
        return null
    }, [order, localOrder])

    if (!display) {
        return (
            <main className="px-6 py-12 md:py-16">
                <div className="mx-auto max-w-4xl space-y-4">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">Order not found</h1>
                    <p className="text-sm text-muted-foreground">
                        We could not load this order from the server or from this browser’s saved data.
                    </p>
                    <Link className="text-sm font-semibold text-primary" href="/orders">
                        Back to orders
                    </Link>
                </div>
            </main>
        )
    }

    return (
        <main className="px-6 py-12 md:py-16">
            <div className="mx-auto max-w-4xl space-y-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Order</h1>
                    <p className="text-sm text-muted-foreground md:text-base">
                        Reference: <span className="font-mono text-foreground">{display.slug}</span>
                    </p>
                </div>

                {error && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Couldn’t load full order details from the server. Showing saved details from this browser.
                    </div>
                )}

                <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Status</p>
                            <p className="text-sm font-semibold text-foreground">{display.status}</p>
                        </div>

                        {display.currency && (
                            <div className="text-right">
                                <p className="text-sm text-muted-foreground">Amount</p>
                                <p className="text-sm font-semibold text-foreground">
                                    {formatMoney(display.currency, display.amount_minor)}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                        <p>Buyer: {display.name || "-"}</p>
                        <p>Email: {display.email || "-"}</p>
                        <p>Created: {display.created_at ? safeDate(display.created_at) : "-"}</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Link className="inline-flex text-sm font-semibold text-primary" href="/orders">
                        Back to orders
                    </Link>
                    <Link className="inline-flex text-sm font-semibold text-primary" href="/shop">
                        Back to shop
                    </Link>
                    <Link className="inline-flex text-sm font-semibold text-primary" href="/support">
                        Support
                    </Link>
                </div>
            </div>
        </main>
    )
}
