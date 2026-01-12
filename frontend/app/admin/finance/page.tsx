"use client"

import { useEffect, useState } from "react"
import { apiFetchResponse, apiGet } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"

type FinanceSummary = {
  Currency: string
  Status: string
  Count: number
  AmountMinor: number
}

type DashboardResponse = {
  Summary: FinanceSummary[]
}

export default function Page() {
  const [summary, setSummary] = useState<FinanceSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const loadSummary = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<DashboardResponse>("/admin/finance/dashboard")
      setSummary(data.Summary ?? [])
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      const res = await apiFetchResponse(`/admin/finance/export?format=${format}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `payments-export.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Export failed")
    }
  }

  useEffect(() => {
    void loadSummary()
  }, [])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Finance</h1>
        <p className="text-sm text-slate-600">Payment summaries and exports.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleExport("csv")}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Export CSV
        </button>
        <button
          onClick={() => handleExport("xlsx")}
          className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
        >
          Export XLSX
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-800">Summary</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        ) : error ? (
          <p className="mt-4 text-sm text-rose-600">{error}</p>
        ) : summary.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No payment data yet.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Currency</th>
                <th>Status</th>
                <th>Count</th>
                <th>Amount (minor)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map((row) => (
                <tr key={`${row.Currency}-${row.Status}`}>
                  <td className="py-2 font-medium text-slate-800">{row.Currency}</td>
                  <td className="text-slate-600">{row.Status}</td>
                  <td className="text-slate-600">{row.Count}</td>
                  <td className="text-slate-600">{row.AmountMinor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
