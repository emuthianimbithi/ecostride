"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet, apiPost } from "../../../lib/api-client"
import { useAuth } from "../../../components/auth-provider"
import { useToast } from "../../../components/toast"
import { IconAction } from "../../../components/icon-action"
import { paymentStatusBadgeClass, isPaymentStatus, paymentStatusLabel, type PaymentStatus as CanonicalPaymentStatus } from "../../../lib/payments"
import { Copy, Eye, ExternalLink, Mail, RotateCcw } from "lucide-react"

type Payment = {
  requires_review?: boolean
  payment_id: string
  status: string
  provider: "MPESA" | "STRIPE" | string
  currency: "KES" | "USD" | "EUR" | string
  amount_minor: number
  provider_ref: string
  created_at: string
  payer_name?: string | null
  payer_email?: string | null
  provider_dashboard_url?: string | null
}

type PaymentDetail = Payment & {
  requires_review: boolean
  pending_too_long: boolean
  submission_uncertain: boolean
  last_checked_at: string | null
  verification_attempts: number
  events: Array<{ type: string; received_at: string; processed_at: string | null }>
  delivery_jobs: Array<{ slug: string; type: string; status: string; attempts: number }>
  receipt: { number: string; delivered_email_at: string | null; pdf_ready: boolean } | null
}

export default function PaymentsPage() {
  const { toast } = useToast()
  const { hasPermission } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<PaymentDetail | null>(null)
  const [detailError, setDetailError] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setDetail(null)
    setDetailError("")
    apiGet<PaymentDetail>(`/admin/payments/${selected}`).then(data => {
      if (!cancelled) setDetail(data)
    }).catch(err => { if (!cancelled) setDetailError(err instanceof Error ? err.message : "Unable to load payment") })
    return () => { cancelled = true }
  }, [selected])
  const verifyPayment = async (payment: PaymentDetail) => {
    const reason = window.prompt("Reason for checking this payment with PesaPal")
    if (!reason?.trim() || busy) return
    setBusy(true)
    try {
      await apiPost(`/admin/payments/${payment.payment_id}/verify`, { reason: reason.trim() })
      setDetail(await apiGet<PaymentDetail>(`/admin/payments/${payment.payment_id}`))
      await loadPayments()
      toast({ title: "Status checked", description: "The payment was checked directly with PesaPal.", variant: "success" })
    } catch (err) {
      toast({ title: "Verification unavailable", description: err instanceof Error ? err.message : "Try again later", variant: "destructive" })
    } finally { setBusy(false) }
  }
  const resendReceipt = async (payment: Payment) => {
    const reason = window.prompt("Reason for resending this receipt")
    if (!reason?.trim() || busy) return
    setBusy(true)
    try {
      await apiPost(`/admin/payments/${payment.payment_id}/resend-receipt`, { reason: reason.trim() })
      toast({ title: "Receipt queued", description: "Delivery will use the saved receipt email address.", variant: "success" })
      if (selected === payment.payment_id) setDetail(await apiGet<PaymentDetail>(`/admin/payments/${payment.payment_id}`))
    } catch (err) {
      toast({ title: "Resend failed", description: err instanceof Error ? err.message : "Unable to queue receipt", variant: "destructive" })
    } finally { setBusy(false) }
  }
  const [payments, setPayments] = useState<Payment[]>([])
  const [filters, setFilters] = useState({
    status: "all",
    provider: "all",
    query: "",
    needsReview: false
  })

  useEffect(() => {
    loadPayments()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPayments = async () => {
    const params = new URLSearchParams()
    if (filters.status !== "all") params.set("status", filters.status)
    if (filters.provider !== "all") params.set("provider", filters.provider)
    if (filters.needsReview) params.set("needs_review", "true")
    const queryString = params.toString()
    setLoading(true)
    setLoadError("")
    try {
      const data = await apiGet<Payment[]>(`/admin/payments${queryString ? `?${queryString}` : ""}`)
      setPayments(data ?? [])
    } catch (err) {
      setLoadError("Unable to load payments. Try again.")
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load payments", variant: "destructive" })
    } finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    if (!payments) return []
    const q = filters.query.toLowerCase()
    if (!q) return payments
    return payments.filter(
      (payment) =>
        payment.payer_name?.toLowerCase().includes(q) ||
        payment.payer_email?.toLowerCase().includes(q) ||
        payment.provider_ref?.toLowerCase().includes(q) ||
        payment.payment_id.toLowerCase().includes(q)
    )
  }, [payments, filters.query])

  const handleRefund = async (payment: Payment) => {
    if (busy) return
    const reason = window.prompt("Refund reason")
    if (!reason?.trim()) return
    const manual = payment.provider.toUpperCase() === "MPESA"
    const action = manual ? "Record a full manual refund only after the funds have been returned" : "Submit a full refund"
    if (!window.confirm(`${action} for ${payment.payer_name || payment.payment_id}: ${payment.currency} ${(payment.amount_minor / 100).toFixed(2)}?`)) return
    setBusy(true)
    try {
      await apiPost(`/admin/payments/${payment.payment_id}/refund`, {
        reason: reason.trim(),
        manual
      });
      toast({ title: "Success", description: "Refund submitted", variant: "success" })
      await loadPayments()
    } catch (err) {
      toast({ title: "Refund Failed", description: err instanceof Error ? err.message : "Refund failed", variant: "destructive" })
    } finally { setBusy(false) }
  }

  const normalizeStatus = (raw: string): CanonicalPaymentStatus | "unknown" => {
    const val = String(raw ?? "").toLowerCase()
    if (isPaymentStatus(val)) return val
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("Unknown payment status:", raw)
    }
    return "unknown"
  }

  const canRefund = (payment: Payment) => hasPermission("payment.refund") && ["STRIPE", "MPESA"].includes(payment.provider.toUpperCase()) && normalizeStatus(payment.status) === "success"

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Payments</h1>
        <p className="text-sm text-slate-600">Track who paid, for what, and the payment status.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.needsReview} onChange={e => setFilters(prev => ({...prev, needsReview: e.target.checked}))} />Needs review</label>
        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          value={filters.provider}
          onChange={(e) => setFilters((prev) => ({ ...prev, provider: e.target.value }))}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700"
        >
          <option value="all">All Providers</option>
          <option value="stripe">Stripe</option>
          <option value="mpesa">M-Pesa</option>
          <option value="pesapal">PesaPal</option>
        </select>
        <input
          value={filters.query}
          onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm"
          placeholder="Search name, email, ref..."
        />
        <button
          onClick={loadPayments}
          className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
        >
          Filter
        </button>
      </div>

      {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
      {selected && <section aria-label="Payment details" className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
        <div className="flex justify-between"><h2 className="font-semibold">Payment details</h2><button onClick={() => setSelected(null)}>Close</button></div>
        {detailError ? <p role="alert">{detailError}</p> : !detail ? <p role="status">Loading details...</p> : <>
          <p className="break-all">{detail.payment_id} · {detail.provider} · {paymentStatusLabel(isPaymentStatus(detail.status) ? detail.status : "unknown")}</p>
          {detail.requires_review && <p className="text-amber-800">Needs finance review.</p>}
          {detail.submission_uncertain && <p>The provider submission outcome is unknown. Check the provider using the payment reference before taking further action.</p>}
          {detail.pending_too_long && <p>This payment has been pending for more than 15 minutes.</p>}
          <p>Receipt: {detail.receipt?.number ?? "Not issued"}. Email: {detail.receipt?.delivered_email_at ? "Delivered" : "Not yet delivered"}.</p>
          {detail.provider === "PESAPAL" && <>
            <p>Last verified response: {detail.last_checked_at ? new Date(detail.last_checked_at).toLocaleString() : "Not checked"}. Recovery attempts: {detail.verification_attempts ?? 0}.</p>
            {hasPermission("payment.verify") && <button disabled={busy || !detail.provider_ref} onClick={() => verifyPayment(detail)} className="rounded-full border px-4 py-2 disabled:opacity-50">Check status with PesaPal</button>}
          </>}
          <h3 className="font-medium">Payment history</h3>
          {(detail.events ?? []).map((event, i) => <p key={i}>{event.type} · {new Date(event.received_at).toLocaleString()} · {event.processed_at ? "Processed" : "Awaiting processing"}</p>)}
          {!detail.events?.length && <p>No payment notifications recorded.</p>}
          <h3 className="font-medium">Receipt delivery</h3>
          {(detail.delivery_jobs ?? []).map(job => <p key={job.slug}>{job.type === "receipt.email" ? "Email" : "PDF"} · {job.status} · Attempts: {job.attempts}</p>)}
        </>}
      </section>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Slug / Ref</th>
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((payment) => (
              <tr key={payment.payment_id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{payment.payment_id}</div>
                  <div className="text-xs text-slate-500">{payment.provider_ref || "-"}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-800">{payment.payer_name || "-"}</div>
                  <div className="text-xs text-slate-500">{payment.payer_email || "-"}</div>
                </td>
                <td className="px-4 py-3 text-slate-800">
                  {(payment.amount_minor / 100).toFixed(2)} {payment.currency}
                  <div className="text-xs text-slate-500 uppercase">{payment.provider}</div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const s = normalizeStatus(payment.status)
                    return (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${paymentStatusBadgeClass(s)}`}
                  >
                    {paymentStatusLabel(s)}
                  </span>
                    )
                  })()}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {payment.requires_review && <p className="text-amber-800">Needs review</p>}
                  {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex items-center gap-2">
                    <IconAction label="View details" onClick={() => setSelected(payment.payment_id)}>
                      <Eye className="h-4 w-4" />
                    </IconAction>
                    <IconAction
                      label="Copy transaction reference"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(payment.provider_ref || payment.payment_id)
                          toast({ title: "Copied", description: "Reference copied to clipboard", variant: "success" })
                        } catch {
                          toast({ title: "Copy failed", description: "Could not copy", variant: "destructive" })
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </IconAction>
                    {payment.provider_dashboard_url ? (
                      <IconAction label="Open provider dashboard" href={payment.provider_dashboard_url}>
                        <ExternalLink className="h-4 w-4" />
                      </IconAction>
                    ) : null}
                    {canRefund(payment) ? (
                      <IconAction disabled={busy} label="Refund" onClick={() => handleRefund(payment)}>
                        <RotateCcw className="h-4 w-4" />
                      </IconAction>
                    ) : null}
                    {hasPermission("payment.receipt.resend") && ["success", "refunded"].includes(normalizeStatus(payment.status)) ? (
                      <IconAction
                        label="Resend receipt"
                        disabled={busy}
                        onClick={() => resendReceipt(payment)}
                      >
                        <Mail className="h-4 w-4" />
                      </IconAction>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  {loading ? "Loading payments..." : loadError ? "Payments unavailable." : "No payments found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
