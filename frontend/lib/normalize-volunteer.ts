export type NormalizedAssignment = {
    role_name: string
    status: string | null
    event_title: string | null
    event_slug: string | null
    shift_start: Date | null
    shift_end: Date | null
    location: string | null
}

export type NormalizedVolunteer = {
    slug: string
    name: string
    email: string
    phone: string | null
    preferred_roles: string[]
    preferred_event_slug: string | null
    notes: string | null
    created_at: Date | null
    assignments: NormalizedAssignment[]
}

function safeDate(value: unknown): Date | null {
    if (!value) return null
    const d = new Date(String(value))
    return Number.isNaN(d.getTime()) ? null : d
}

function titleCaseRole(role: string): string {
    const cleaned = role
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
    if (!cleaned) return ""
    return cleaned
        .split(" ")
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ""))
        .join(" ")
        .replace(/\bIn\b/g, "in")
        .trim()
}

function normalizePreferences(preferences: unknown): { roles: string[]; event_slug: string | null } {
    if (Array.isArray(preferences)) {
        const roles = preferences.filter((v) => typeof v === "string").map((v) => titleCaseRole(v)).filter(Boolean)
        return { roles, event_slug: null }
    }

    if (preferences && typeof preferences === "object") {
        const record = preferences as Record<string, unknown>
        const rolesRaw = record["roles"]
        const roles = Array.isArray(rolesRaw)
            ? rolesRaw.filter((v) => typeof v === "string").map((v) => titleCaseRole(v)).filter(Boolean)
            : []
        const eventSlugRaw = record["event_slug"]
        const event_slug = typeof eventSlugRaw === "string" && eventSlugRaw.trim() ? eventSlugRaw.trim() : null
        return { roles, event_slug }
    }

    return { roles: [], event_slug: null }
}

export function normalizeVolunteer(raw: any): NormalizedVolunteer {
    const slug = String(raw?.slug ?? raw?.Slug ?? "")
    const name = String(raw?.name ?? raw?.Name ?? "")
    const email = String(raw?.email ?? raw?.Email ?? "")
    const phoneVal = raw?.phone ?? raw?.Phone
    const phone = typeof phoneVal === "string" && phoneVal.trim() ? phoneVal.trim() : null

    const notesVal = raw?.notes ?? raw?.Notes
    const notes = typeof notesVal === "string" && notesVal.trim() ? notesVal.trim() : null

    const created_at = safeDate(raw?.created_at ?? raw?.CreatedAt)

    const pref = normalizePreferences(raw?.preferences ?? raw?.Preferences)

    const assignmentsRaw = raw?.assignments ?? raw?.Assignments
    const assignments: NormalizedAssignment[] = Array.isArray(assignmentsRaw)
        ? assignmentsRaw.map((a: any) => ({
            role_name: titleCaseRole(String(a?.role_name ?? a?.RoleName ?? "")) || "Unknown",
            status: typeof a?.status === "string" ? a.status : typeof a?.Status === "string" ? a.Status : null,
            event_title: typeof (a?.event_title ?? a?.EventTitle) === "string" ? (a?.event_title ?? a?.EventTitle) : null,
            event_slug: typeof (a?.event_slug ?? a?.EventSlug) === "string" ? (a?.event_slug ?? a?.EventSlug) : null,
            shift_start: safeDate(a?.shift_start ?? a?.ShiftStart),
            shift_end: safeDate(a?.shift_end ?? a?.ShiftEnd),
            location: typeof (a?.location ?? a?.Location) === "string" ? (a?.location ?? a?.Location) : null
        }))
        : []

    return {
        slug,
        name,
        email,
        phone,
        preferred_roles: pref.roles,
        preferred_event_slug: pref.event_slug,
        notes,
        created_at,
        assignments
    }
}

export function assignmentSummary(assignments: NormalizedAssignment[]) {
    if (!assignments.length) return { status: "unassigned" as const, label: "Unassigned" }
    const statuses = assignments.map((a) => (a.status ?? "").toLowerCase()).filter(Boolean)
    if (statuses.some((s) => s === "assigned")) return { status: "assigned" as const, label: "Assigned" }
    if (statuses.some((s) => s === "completed")) return { status: "completed" as const, label: "Completed" }
    return { status: "assigned" as const, label: "Assigned" }
}
