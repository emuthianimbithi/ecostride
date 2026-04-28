"use client"

import { useEffect, useState } from "react"
import { apiFetchResponse, apiGet } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { Download, RefreshCcw } from "lucide-react"
import { DataState } from "../../../components/data-state"

type FinanceSummary = {
    currency: string
    status: string
    count: number
    amount_minor: number
}

type DashboardResponse = {
    summary: FinanceSummary[]
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
            setSummary(data?.summary ?? [])
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load")
        } finally {
            setLoading(false)
        }
    }

    const handleExport = async (format: "csv" | "xlsx") => {
        setError(null)
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
                    onClick={() => void handleExport("csv")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                    aria-label="Export CSV"
                    title="Export CSV"
                >
                    <Download className="h-4 w-4" />
                    Export CSV
                </button>

                <button
                    onClick={() => void handleExport("xlsx")}
                    className="inline-flex items-center gap-2 rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
                    aria-label="Export XLSX"
                    title="Export XLSX"
                >
                    <Download className="h-4 w-4" />
                    Export XLSX
                </button>

                <button
                    onClick={() => void loadSummary()}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                    aria-label="Refresh summary"
                    title="Refresh"
                >
                    <RefreshCcw className="h-4 w-4" />
                    Refresh
                </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-800">Summary</h2>
                <div className="mt-4">
                <DataState
                    loading={loading}
                    error={error}
                    isEmpty={summary.length === 0}
                    emptyView={<p className="text-sm text-slate-500">No payment data yet.</p>}
                    loadingView={<p className="text-sm text-slate-500">Loading...</p>}
                    errorView={<p className="text-sm text-rose-600">{error}</p>}
                >
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
                            <tr key={`${row.currency}-${row.status}`}>
                                <td className="py-2 font-medium text-slate-800">{row.currency}</td>
                                <td className="text-slate-600">{row.status}</td>
                                <td className="text-slate-600">{row.count}</td>
                                <td className="text-slate-600">{row.amount_minor}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </DataState>
                </div>
            </div>
        </main>
    )
}
