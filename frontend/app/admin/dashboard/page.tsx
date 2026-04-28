"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, CircleDollarSign, Users } from "lucide-react"
import { useAuth } from "../../../components/auth-provider"
import { apiGet } from "../../../lib/api-client"

type Registration = {
  slug: string
  status: string
  payment_status?: string
  payment_currency?: string
  payment_amount_minor?: number
  bib_number?: number
  created_at?: string
}

type Payment = {
  payment_id: string
  status: string
  currency: string
  amount_minor: number
  created_at?: string
}

type Volunteer = {
  slug: string
  assignments?: Array<{ status?: string | null }>
}

type DonutSlice = {
  label: string
  value: number
  color: string
}

function isSameDay(date: Date, other: Date) {
  return (
    date.getFullYear() === other.getFullYear() &&
    date.getMonth() === other.getMonth() &&
    date.getDate() === other.getDate()
  )
}

function toDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function moneyLineByCurrency(payments: Payment[], statuses: Set<string>) {
  return payments.reduce<Record<string, number>>((acc, payment) => {
    if (!statuses.has(String(payment.status).toLowerCase())) return acc
    const currency = String(payment.currency || "UNK").toUpperCase()
    acc[currency] = (acc[currency] || 0) + Number(payment.amount_minor || 0)
    return acc
  }, {})
}

function lastNDaysSeries(inputDates: Array<Date | null>, days: number) {
  const now = new Date()
  const labels: string[] = []
  const values = Array.from({ length: days }, () => 0)

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now)
    day.setDate(now.getDate() - i)
    labels.push(day.toLocaleDateString(undefined, { month: "short", day: "numeric" }))
  }

  inputDates.forEach((date) => {
    if (!date) return
    for (let i = 0; i < days; i++) {
      const day = new Date(now)
      day.setDate(now.getDate() - (days - 1 - i))
      if (isSameDay(date, day)) {
        values[i] += 1
      }
    }
  })

  return { labels, values }
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100
      const y = 100 - (value / max) * 100
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg viewBox="0 0 100 100" className="h-14 w-full">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function PaymentDonut({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  if (total === 0) {
    return <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No payments yet.</div>
  }

  let current = 0
  const background = slices
    .map((slice) => {
      const start = (current / total) * 360
      current += slice.value
      const end = (current / total) * 360
      return `${slice.color} ${start}deg ${end}deg`
    })
    .join(", ")

  return (
    <div className="space-y-3">
      <div
        className="mx-auto h-40 w-40 rounded-full border border-border"
        style={{ background: `conic-gradient(${background})` }}
      />
      <div className="grid gap-2">
        {slices.map((slice) => (
          <div key={slice.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="text-foreground">{slice.label}</span>
            </div>
            <span className="font-semibold text-foreground">{slice.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const { user, hasPermission } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const tasks: Array<Promise<unknown>> = []
        const loaders: Array<(value: unknown) => void> = []

        if (hasPermission("registration.read")) {
          tasks.push(apiGet<Registration[]>("/admin/registrations"))
          loaders.push((value) => setRegistrations(Array.isArray(value) ? (value as Registration[]) : []))
        }
        if (hasPermission("payment.read")) {
          tasks.push(apiGet<Payment[]>("/admin/payments"))
          loaders.push((value) => setPayments(Array.isArray(value) ? (value as Payment[]) : []))
        }
        if (hasPermission("volunteer.read")) {
          tasks.push(apiGet<Volunteer[]>("/admin/volunteers"))
          loaders.push((value) => setVolunteers(Array.isArray(value) ? (value as Volunteer[]) : []))
        }

        const settled = await Promise.allSettled(tasks)
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") {
            loaders[index](result.value)
          }
        })

        if (settled.some((item) => item.status === "rejected")) {
          setError("Some dashboard sources failed to load. Showing available data.")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [hasPermission])

  const now = new Date()
  const registrationDates = registrations.map((item) => toDate(item.created_at))
  const paymentDates = payments.map((item) => toDate(item.created_at))

  const registrationsToday = registrations.filter((item) => {
    const date = toDate(item.created_at)
    return date ? isSameDay(date, now) : false
  }).length

  const outstandingPayments = registrations.filter((item) => {
    const status = String(item.status || "").toLowerCase()
    const paymentStatus = String(item.payment_status || "").toLowerCase()
    return status === "pending_payment" || paymentStatus === "pending"
  }).length

  const volunteersConfirmed = volunteers.filter((volunteer) => {
    const assignments = Array.isArray(volunteer.assignments) ? volunteer.assignments : []
    return assignments.some((assignment) => {
      const status = String(assignment?.status || "").toLowerCase()
      return status === "assigned" || status === "completed"
    })
  }).length

  const revenue7d = moneyLineByCurrency(
    payments.filter((payment) => {
      const date = toDate(payment.created_at)
      if (!date) return false
      const daysAgo = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      return daysAgo <= 7
    }),
    new Set(["success"])
  )

  const registrationTrend = lastNDaysSeries(registrationDates, 7)
  const paymentTrend = lastNDaysSeries(
    payments
      .filter((payment) => String(payment.status || "").toLowerCase() === "success")
      .map((payment) => toDate(payment.created_at)),
    7
  )

  const unassignedBibs = registrations.filter((item) => {
    const status = String(item.status || "").toLowerCase()
    return (status === "paid" || status === "confirmed") && item.bib_number == null
  }).length

  const failedPayments = payments.filter((payment) => String(payment.status || "").toLowerCase() === "failed").length
  const pendingReconciliation = payments.filter((payment) => {
    const status = String(payment.status || "").toLowerCase()
    return status === "pending" || status === "chargeback"
  }).length

  const paymentSlices: DonutSlice[] = [
    { label: "Success", value: payments.filter((p) => String(p.status).toLowerCase() === "success").length, color: "#1d9a67" },
    { label: "Pending", value: payments.filter((p) => String(p.status).toLowerCase() === "pending").length, color: "#dd8d20" },
    { label: "Failed", value: payments.filter((p) => String(p.status).toLowerCase() === "failed").length, color: "#cb3d3d" },
    { label: "Refunded", value: payments.filter((p) => String(p.status).toLowerCase() === "refunded").length, color: "#2e6c96" }
  ].filter((slice) => slice.value > 0)

  const kpis = [
    {
      title: "Registrations today",
      value: registrationsToday.toString(),
      note: "New signups in the last 24h",
      icon: <Users className="h-4 w-4" />
    },
    {
      title: "7-day revenue",
      value:
        Object.keys(revenue7d).length > 0
          ? Object.entries(revenue7d)
              .map(([currency, minor]) => `${currency} ${(minor / 100).toFixed(2)}`)
              .join(" • ")
          : "No revenue yet",
      note: "Successful payments by currency",
      icon: <CircleDollarSign className="h-4 w-4" />
    },
    {
      title: "Outstanding payments",
      value: outstandingPayments.toString(),
      note: "Registrations still pending payment",
      icon: <AlertCircle className="h-4 w-4" />
    },
    {
      title: "Volunteers confirmed",
      value: volunteersConfirmed.toString(),
      note: "Assigned or completed volunteers",
      icon: <CheckCircle2 className="h-4 w-4" />
    }
  ]

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Welcome back{user ? `, ${user.name}` : ""}. Monitor registrations, payments, and operations at a glance.
        </p>
      </div>

      {error ? <div className="rounded-lg bg-warning/10 px-4 py-2 text-sm text-warning">{error}</div> : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="mt-4 h-7 w-36 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-28 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <div key={kpi.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                  <span>{kpi.title}</span>
                  <span className="text-tide-700">{kpi.icon}</span>
                </div>
                <div className="mt-2 text-lg font-semibold text-forest">{kpi.value}</div>
                <p className="mt-2 text-xs text-slate-500">{kpi.note}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_1.2fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Registrations (7d)</h2>
                <span className="text-xs text-slate-500">{registrationTrend.labels[0]} - {registrationTrend.labels[registrationTrend.labels.length - 1]}</span>
              </div>
              <div className="mt-4 text-tide-700">
                <Sparkline values={registrationTrend.values} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Low: {Math.min(...registrationTrend.values, 0)}</span>
                <span>High: {Math.max(...registrationTrend.values, 0)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Successful Payments (7d)</h2>
                <span className="text-xs text-slate-500">{paymentTrend.labels[0]} - {paymentTrend.labels[paymentTrend.labels.length - 1]}</span>
              </div>
              <div className="mt-4 text-forest">
                <Sparkline values={paymentTrend.values} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Low: {Math.min(...paymentTrend.values, 0)}</span>
                <span>High: {Math.max(...paymentTrend.values, 0)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Payment Status Mix</h2>
              <div className="mt-4">
                <PaymentDonut slices={paymentSlices} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Needs Attention</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Link
                href="/admin/payments?status=failed"
                className="rounded-xl border border-danger/20 bg-danger/5 p-4 transition hover:bg-danger/10"
              >
                <p className="text-xs uppercase tracking-[0.15em] text-danger">Failed payments</p>
                <p className="mt-2 text-2xl font-semibold text-danger">{failedPayments}</p>
                <p className="mt-1 text-xs text-danger/80">Follow up and retry collection</p>
              </Link>
              <Link
                href="/admin/bibs"
                className="rounded-xl border border-warning/20 bg-warning/5 p-4 transition hover:bg-warning/10"
              >
                <p className="text-xs uppercase tracking-[0.15em] text-warning">Unassigned bibs</p>
                <p className="mt-2 text-2xl font-semibold text-warning">{unassignedBibs}</p>
                <p className="mt-1 text-xs text-warning/80">Paid/confirmed runners without bib numbers</p>
              </Link>
              <Link
                href="/admin/reconciliation"
                className="rounded-xl border border-tide-200 bg-tide-50 p-4 transition hover:bg-tide-100"
              >
                <p className="text-xs uppercase tracking-[0.15em] text-tide-700">Pending reconciliation</p>
                <p className="mt-2 text-2xl font-semibold text-tide-700">{pendingReconciliation}</p>
                <p className="mt-1 text-xs text-tide-700/80">Pending or chargeback payment records</p>
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
