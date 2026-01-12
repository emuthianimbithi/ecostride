export type PaymentStatus = "pending" | "success" | "failed" | "refunded" | "chargeback"

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === "pending" || value === "success" || value === "failed" || value === "refunded" || value === "chargeback"
}

export function paymentStatusLabel(status: PaymentStatus | "unknown") {
  switch (status) {
    case "pending":
      return "Pending"
    case "success":
      return "Success"
    case "failed":
      return "Failed"
    case "refunded":
      return "Refunded"
    case "chargeback":
      return "Chargeback"
    default:
      return "Unknown"
  }
}

export function paymentStatusBadgeClass(status: PaymentStatus | "unknown") {
  switch (status) {
    case "success":
      return "bg-emerald-100 text-emerald-700"
    case "failed":
      return "bg-rose-100 text-rose-700"
    case "refunded":
      return "bg-sky-100 text-sky-700"
    case "pending":
      return "bg-amber-100 text-amber-700"
    case "chargeback":
      return "bg-orange-100 text-orange-700"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

