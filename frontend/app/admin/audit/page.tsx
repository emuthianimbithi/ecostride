"use client"

import { useEffect, useState } from "react"
import { apiGet } from "../../../lib/api-client"

type AuditLog = {
  Slug: string
  ActorUserID: number
  ActionKey: string
  EntityType: string
  EntityID: string
  CreatedAt: string
}

export default function Page() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<AuditLog[]>("/admin/audit-logs?limit=100")
      .then(setLogs)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
  }, [])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Audit Logs</h1>
        <p className="text-sm text-slate-600">Recent administrative actions.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!error && logs.length === 0 ? (
          <p className="text-sm text-slate-500">No audit entries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Action</th>
                <th>Entity</th>
                <th>Actor</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.Slug}>
                  <td className="py-2 font-medium text-slate-800">{log.ActionKey}</td>
                  <td className="text-slate-600">
                    {log.EntityType} {log.EntityID}
                  </td>
                  <td className="text-slate-600">{log.ActorUserID}</td>
                  <td className="text-slate-500">{new Date(log.CreatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
