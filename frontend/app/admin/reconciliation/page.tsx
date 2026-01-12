"use client"

import { useMemo, useState } from "react"
import { apiFetch, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"

type ReconcileRow = {
  RowNumber: number
  Date: string
  AmountMinor: number
  Currency: string
  Reference: string
  Description: string
  Hash: string
  MatchSlug: string
  Status: string
  PaymentSlug?: string
}

type ImportResponse = {
  import_id: string
  summary: {
    total: number
    matched: number
    unmatched: number
    errors: number
  }
  errors: Array<{ row: number; error: string }>
  rows: ReconcileRow[]
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null)
  const [mapping, setMapping] = useState({
    date: "",
    amount: "",
    reference: "",
    description: "",
    currency: ""
  })
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [matchInputs, setMatchInputs] = useState<Record<string, string>>({})
  const [resolveInputs, setResolveInputs] = useState<Record<string, string>>({})
  const { toast } = useToast()

  const handleImport = async () => {
    if (!file) {
      setError("Please choose a bank statement file.")
      return
    }
    setError(null)
    setStatus("Importing...")
    const form = new FormData()
    form.append("file", file)

    const mappingPayload = Object.values(mapping).some((value) => value.trim())
      ? JSON.stringify(mapping)
      : ""
    if (mappingPayload) {
      form.append("mapping", mappingPayload)
    }

    try {
      const data = await apiFetch<ImportResponse>("/admin/reconciliation/import", {
        method: "POST",
        body: form
      })
      setResult(data)
      setStatus("Import complete")
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Import failed")
      setStatus(null)
    }
  }

  const handleMatch = async (matchSlug: string) => {
    const paymentSlug = matchInputs[matchSlug]
    if (!paymentSlug) {
      setError("Payment ID required.")
      return
    }
    setError(null)
    try {
      await apiPost("/admin/reconciliation/match", {
        match_slug: matchSlug,
        payment_slug: paymentSlug
      })
      setStatus("Match updated")
      setResult((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((row) =>
                row.MatchSlug === matchSlug ? { ...row, Status: "matched", PaymentSlug: paymentSlug } : row
              )
            }
          : prev
      )
      setMatchInputs((prev) => ({ ...prev, [matchSlug]: "" }))
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to match")
    }
  }

  const handleResolve = async (matchSlug: string) => {
    setError(null)
    try {
      await apiPost("/admin/reconciliation/resolve", {
        match_slug: matchSlug,
        notes: resolveInputs[matchSlug] ?? ""
      })
      setStatus("Marked as resolved")
      setResult((prev) =>
        prev
          ? { ...prev, rows: prev.rows.map((row) => (row.MatchSlug === matchSlug ? { ...row, Status: "resolved" } : row)) }
          : prev
      )
      setResolveInputs((prev) => ({ ...prev, [matchSlug]: "" }))
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to resolve")
    }
  }

  const filteredRows = useMemo(() => {
    if (!result) return []
    const rows = filter === "all" ? result.rows : result.rows.filter((row) => row.Status === filter)
    if (!query.trim()) return rows
    const q = query.toLowerCase()
    return rows.filter(
      (row) =>
        row.Reference.toLowerCase().includes(q) ||
        row.Description.toLowerCase().includes(q) ||
        row.MatchSlug.toLowerCase().includes(q)
    )
  }, [result, filter, query])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Reconciliation</h1>
        <p className="text-sm text-slate-600">
          Reconciliation links bank statement deposits to recorded payments so you can spot missing or extra payments.
        </p>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">1. Upload Bank Statement</h2>
        <div className="space-y-2">
          <label className="block text-sm text-slate-600">Bank statement CSV/XLSX</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={mapping.date}
            onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Date column name (optional)"
          />
          <input
            value={mapping.amount}
            onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Amount column name (optional)"
          />
          <input
            value={mapping.reference}
            onChange={(e) => setMapping({ ...mapping, reference: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Reference column name (optional)"
          />
          <input
            value={mapping.description}
            onChange={(e) => setMapping({ ...mapping, description: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Description column name (optional)"
          />
          <input
            value={mapping.currency}
            onChange={(e) => setMapping({ ...mapping, currency: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Currency column name (optional)"
          />
        </div>
        <button
          onClick={handleImport}
          className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
        >
          Import statement
        </button>
      </section>

      {result && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">2. Review Matches</h2>
              <p className="text-sm text-slate-600">
                {result.summary.total} rows • {result.summary.matched} matched • {result.summary.unmatched} unmatched
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm"
              >
                <option value="all">All</option>
                <option value="matched">Matched</option>
                <option value="unmatched">Unmatched</option>
                <option value="resolved">Resolved</option>
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm"
                placeholder="Search reference or match ID"
              />
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {result.errors.length} rows had parsing errors. Re-upload after fixing the CSV formatting.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Status</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.MatchSlug}>
                    <td className="py-2 text-slate-600">{row.Status}</td>
                    <td className="text-slate-600">
                      <div className="font-medium text-slate-800">{row.Reference || "-"}</div>
                      <div className="text-xs text-slate-500">{row.Description}</div>
                    </td>
                    <td className="text-slate-600">
                      {row.Currency} {row.AmountMinor}
                    </td>
                    <td className="text-slate-500">{row.PaymentSlug ?? "-"}</td>
                    <td className="text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.Status !== "matched" && (
                          <>
                            <input
                              value={matchInputs[row.MatchSlug] ?? ""}
                              onChange={(e) =>
                                setMatchInputs((prev) => ({ ...prev, [row.MatchSlug]: e.target.value }))
                              }
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder="Payment ID"
                            />
                            <button
                              onClick={() => handleMatch(row.MatchSlug)}
                              className="font-semibold text-forest"
                            >
                              Match
                            </button>
                          </>
                        )}
                        {row.Status !== "resolved" && (
                          <>
                            <input
                              value={resolveInputs[row.MatchSlug] ?? ""}
                              onChange={(e) =>
                                setResolveInputs((prev) => ({ ...prev, [row.MatchSlug]: e.target.value }))
                              }
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder="Resolution note"
                            />
                            <button
                              onClick={() => handleResolve(row.MatchSlug)}
                              className="font-semibold text-slate-600"
                            >
                              Resolve
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      No rows to show.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
