"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { IconAction } from "../../../components/icon-action"
import { paymentStatusBadgeClass, isPaymentStatus, paymentStatusLabel, type PaymentStatus as CanonicalPaymentStatus } from "../../../lib/payments"
import { Copy, Eye, ExternalLink, Mail, RotateCcw } from "lucide-react"

type Payment = {
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

export default function PaymentsPage() {
  const { toast } = useToast()
  const [payments, setPayments] = useState<Payment[]>([])
  // removed error/status states
  const [filters, setFilters] = useState({
    status: "all",
    provider: "all",
    query: ""
  })

  useEffect(() => {
    loadPayments()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPayments = async () => {
    const params = new URLSearchParams()
    if (filters.status !== "all") params.set("status", filters.status)
    if (filters.provider !== "all") params.set("provider", filters.provider)
    const queryString = params.toString()
    try {
      const data = await apiGet<Payment[]>(`/admin/payments${queryString ? `?${queryString}` : ""}`)
      setPayments(data ?? [])
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load payments", variant: "destructive" })
    }
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
    const reason = window.prompt("Refund reason (optional)") ?? ""
    const amount = window.prompt("Refund amount in minor units (leave blank for full refund)") ?? ""
    const amountMinor = amount.trim() ? Number(amount) : undefined
    if (amountMinor !== undefined && Number.isNaN(amountMinor)) {
      toast({ title: "Validation Error", description: "Invalid refund amount", variant: "destructive" })
      return
    }

    try {
      await apiPost(`/admin/payments/${payment.payment_id}/refund`, {
        Reason: reason,
        AmountMinor: amountMinor,
        Manual: payment.provider.toUpperCase() === "MPESA"
      });
      toast({ title: "Success", description: "Refund submitted", variant: "success" })
      await loadPayments()
    } catch (err) {
      toast({ title: "Refund Failed", description: err instanceof Error ? err.message : "Refund failed", variant: "destructive" })
    }
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

  const canRefund = (payment: Payment) => normalizeStatus(payment.status) === "success"

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Payments</h1>
        <p className="text-sm text-slate-600">Track who paid, for what, and the payment status.</p>
      </div>

      <div className="flex flex-wrap gap-3">
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
                  {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex items-center gap-2">
                    <IconAction label="View details" href={`/admin/payments?query=${encodeURIComponent(payment.payment_id)}`}>
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
                      <IconAction label="Refund" onClick={() => handleRefund(payment)}>
                        <RotateCcw className="h-4 w-4" />
                      </IconAction>
                    ) : null}
                    {normalizeStatus(payment.status) === "success" || normalizeStatus(payment.status) === "refunded" ? (
                      <IconAction
                        label="Resend receipt"
                        onClick={async () => {
                          toast({ title: "Not implemented", description: "Receipt resend endpoint not available yet.", variant: "destructive" })
                        }}
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
                  No payments found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
