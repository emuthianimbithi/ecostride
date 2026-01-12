"use client"

import { useEffect, useState } from "react"
import { apiGet } from "../../../lib/api-client"
import { formatMoney } from "../../../lib/format"
import { isPaymentStatus, paymentStatusLabel, type PaymentStatus } from "../../../lib/payments"

type PaymentStatusResponse = {
  payment_id: string
  status: string
  provider: string
  currency: string
  amount_minor: number
  provider_ref: string
  created_at: string
  registration_slug?: string
  order_slug?: string
}

export default function Page({ params }: { params: { paymentId: string } }) {
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let interval: number

    const load = async () => {
      try {
        const data = await apiGet<PaymentStatusResponse>(`/public/payments/${params.paymentId}/status`)
        setPayment(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load")
      }
    }

    load()
    interval = window.setInterval(load, 5000)

    return () => window.clearInterval(interval)
  }, [params.paymentId])

  const registrationSlug = payment?.registration_slug ?? localStorage.getItem("registration_slug") ?? ""
  const status = (() => {
    const raw = payment?.status
    const val = raw ? String(raw).toLowerCase() : ""
    return isPaymentStatus(val) ? (val as PaymentStatus) : ("pending" as PaymentStatus)
  })()

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
                Payment failed. You can try again from the registration or support page.
              </div>
            )}
            {status === "success" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Payment received. You can download your confirmation now.
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {status === "success" && registrationSlug && (
                <a
                  className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  href={`/confirm/${registrationSlug}`}
                >
                  View confirmation
                </a>
              )}
              {status === "success" && !registrationSlug && (
                <a
                  className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  href="/support"
                >
                  Back to fundraising
                </a>
              )}
              <a className="inline-flex text-sm font-semibold text-primary" href="/events">
                Browse events
              </a>
              <a className="inline-flex text-sm font-semibold text-primary" href="/support">
                Visit fundraising
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
