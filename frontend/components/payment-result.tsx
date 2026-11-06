"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { apiGet } from "../lib/api-client"
import { formatMoney } from "../lib/format"
import { paymentStatusLabel } from "../lib/payments"
import { upsertOrder } from "../lib/orders-db"
import { upsertRegistration } from "../lib/registrations-db"
import { EcoStrideLogo } from "./ecostride-logo"

type Payment = {
  payment_id: string
  status: string
  provider: string
  currency: string
  amount_minor: number
  created_at: string
  payer_name?: string
  description?: string
  checkout_url?: string
  receipt_url?: string
  registration_slug?: string | null
  order_slug?: string | null
}

function hostedCheckout(raw?: string) {
  try {
    const url = new URL(raw ?? "")
    return url.protocol === "https:" && !url.username && !url.password && ["pay.pesapal.com", "cybqa.pesapal.com"].includes(url.hostname) ? url.href : null
  } catch { return null }
}

export function PaymentResult({ checkout = false }: { checkout?: boolean }) {
  const params = useParams()
  const paymentId = params.paymentId as string
  const [payment, setPayment] = useState<Payment | null>(null)
  const [error, setError] = useState("")
  const saved = useRef("")

  useEffect(() => {
    if (!paymentId) return
    let active = true, loading = false
    setPayment(null)
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const data = await apiGet<Payment>(`/public/payments/${paymentId}/status`)
        if (active) { setPayment(data); setError("") }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Unable to confirm payment. Please keep your payment reference.") }
      finally { loading = false }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => { active = false; clearInterval(timer) }
  }, [paymentId])

  useEffect(() => {
    if (!payment) return
    const key = `${payment.payment_id}:${payment.status}`
    if (saved.current === key) return
    saved.current = key
    if (payment.registration_slug) void upsertRegistration({ slug: payment.registration_slug, status: payment.status } as any).catch(() => undefined)
    if (payment.order_slug) void upsertOrder({ slug: payment.order_slug, status: payment.status, currency: payment.currency, amount_minor: payment.amount_minor, created_at: payment.created_at }).catch(() => undefined)
  }, [payment])

  const status = payment?.status ?? "pending"
  const success = status === "success"
  const failed = status === "failed"
  const reversed = ["refunded", "chargeback"].includes(status)
  const checkoutURL = checkout && status === "pending" ? hostedCheckout(payment?.checkout_url) : null
  const primary = "inline-flex items-center justify-center rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white"
  const secondary = "inline-flex items-center justify-center rounded-full border border-forest/30 px-5 py-3 text-sm font-semibold text-forest"

  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 md:py-14">
    <header className="space-y-3">
      <EcoStrideLogo />
      <h1 className="font-display text-3xl text-forest sm:text-4xl">{success ? "Thank you. Your payment is confirmed." : failed ? "Your payment was not completed." : reversed ? "Payment returned" : checkout ? "Complete your payment" : "Payment status"}</h1>
      <p className="text-sm text-muted-foreground">{payment?.payer_name ? `${payment.payer_name}, ` : ""}{success ? "your receipt is available below." : failed ? "This attempt failed. Your purchase has not been marked paid." : reversed ? "This payment no longer provides a paid race entry or collection entitlement." : "Keep this page open. We’ll confirm the result automatically."}</p>
    </header>

    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{error} If you were charged, don’t pay again while we check.</p>}
    {!payment && !error && <p>Loading payment details…</p>}

    {payment && <>
      <section className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6" aria-label="Your payment summary">
        <div className="flex flex-wrap justify-between gap-4">
          <div className="space-y-2">
            {payment.description && <h2 className="font-semibold text-forest">{payment.description}</h2>}
            <p className="text-2xl font-semibold text-forest">{formatMoney(payment.currency, payment.amount_minor)}</p>
            <p className="break-all text-xs text-muted-foreground">Payment reference: {payment.payment_id}</p>
            <p className="text-xs text-muted-foreground">{payment.provider}</p>
          </div>
          <span className="h-fit rounded-full bg-sand-100 px-3 py-2 text-sm">{paymentStatusLabel(status as any)}</span>
        </div>
      </section>

      {checkoutURL && <section className="space-y-3" aria-label="Secure PesaPal checkout">
        <iframe title="PesaPal secure payment" src={checkoutURL} className="min-h-[780px] w-full rounded-2xl border border-sand-200 bg-white" allow="payment" referrerPolicy="strict-origin-when-cross-origin" />
        <p className="text-sm text-muted-foreground">Payment details are handled securely by PesaPal. If the form does not load, <a className="font-semibold text-forest underline" href={checkoutURL} target="_blank" rel="noopener noreferrer">open PesaPal in a new tab</a>. Keep this page open for your result.</p>
        <a className={secondary} href={`/payment/${paymentId}`}>Return to payment status</a>
      </section>}

      {status === "pending" && !checkoutURL && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">We’re waiting for PesaPal’s confirmation. If you’ve already paid, don’t submit another payment. This page checks automatically.</p>}
      {success && !payment.receipt_url && <p className="text-sm text-muted-foreground">Your payment is confirmed. Your receipt is being prepared; this page will update automatically.</p>}

      <div className="flex flex-wrap gap-3">
        {(success || status === "refunded") && payment.receipt_url && <a className={primary} href={payment.receipt_url}>Download receipt</a>}
        {success && payment.registration_slug && <a className={secondary} href={`/confirm/${payment.registration_slug}`}>View race confirmation</a>}
        {payment.order_slug && <a className={secondary} href={`/orders/${payment.order_slug}`}>View order</a>}
        <a className={secondary} href="/events">Browse events</a>
        <a className={secondary} href="/shop">Visit shop</a>
      </div>
    </>}
  </main>
}
