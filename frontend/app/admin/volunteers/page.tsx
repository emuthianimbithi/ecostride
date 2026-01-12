"use client"

import { useEffect, useMemo, useState } from "react"
import { apiFetchResponse, apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { normalizeVolunteer, assignmentSummary, type NormalizedVolunteer } from "../../../lib/normalize-volunteer"
import { IconAction } from "../../../components/icon-action"
import { Download, Eye, Mail, UserPlus } from "lucide-react"

type Event = {
  url_slug: string
  title: string
  start_at: string
}

export default function VolunteersPage() {
  const { toast } = useToast()
  const [volunteers, setVolunteers] = useState<NormalizedVolunteer[]>([])
  const [events, setEvents] = useState<Event[]>([])
  // removed error/status states
  const [filters, setFilters] = useState({ query: "", role: "all", assignment: "all" as "all" | "assigned" | "completed" | "unassigned" })
  const [selected, setSelected] = useState<NormalizedVolunteer | null>(null)
  const [assignmentForm, setAssignmentForm] = useState({
    volunteerSlug: "",
    eventSlug: "",
    roleName: "",
    status: "assigned",
    shiftStart: "",
    shiftEnd: "",
    location: ""
  })
  const [broadcastForm, setBroadcastForm] = useState({
    subject: "",
    message: ""
  })

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      const res = await apiFetchResponse(`/admin/volunteers/export?format=${format}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `volunteers-export.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const loadVolunteers = async () => {
    try {
      const data = await apiGet<any[]>("/admin/volunteers")
      const normalized = (data ?? []).map(normalizeVolunteer)
      setVolunteers(normalized)
      if (normalized.length > 0 && !assignmentForm.volunteerSlug) {
        setAssignmentForm((prev) => ({ ...prev, volunteerSlug: normalized[0].slug }))
      }
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const loadEvents = async () => {
    try {
      const data = await apiGet<Event[]>("/admin/events")
      setEvents(data)
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  useEffect(() => {
    void loadVolunteers()
    void loadEvents()
  }, [])

  const handleAssign = async () => {
    if (!assignmentForm.volunteerSlug || !assignmentForm.roleName) {
      toast({ title: "Validation Error", description: "Volunteer and role are required.", variant: "destructive" })
      return
    }
    try {
      await apiPost(`/admin/volunteers/${assignmentForm.volunteerSlug}/assign`, {
        event_slug: assignmentForm.eventSlug || undefined,
        role_name: assignmentForm.roleName,
        status: assignmentForm.status,
        shift_start: assignmentForm.shiftStart ? new Date(assignmentForm.shiftStart).toISOString() : undefined,
        shift_end: assignmentForm.shiftEnd ? new Date(assignmentForm.shiftEnd).toISOString() : undefined,
        location: assignmentForm.location
      })
      toast({ title: "Success", description: "Assignment saved", variant: "success" })
      setAssignmentForm({
        volunteerSlug: assignmentForm.volunteerSlug,
        eventSlug: "",
        roleName: "",
        status: "assigned",
        shiftStart: "",
        shiftEnd: "",
        location: ""
      })
      await loadVolunteers()
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const handleBroadcast = async () => {
    if (!broadcastForm.message.trim()) {
      toast({ title: "Validation Error", description: "Message is required.", variant: "destructive" })
      return
    }
    try {
      await apiPost("/admin/volunteers/communicate", {
        subject: broadcastForm.subject,
        message: broadcastForm.message
      })
      toast({ title: "Success", description: "Broadcast queued", variant: "success" })
      setBroadcastForm({ subject: "", message: "" })
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const preferencesMap = useMemo(() => {
    return volunteers.reduce<Record<string, string>>((acc, volunteer) => {
      const summary = [
        volunteer.preferred_event_slug ? `Event: ${volunteer.preferred_event_slug}` : "",
        volunteer.preferred_roles.length ? `Roles: ${volunteer.preferred_roles.join(", ")}` : ""
      ]
        .filter(Boolean)
        .join(" • ")
      acc[volunteer.slug] = summary
      return acc
    }, {})
  }, [volunteers])

  const roleOptions = useMemo(() => {
    const set = new Set<string>()
    for (const v of volunteers) {
      for (const role of v.preferred_roles) set.add(role)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [volunteers])

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return volunteers.filter((v) => {
      if (q) {
        const hay = `${v.name} ${v.email} ${v.phone ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filters.role !== "all" && !v.preferred_roles.includes(filters.role)) return false

      const summary = assignmentSummary(v.assignments)
      if (filters.assignment !== "all" && summary.status !== filters.assignment) return false
      return true
    })
  }, [volunteers, filters])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Volunteers</h1>
        <p className="text-sm text-slate-600">Coordinate signups, assignments, and communications.</p>
      </div>

      <section className="flex flex-wrap items-center gap-3">
        <input
          value={filters.query}
          onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm"
          placeholder="Search name/email/phone..."
        />
        <select
          value={filters.role}
          onChange={(e) => setFilters((p) => ({ ...p, role: e.target.value }))}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700"
        >
          <option value="all">All roles</option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={filters.assignment}
          onChange={(e) => setFilters((p) => ({ ...p, assignment: e.target.value as any }))}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700"
        >
          <option value="all">All assignments</option>
          <option value="unassigned">Unassigned</option>
          <option value="assigned">Assigned</option>
          <option value="completed">Completed</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <IconAction label="Export CSV" onClick={() => handleExport("csv")}>
            <Download className="h-4 w-4" />
          </IconAction>
          <IconAction label="Export XLSX" onClick={() => handleExport("xlsx")}>
            <Download className="h-4 w-4" />
          </IconAction>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Assign volunteer</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={assignmentForm.volunteerSlug}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, volunteerSlug: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {volunteers.map((volunteer) => (
              <option key={volunteer.slug} value={volunteer.slug}>
                {volunteer.name} ({volunteer.email})
              </option>
            ))}
          </select>
          <select
            value={assignmentForm.eventSlug}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, eventSlug: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Any event</option>
            {events.map((event) => (
              <option key={event.url_slug} value={event.url_slug}>
                {event.title} ({event.start_at ? new Date(event.start_at).toLocaleDateString() : "TBD"})
              </option>
            ))}
          </select>
          <input
            value={assignmentForm.roleName}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, roleName: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Role (e.g. Check-in)"
          />
          <input
            value={assignmentForm.location}
            onChange={(e) => setAssignmentForm({ ...assignmentForm, location: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Location"
          />
          <label className="text-xs text-slate-500">
            Shift start
            <input
              type="datetime-local"
              value={assignmentForm.shiftStart}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, shiftStart: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            Shift end
            <input
              type="datetime-local"
              value={assignmentForm.shiftEnd}
              onChange={(e) => setAssignmentForm({ ...assignmentForm, shiftEnd: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button onClick={handleAssign} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
          Save assignment
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Volunteer broadcast</h2>
        <input
          value={broadcastForm.subject}
          onChange={(e) => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Subject (optional)"
        />
        <textarea
          value={broadcastForm.message}
          onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          rows={3}
          placeholder="Write the message to all volunteers."
        />
        <button onClick={handleBroadcast} className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest">
          Send broadcast
        </button>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Preferences</th>
              <th className="px-4 py-3">Assignments</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((volunteer) => (
              <tr key={volunteer.slug} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{volunteer.name}</div>
                  <div className="text-xs text-slate-500">{volunteer.email}</div>
                  <div className="text-xs text-slate-500">{volunteer.phone || "-"}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <div className="space-y-2">
                    <div>{preferencesMap[volunteer.slug] || "No preferences submitted"}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {volunteer.preferred_roles.map((role) => (
                        <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {volunteer.assignments.length > 0 ? (
                    <div className="space-y-1">
                      {volunteer.assignments.slice(0, 3).map((assignment, index) => (
                        <div key={`${assignment.role_name}-${index}`}>
                          {assignment.role_name}
                          {assignment.event_title ? ` • ${assignment.event_title}` : ""}
                          {assignment.status ? ` • ${assignment.status}` : ""}
                        </div>
                      ))}
                      {volunteer.assignments.length > 3 ? <div>+{volunteer.assignments.length - 3} more</div> : null}
                    </div>
                  ) : (
                    "No assignments yet"
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {volunteer.created_at ? volunteer.created_at.toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <IconAction label="View details" onClick={() => setSelected(volunteer)}>
                      <Eye className="h-4 w-4" />
                    </IconAction>
                    <IconAction
                      label="Assign"
                      onClick={() => {
                        setAssignmentForm((p) => ({ ...p, volunteerSlug: volunteer.slug, roleName: "" }))
                        window.scrollTo({ top: 0, behavior: "smooth" })
                      }}
                    >
                      <UserPlus className="h-4 w-4" />
                    </IconAction>
                    <IconAction label="Message" href={`mailto:${encodeURIComponent(volunteer.email)}`}>
                      <Mail className="h-4 w-4" />
                    </IconAction>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No volunteers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{selected.name}</h3>
                <p className="text-sm text-slate-600">{selected.email}</p>
                <p className="text-sm text-slate-600">{selected.phone || "-"}</p>
              </div>
              <button
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Preferences</p>
                <p className="mt-1 text-slate-700">{preferencesMap[selected.slug] || "No preferences submitted"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Assignments</p>
                {selected.assignments.length ? (
                  <div className="mt-2 space-y-2">
                    {selected.assignments.map((a, idx) => (
                      <div key={`${a.role_name}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="font-semibold text-slate-800">{a.role_name}</div>
                        <div className="text-slate-600">
                          {(a.event_title ?? "Any event") + (a.status ? ` • ${a.status}` : "")}
                        </div>
                        {a.shift_start ? (
                          <div className="text-xs text-slate-500">
                            {a.shift_start.toLocaleString()}
                            {a.shift_end ? ` → ${a.shift_end.toLocaleString()}` : ""}
                            {a.location ? ` • ${a.location}` : ""}
                          </div>
                        ) : a.location ? (
                          <div className="text-xs text-slate-500">{a.location}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-slate-600">No assignments yet.</p>
                )}
              </div>
              {selected.notes ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Notes</p>
                  <p className="mt-1 text-slate-700 whitespace-pre-wrap">{selected.notes}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
