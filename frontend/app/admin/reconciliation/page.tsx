"use client"

import { useMemo, useState } from "react"
import { apiFetch, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { Check, CheckCircle2, FileUp, HelpCircle, Search, XCircle } from "lucide-react"

type ReconcileRow = {
    row_number: number
    date: string
    amount_minor: number
    currency: string
    reference: string
    description: string
    hash: string
    match_slug: string
    status: string
    payment_slug?: string
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

type FieldErrors = {
    file?: string
    match_payment_slug?: Record<string, string>
    resolve_notes?: Record<string, string>
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
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
    const [result, setResult] = useState<ImportResponse | null>(null)
    const [filter, setFilter] = useState("all")
    const [query, setQuery] = useState("")
    const [matchInputs, setMatchInputs] = useState<Record<string, string>>({})
    const [resolveInputs, setResolveInputs] = useState<Record<string, string>>({})
    const { toast } = useToast()

    const handleImport = async () => {
        const nextFieldErrors: FieldErrors = {}
        if (!file) nextFieldErrors.file = "Please choose a bank statement file."

        setFieldErrors(nextFieldErrors)
        if (Object.keys(nextFieldErrors).length > 0) return

        setError(null)
        setStatus("Importing...")

        const form = new FormData()
        form.append("file", file as File)

        const mappingPayload = Object.values(mapping).some((value) => value.trim())
            ? JSON.stringify(mapping)
            : ""
        if (mappingPayload) form.append("mapping", mappingPayload)

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

    const handleMatch = async (match_slug: string) => {
        const payment_slug = (matchInputs[match_slug] ?? "").trim()
        if (!payment_slug) {
            setFieldErrors((prev) => ({
                ...prev,
                match_payment_slug: { ...(prev.match_payment_slug ?? {}), [match_slug]: "Payment ID required." }
            }))
            return
        }
        setFieldErrors((prev) => ({
            ...prev,
            match_payment_slug: { ...(prev.match_payment_slug ?? {}), [match_slug]: "" }
        }))

        setError(null)
        try {
            await apiPost("/admin/reconciliation/match", {
                match_slug,
                payment_slug
            })
            setStatus("Match updated")
            setResult((prev) =>
                prev
                    ? {
                        ...prev,
                        rows: prev.rows.map((row) =>
                            row.match_slug === match_slug ? { ...row, status: "matched", payment_slug } : row
                        )
                    }
                    : prev
            )
            setMatchInputs((prev) => ({ ...prev, [match_slug]: "" }))
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to match")
        }
    }

    const handleResolve = async (match_slug: string) => {
        const notes = (resolveInputs[match_slug] ?? "").trim()
        // optional, but if provided enforce minimal length so it’s useful
        if (notes && notes.length < 3) {
            setFieldErrors((prev) => ({
                ...prev,
                resolve_notes: { ...(prev.resolve_notes ?? {}), [match_slug]: "Add a slightly longer note (min 3 chars) or leave blank." }
            }))
            return
        }
        setFieldErrors((prev) => ({
            ...prev,
            resolve_notes: { ...(prev.resolve_notes ?? {}), [match_slug]: "" }
        }))

        setError(null)
        try {
            await apiPost("/admin/reconciliation/resolve", {
                match_slug,
                notes
            })
            setStatus("Marked as resolved")
            setResult((prev) =>
                prev
                    ? {
                        ...prev,
                        rows: prev.rows.map((row) => (row.match_slug === match_slug ? { ...row, status: "resolved" } : row))
                    }
                    : prev
            )
            setResolveInputs((prev) => ({ ...prev, [match_slug]: "" }))
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to resolve")
        }
    }

    const filteredRows = useMemo(() => {
        if (!result) return []
        const rows = filter === "all" ? result.rows : result.rows.filter((row) => row.status === filter)
        if (!query.trim()) return rows
        const q = query.toLowerCase()
        return rows.filter(
            (row) =>
                (row.reference ?? "").toLowerCase().includes(q) ||
                (row.description ?? "").toLowerCase().includes(q) ||
                (row.match_slug ?? "").toLowerCase().includes(q)
        )
    }, [result, filter, query])

    const statusIcon = (s: string) => {
        if (s === "matched") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        if (s === "unmatched") return <HelpCircle className="h-4 w-4 text-amber-600" />
        if (s === "resolved") return <Check className="h-4 w-4 text-slate-600" />
        return <XCircle className="h-4 w-4 text-slate-400" />
    }

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
                    <input
                        type="file"
                        onChange={(e) => {
                            setFile(e.target.files?.[0] ?? null)
                            setFieldErrors((prev) => ({ ...prev, file: "" }))
                        }}
                    />
                    {fieldErrors.file ? <p className="text-xs text-rose-600">{fieldErrors.file}</p> : null}
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
                    onClick={() => void handleImport()}
                    className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
                    aria-label="Import statement"
                    title="Import statement"
                >
                    <FileUp className="h-4 w-4" />
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

                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="rounded-full border border-slate-200 py-2 pl-9 pr-4 text-sm"
                                    placeholder="Search reference or match ID"
                                />
                            </div>
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
                                <tr key={row.match_slug}>
                                    <td className="py-2 text-slate-600">
                                        <div className="inline-flex items-center gap-2">
                                            {statusIcon(row.status)}
                                            <span>{row.status}</span>
                                        </div>
                                    </td>

                                    <td className="text-slate-600">
                                        <div className="font-medium text-slate-800">{row.reference || "-"}</div>
                                        <div className="text-xs text-slate-500">{row.description}</div>
                                    </td>

                                    <td className="text-slate-600">
                                        {row.currency} {row.amount_minor}
                                    </td>

                                    <td className="text-slate-500">{row.payment_slug ?? "-"}</td>

                                    <td className="text-xs">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {row.status !== "matched" && (
                                                <>
                                                    <div className="space-y-1">
                                                        <input
                                                            value={matchInputs[row.match_slug] ?? ""}
                                                            onChange={(e) => {
                                                                const v = e.target.value
                                                                setMatchInputs((prev) => ({ ...prev, [row.match_slug]: v }))
                                                                if (v.trim()) {
                                                                    setFieldErrors((prev) => ({
                                                                        ...prev,
                                                                        match_payment_slug: { ...(prev.match_payment_slug ?? {}), [row.match_slug]: "" }
                                                                    }))
                                                                }
                                                            }}
                                                            className={`rounded-lg border px-2 py-1 text-xs ${
                                                                (fieldErrors.match_payment_slug?.[row.match_slug] ?? "")
                                                                    ? "border-rose-300"
                                                                    : "border-slate-200"
                                                            }`}
                                                            placeholder="Payment ID"
                                                        />
                                                        {fieldErrors.match_payment_slug?.[row.match_slug] ? (
                                                            <p className="text-[11px] text-rose-600">{fieldErrors.match_payment_slug[row.match_slug]}</p>
                                                        ) : null}
                                                    </div>

                                                    <button
                                                        onClick={() => void handleMatch(row.match_slug)}
                                                        className="inline-flex items-center gap-1.5 font-semibold text-forest"
                                                        aria-label="Match"
                                                        title="Match"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                        Match
                                                    </button>
                                                </>
                                            )}

                                            {row.status !== "resolved" && (
                                                <>
                                                    <div className="space-y-1">
                                                        <input
                                                            value={resolveInputs[row.match_slug] ?? ""}
                                                            onChange={(e) => {
                                                                const v = e.target.value
                                                                setResolveInputs((prev) => ({ ...prev, [row.match_slug]: v }))
                                                                if (!v.trim() || v.trim().length >= 3) {
                                                                    setFieldErrors((prev) => ({
                                                                        ...prev,
                                                                        resolve_notes: { ...(prev.resolve_notes ?? {}), [row.match_slug]: "" }
                                                                    }))
                                                                }
                                                            }}
                                                            className={`rounded-lg border px-2 py-1 text-xs ${
                                                                (fieldErrors.resolve_notes?.[row.match_slug] ?? "")
                                                                    ? "border-rose-300"
                                                                    : "border-slate-200"
                                                            }`}
                                                            placeholder="Resolution note"
                                                        />
                                                        {fieldErrors.resolve_notes?.[row.match_slug] ? (
                                                            <p className="text-[11px] text-rose-600">{fieldErrors.resolve_notes[row.match_slug]}</p>
                                                        ) : null}
                                                    </div>

                                                    <button
                                                        onClick={() => void handleResolve(row.match_slug)}
                                                        className="inline-flex items-center gap-1.5 font-semibold text-slate-600"
                                                        aria-label="Resolve"
                                                        title="Resolve"
                                                    >
                                                        <Check className="h-4 w-4" />
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
