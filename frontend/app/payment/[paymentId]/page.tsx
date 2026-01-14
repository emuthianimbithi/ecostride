"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { apiGet } from "../../../lib/api-client"
import { formatMoney } from "../../../lib/format"
import { isPaymentStatus, paymentStatusLabel, type PaymentStatus } from "../../../lib/payments"
import { upsertOrder } from "../../../lib/orders-db"
import { upsertRegistration } from "../../../lib/registrations-db"

type PaymentStatusResponse = {
    payment_id: string
    status: string
    provider: string
    currency: string
    amount_minor: number
    provider_ref: string
    created_at: string
    registration_slug?: string | null
    order_slug?: string | null
}

function normalizeStatus(raw?: string | null): PaymentStatus {
    const val = raw ? String(raw).toLowerCase() : ""
    return isPaymentStatus(val) ? (val as PaymentStatus) : ("pending" as PaymentStatus)
}

export default function Page() {
    const params = useParams()
    const router = useRouter()
    const paymentId = params.paymentId as string

    const [payment, setPayment] = useState<PaymentStatusResponse | null>(null)
    const [error, setError] = useState<string | null>(null)

    // prevent hammering indexeddb with same values every poll
    const lastSavedRef = useRef<{ reg?: string; order?: string; status?: string } | null>(null)

    useEffect(() => {
        if (!paymentId) return

        let interval: number

        const load = async () => {
            try {
                const data = await apiGet<PaymentStatusResponse>(`/public/payments/${paymentId}/status`)
                setPayment(data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load")
            }
        }

        load()
        interval = window.setInterval(load, 5000)
        return () => window.clearInterval(interval)
    }, [paymentId])

    const status = useMemo(() => normalizeStatus(payment?.status), [payment?.status])

    const registrationSlug = payment?.registration_slug ?? ""
    const orderSlug = payment?.order_slug ?? ""

    const kind = registrationSlug ? "registration" : orderSlug ? "order" : "unknown"

    // Save to IndexedDB once we know what it is
    useEffect(() => {
        if (!payment) return

        const last = lastSavedRef.current
        const nextKey = {
            reg: registrationSlug || undefined,
            order: orderSlug || undefined,
            status: status
        }

        // if nothing changed, skip
        if (
            last &&
            last.reg === nextKey.reg &&
            last.order === nextKey.order &&
            last.status === nextKey.status
        ) {
            return
        }

        ;(async () => {
            try {
                if (registrationSlug) {
                    // store minimal info; registrations page can later enrich from confirm fetch
                    await upsertRegistration({
                        slug: registrationSlug,
                        status: status
                    } as any) // if your type requires more fields, change upsertRegistration to accept partial
                }

                if (orderSlug) {
                    await upsertOrder({
                        slug: orderSlug,
                        status: status,
                        currency: payment.currency,
                        amount_minor: payment.amount_minor,
                        created_at: payment.created_at
                    })
                }

                lastSavedRef.current = nextKey
            } catch {
                // ignore indexeddb errors (private mode, blocked, etc.)
            }
        })()
    }, [payment, registrationSlug, orderSlug, status])

    // Auto redirect on success
    useEffect(() => {
        if (status !== "success") return

        if (registrationSlug) {
            const t = window.setTimeout(() => router.push(`/confirm/${registrationSlug}?print=1`), 1200)
            return () => window.clearTimeout(t)
        }

        if (orderSlug) {
            // ✅ change this route to your actual order confirmation page if different
            const t = window.setTimeout(() => router.push(`/orders/${orderSlug}`), 1200)
            return () => window.clearTimeout(t)
        }
    }, [status, registrationSlug, orderSlug, router])

    return (
        <main className="px-6 py-12 md:py-16">
            <div className="mx-auto max-w-4xl space-y-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Payment Status</h1>
                    <p className="text-sm text-muted-foreground md:text-base">
                        We are tracking your payment status. This page refreshes automatically.
                    </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                {payment ? (
                    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Provider: {payment.provider}</p>
                                <p className="text-sm text-muted-foreground">
                                    Amount: {formatMoney(payment.currency, payment.amount_minor)}
                                </p>
                            </div>
                            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                {paymentStatusLabel(status)}
              </span>
                        </div>

                        {status === "pending" && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                If you chose M-Pesa, check your phone and approve the STK prompt. This page will update automatically.
                            </div>
                        )}

                        {status === "failed" && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                Payment failed. You can try again from the relevant page.
                            </div>
                        )}

                        {status === "success" && kind === "registration" && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                Payment received. Preparing your ticket download...
                            </div>
                        )}

                        {status === "success" && kind === "order" && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                Payment received. Preparing your order confirmation...
                            </div>
                        )}

                        {status === "success" && kind === "unknown" && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                Payment received, but we couldn’t link it to a registration or order. Please contact support with Payment ID{" "}
                                <span className="font-mono">{payment.payment_id}</span>.
                            </div>
                        )}

                        <div className="flex flex-wrap gap-3">
                            {status === "success" && registrationSlug && (
                                <a
                                    className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                                    href={`/confirm/${registrationSlug}?print=1`}
                                >
                                    Download ticket
                                </a>
                            )}

                            {status === "success" && orderSlug && (
                                <a
                                    className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                                    href={`/orders/${orderSlug}`}
                                >
                                    View order
                                </a>
                            )}

                            <a className="inline-flex text-sm font-semibold text-primary" href="/events">
                                Browse events
                            </a>
                            <a className="inline-flex text-sm font-semibold text-primary" href="/support">
                                Visit support
                            </a>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Loading payment details...</p>
                )}
            </div>
        </main>
    )
}
