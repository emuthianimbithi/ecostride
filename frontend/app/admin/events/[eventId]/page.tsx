"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { apiDelete, apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { Pencil, Trash2 } from "lucide-react"
import { ResponsiveMedia, isVideoMedia } from "../../../../components/responsive-media"

type Event = {
    slug: string
    url_slug: string
    title: string
    type: string
    status: string
    is_featured?: boolean
    description: string
    location: string
    map_url: string
    start_at: string
    reg_open_at?: string | null
    reg_close_at?: string | null
}

type MediaItem = {
    id: number
    slug: string
    type: string
    path: string
    url: string
    mime: string
    size: number
    alt_text: string
    created_at: string
}

type EventNarrativeDraft = {
    summary: string
    course_headline: string
    course_copy: string
    cause_headline: string
    cause_copy: string
    faq_text: string
    hero_media_id: string
    hero_media_aspect_ratio: string
    hero_media_poster_url: string
    course_media_id: string
    course_media_aspect_ratio: string
    course_media_poster_url: string
    cause_media_id: string
    cause_media_aspect_ratio: string
    cause_media_poster_url: string
}

function parseNarrativeDraft(description: string, media: MediaItem[]): EventNarrativeDraft {
    const blank: EventNarrativeDraft = {
        summary: description || "",
        course_headline: "",
        course_copy: "",
        cause_headline: "",
        cause_copy: "",
        faq_text: "",
        hero_media_id: "",
        hero_media_aspect_ratio: "",
        hero_media_poster_url: "",
        course_media_id: "",
        course_media_aspect_ratio: "",
        course_media_poster_url: "",
        cause_media_id: "",
        cause_media_aspect_ratio: "",
        cause_media_poster_url: "",
    }
    try {
        const parsed = JSON.parse(description) as Record<string, unknown>
        if (!parsed || typeof parsed !== "object") return blank
        const findMediaId = (payload: unknown) => {
            if (!payload || typeof payload !== "object") return ""
            const record = payload as Record<string, unknown>
            if (typeof record.url !== "string") return ""
            const found = media.find((item) => item.url === record.url)
            return found ? String(found.id) : ""
        }
        const faqText = Array.isArray(parsed.faq)
            ? parsed.faq
                  .map((entry) => {
                      if (!entry || typeof entry !== "object") return null
                      const row = entry as Record<string, unknown>
                      if (typeof row.question !== "string" || typeof row.answer !== "string") return null
                      return `${row.question} | ${row.answer}`
                  })
                  .filter(Boolean)
                  .join("\n")
            : ""

        return {
            summary: typeof parsed.summary === "string" ? parsed.summary : description,
            course_headline: typeof parsed.courseHeadline === "string" ? parsed.courseHeadline : "",
            course_copy: typeof parsed.courseCopy === "string" ? parsed.courseCopy : "",
            cause_headline: typeof parsed.causeHeadline === "string" ? parsed.causeHeadline : "",
            cause_copy: typeof parsed.causeCopy === "string" ? parsed.causeCopy : "",
            faq_text: faqText,
            hero_media_id: findMediaId(parsed.heroMedia),
            hero_media_aspect_ratio: typeof (parsed.heroMedia as Record<string, unknown> | undefined)?.aspectRatio === "string" ? String((parsed.heroMedia as Record<string, unknown>).aspectRatio) : "",
            hero_media_poster_url: typeof (parsed.heroMedia as Record<string, unknown> | undefined)?.posterUrl === "string" ? String((parsed.heroMedia as Record<string, unknown>).posterUrl) : "",
            course_media_id: findMediaId(parsed.courseMedia),
            course_media_aspect_ratio: typeof (parsed.courseMedia as Record<string, unknown> | undefined)?.aspectRatio === "string" ? String((parsed.courseMedia as Record<string, unknown>).aspectRatio) : "",
            course_media_poster_url: typeof (parsed.courseMedia as Record<string, unknown> | undefined)?.posterUrl === "string" ? String((parsed.courseMedia as Record<string, unknown>).posterUrl) : "",
            cause_media_id: findMediaId(parsed.causeMedia),
            cause_media_aspect_ratio: typeof (parsed.causeMedia as Record<string, unknown> | undefined)?.aspectRatio === "string" ? String((parsed.causeMedia as Record<string, unknown>).aspectRatio) : "",
            cause_media_poster_url: typeof (parsed.causeMedia as Record<string, unknown> | undefined)?.posterUrl === "string" ? String((parsed.causeMedia as Record<string, unknown>).posterUrl) : "",
        }
    } catch {
        return blank
    }
}

function buildStructuredDescription(narrative: EventNarrativeDraft, media: MediaItem[]) {
    const summary = narrative.summary.trim()
    const courseHeadline = narrative.course_headline.trim()
    const courseCopy = narrative.course_copy.trim()
    const causeHeadline = narrative.cause_headline.trim()
    const causeCopy = narrative.cause_copy.trim()
    const faq = narrative.faq_text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [question, ...answerParts] = line.split("|")
            return { question: question?.trim() || "", answer: answerParts.join("|").trim() }
        })
        .filter((item) => item.question && item.answer)

    const mediaPayload = (idValue: string, aspectRatio: string, posterUrl: string) => {
        const id = Number(idValue)
        const item = media.find((entry) => entry.id === id)
        if (!item) return undefined
        return {
            url: item.url,
            mime: item.mime,
            altText: item.alt_text || undefined,
            aspectRatio: aspectRatio.trim() || undefined,
            posterUrl: posterUrl.trim() || undefined,
        }
    }

    const heroMedia = mediaPayload(narrative.hero_media_id, narrative.hero_media_aspect_ratio, narrative.hero_media_poster_url)
    const courseMedia = mediaPayload(narrative.course_media_id, narrative.course_media_aspect_ratio, narrative.course_media_poster_url)
    const causeMedia = mediaPayload(narrative.cause_media_id, narrative.cause_media_aspect_ratio, narrative.cause_media_poster_url)

    const hasStructuredFields = Boolean(courseHeadline || courseCopy || causeHeadline || causeCopy || faq.length > 0)
    if (!hasStructuredFields && !heroMedia && !courseMedia && !causeMedia) return summary

    return JSON.stringify({ summary, courseHeadline: courseHeadline || undefined, courseCopy: courseCopy || undefined, causeHeadline: causeHeadline || undefined, causeCopy: causeCopy || undefined, faq: faq.length > 0 ? faq : undefined, heroMedia, courseMedia, causeMedia }, null, 2)
}

function validateNarrativeDraft(narrative: EventNarrativeDraft) {
    const next: Record<string, string> = {}
    const faqLines = narrative.faq_text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    const badFaq = faqLines.find((line) => {
        const [question, ...answerParts] = line.split("|")
        return !question?.trim() || !answerParts.join("|").trim()
    })
    if (badFaq) next.faq_text = "Each FAQ line must use: Question | Answer"

    const mediaSlots = [
        ["hero_media_id", "hero_media_aspect_ratio"],
        ["course_media_id", "course_media_aspect_ratio"],
        ["cause_media_id", "cause_media_aspect_ratio"],
    ] as const
    mediaSlots.forEach(([idKey, ratioKey]) => {
        const id = narrative[idKey].trim()
        const ratio = narrative[ratioKey].trim()
        if (ratio && !id) next[ratioKey] = "Choose media before setting an aspect ratio."
    })
    return next
}

type Category = {
    slug: string
    name: string
    price_kes_minor: number
    price_usd_minor?: number
    price_eur_minor?: number
    capacity?: number
    bib_prefix?: string
    bib_range_start?: number
    bib_range_end?: number
    bib_next?: number
    rules?: unknown
}

type FormField = {
    slug: string
    key: string
    label: string
    type: string
    required: boolean
    options?: unknown
    order: number
}

const fieldTypes = ["text", "select", "checkbox", "date", "number"]

export default function EventDetailPage() {
    const params = useParams()
    const eventId = params?.eventId as string

    const [event, setEvent] = useState<Event | null>(null)
    const [media, setMedia] = useState<MediaItem[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [formFields, setFormFields] = useState<FormField[]>([])
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [eventErrors, setEventErrors] = useState<Record<string, string>>({})
    const [eventForm, setEventForm] = useState({
        title: "",
        type: "MARATHON",
        status: "draft",
        is_featured: false,
        location: "",
        map_url: "",
        start_at: "",
        reg_open_at: "",
        reg_close_at: "",
        narrative: parseNarrativeDraft("", [])
    })

    // ✅ field-level errors (where + what)
    const [categoryErrors, setCategoryErrors] = useState<Record<string, string>>({})
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

    const [categoryForm, setCategoryForm] = useState({
        slug: "",
        name: "",
        price_kes: "",
        price_usd: "",
        price_eur: "",
        capacity: "",
        bib_prefix: "",
        bib_range_start: "",
        bib_range_end: "",
        bib_next: "",
        rules: "",
    })
    const [editingCategory, setEditingCategory] = useState<string | null>(null)

    const [fieldForm, setFieldForm] = useState({
        slug: "",
        key: "",
        label: "",
        type: "text",
        required: false,
        options: "",
        order: "1",
    })
    const [editingField, setEditingField] = useState<string | null>(null)

    const loadEvent = async () => {
        try {
            const data = await apiGet<Event>(`/admin/events/${eventId}`)
            setEvent(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load event")
        }
    }

    const loadCategories = async () => {
        try {
            const data = await apiGet<Category[]>(`/admin/events/${eventId}/categories`)
            setCategories(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load categories")
        }
    }

    const loadFormFields = async () => {
        try {
            const data = await apiGet<FormField[]>(`/admin/events/${eventId}/form-fields`)
            setFormFields(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load form fields")
        }
    }

    const loadMedia = async () => {
        try {
            const data = await apiGet<MediaItem[]>("/admin/media")
            setMedia(Array.isArray(data) ? data : [])
        } catch {
            // non-blocking
        }
    }

    useEffect(() => {
        void loadEvent()
        void loadMedia()
        void loadCategories()
        void loadFormFields()
    }, [eventId])

    useEffect(() => {
        if (!event) return
        setEventForm({
            title: event.title,
            type: event.type,
            status: event.status,
            is_featured: Boolean(event.is_featured),
            location: event.location || "",
            map_url: event.map_url || "",
            start_at: event.start_at ? new Date(event.start_at).toISOString().slice(0, 16) : "",
            reg_open_at: event.reg_open_at ? new Date(event.reg_open_at).toISOString().slice(0, 16) : "",
            reg_close_at: event.reg_close_at ? new Date(event.reg_close_at).toISOString().slice(0, 16) : "",
            narrative: parseNarrativeDraft(event.description || "", media)
        })
    }, [event, media])

    const toMinor = (value: string) => {
        if (!value) return undefined
        const parsed = Number(value)
        if (Number.isNaN(parsed)) return undefined
        return Math.round(parsed * 100)
    }

    const parseOptionalInt = (value: string) => {
        if (!value) return undefined
        const parsed = Number(value)
        if (Number.isNaN(parsed)) return undefined
        return parsed
    }

    const setCatErr = (field: string, msg?: string) => {
        setCategoryErrors((prev) => {
            const next = { ...prev }
            if (!msg) delete next[field]
            else next[field] = msg
            return next
        })
    }

    const setFieldErr = (field: string, msg?: string) => {
        setFieldErrors((prev) => {
            const next = { ...prev }
            if (!msg) delete next[field]
            else next[field] = msg
            return next
        })
    }

    const validateCategory = () => {
        const next: Record<string, string> = {}

        if (!categoryForm.name.trim()) next.name = "Category name is required."

        // price_kes is required and must be a number >= 0
        const kes = categoryForm.price_kes.trim()
        if (!kes) next.price_kes = "Price KES is required."
        else {
            const n = Number(kes)
            if (Number.isNaN(n)) next.price_kes = "Price KES must be a number."
            else if (n < 0) next.price_kes = "Price KES cannot be negative."
        }

        const intFields: Array<keyof typeof categoryForm> = ["capacity", "bib_range_start", "bib_range_end", "bib_next"]
        for (const f of intFields) {
            const v = categoryForm[f].trim()
            if (!v) continue
            const n = Number(v)
            if (!Number.isInteger(n)) next[f] = "Must be a whole number."
            else if (n < 0) next[f] = "Cannot be negative."
        }

        // bib range sanity
        const start = parseOptionalInt(categoryForm.bib_range_start)
        const end = parseOptionalInt(categoryForm.bib_range_end)
        if (start != null && end != null && end < start) {
            next.bib_range_end = "Bib range end must be >= start."
        }

        // rules must be valid JSON if provided
        if (categoryForm.rules.trim()) {
            try {
                JSON.parse(categoryForm.rules)
            } catch {
                next.rules = "Rules must be valid JSON."
            }
        }

        setCategoryErrors(next)
        return Object.keys(next).length === 0
    }

    const validateFormField = () => {
        const next: Record<string, string> = {}

        if (!fieldForm.key.trim()) next.key = "Key is required."
        if (!fieldForm.label.trim()) next.label = "Label is required."

        const order = fieldForm.order.trim()
        if (!order) next.order = "Order is required."
        else {
            const n = Number(order)
            if (!Number.isInteger(n)) next.order = "Order must be a whole number."
            else if (n < 1) next.order = "Order must be >= 1."
        }

        setFieldErrors(next)
        return Object.keys(next).length === 0
    }

    const handleEventSave = async () => {
        if (!event) return
        setError(null)
        setStatus(null)
        const nextErrors = validateNarrativeDraft(eventForm.narrative)
        setEventErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
            setError("Please fix the event content fields.")
            return
        }
        try {
            await apiPut(`/admin/events/${eventId}`, {
                url_slug: event.url_slug,
                title: eventForm.title.trim(),
                type: eventForm.type,
                status: eventForm.status,
                is_featured: eventForm.is_featured,
                description: buildStructuredDescription(eventForm.narrative, media),
                location: eventForm.location,
                map_url: eventForm.map_url,
                start_at: eventForm.start_at ? new Date(eventForm.start_at).toISOString() : event.start_at,
                reg_open_at: eventForm.reg_open_at ? new Date(eventForm.reg_open_at).toISOString() : undefined,
                reg_close_at: eventForm.reg_close_at ? new Date(eventForm.reg_close_at).toISOString() : undefined,
            })
            setStatus("Event updated")
            await loadEvent()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save event")
        }
    }

    const previewMedia = (idValue: string) => {
        const id = Number(idValue)
        return media.find((item) => item.id === id) ?? null
    }

    const handleCategorySave = async () => {
        setError(null)
        setStatus(null)

        if (!validateCategory()) {
            setError("Please fix the highlighted category fields.")
            return
        }

        let rulesValue: unknown
        if (categoryForm.rules.trim()) {
            rulesValue = JSON.parse(categoryForm.rules)
        }

        const payload = {
            name: categoryForm.name.trim(),
            price_kes_minor: toMinor(categoryForm.price_kes) ?? 0,
            price_usd_minor: toMinor(categoryForm.price_usd),
            price_eur_minor: toMinor(categoryForm.price_eur),
            capacity: parseOptionalInt(categoryForm.capacity),
            bib_prefix: categoryForm.bib_prefix.trim() || undefined,
            bib_range_start: parseOptionalInt(categoryForm.bib_range_start),
            bib_range_end: parseOptionalInt(categoryForm.bib_range_end),
            bib_next: parseOptionalInt(categoryForm.bib_next),
            rules: rulesValue,
        }

        try {
            if (editingCategory) {
                await apiPut(`/admin/events/${eventId}/categories/${editingCategory}`, payload)
                setStatus("Category updated")
            } else {
                await apiPost(`/admin/events/${eventId}/categories`, payload)
                setStatus("Category created")
            }

            setCategoryForm({
                slug: "",
                name: "",
                price_kes: "",
                price_usd: "",
                price_eur: "",
                capacity: "",
                bib_prefix: "",
                bib_range_start: "",
                bib_range_end: "",
                bib_next: "",
                rules: "",
            })
            setCategoryErrors({})
            setEditingCategory(null)
            await loadCategories()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save category")
        }
    }

    const handleCategoryEdit = (category: Category) => {
        setEditingCategory(category.slug)
        setCategoryErrors({})
        setCategoryForm({
            slug: category.slug,
            name: category.name,
            price_kes: (category.price_kes_minor / 100).toFixed(2),
            price_usd: category.price_usd_minor != null ? (category.price_usd_minor / 100).toFixed(2) : "",
            price_eur: category.price_eur_minor != null ? (category.price_eur_minor / 100).toFixed(2) : "",
            capacity: category.capacity != null ? String(category.capacity) : "",
            bib_prefix: category.bib_prefix ?? "",
            bib_range_start: category.bib_range_start != null ? String(category.bib_range_start) : "",
            bib_range_end: category.bib_range_end != null ? String(category.bib_range_end) : "",
            bib_next: category.bib_next != null ? String(category.bib_next) : "",
            rules: category.rules ? JSON.stringify(category.rules) : "",
        })
    }

    const handleCategoryDelete = async (category: Category) => {
        if (!confirm(`Delete ${category.name}?`)) return
        setError(null)
        try {
            await apiDelete(`/admin/events/${eventId}/categories/${category.slug}`)
            setStatus("Category deleted")
            await loadCategories()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete category")
        }
    }

    const handleFieldSave = async () => {
        setError(null)
        setStatus(null)

        if (!validateFormField()) {
            setError("Please fix the highlighted form field inputs.")
            return
        }

        const options = fieldForm.options
            ? fieldForm.options
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            : []

        const payload = {
            key: fieldForm.key.trim(),
            label: fieldForm.label.trim(),
            type: fieldForm.type,
            required: fieldForm.required,
            options,
            order: Number(fieldForm.order || "1"),
        }

        try {
            if (editingField) {
                await apiPut(`/admin/events/${eventId}/form-fields/${editingField}`, payload)
                setStatus("Form field updated")
            } else {
                await apiPost(`/admin/events/${eventId}/form-fields`, payload)
                setStatus("Form field created")
            }

            setFieldForm({ slug: "", key: "", label: "", type: "text", required: false, options: "", order: "1" })
            setFieldErrors({})
            setEditingField(null)
            await loadFormFields()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save form field")
        }
    }

    const handleFieldEdit = (field: FormField) => {
        const optionValues = Array.isArray(field.options) ? field.options : []
        const optionLabels = optionValues
            .map((option) => (typeof option === "string" ? option : ""))
            .filter(Boolean)
            .join(", ")

        setEditingField(field.slug)
        setFieldErrors({})
        setFieldForm({
            slug: field.slug,
            key: field.key,
            label: field.label,
            type: field.type,
            required: field.required,
            options: optionLabels,
            order: String(field.order ?? 1),
        })
    }

    const handleFieldDelete = async (field: FormField) => {
        if (!confirm(`Delete ${field.label}?`)) return
        setError(null)
        try {
            await apiDelete(`/admin/events/${eventId}/form-fields/${field.slug}`)
            setStatus("Form field deleted")
            await loadFormFields()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete form field")
        }
    }

    const categorySummary = useMemo(() => {
        return categories.map((category) => ({
            ...category,
            price_kes: (category.price_kes_minor / 100).toFixed(2),
        }))
    }, [categories])

    return (
        <main className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-forest">Event setup</h1>
                <p className="text-sm text-slate-600">Manage categories, bib ranges, and registration form fields.</p>
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
            {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

            {event && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-2">
                    <h2 className="text-lg font-semibold text-slate-800">{event.title}</h2>
                    <p className="text-sm text-slate-600">
                        {event.type} • {event.location || "Location TBD"} •{" "}
                        {event.start_at ? new Date(event.start_at).toLocaleDateString() : "TBD"}
                    </p>
                    <p className="text-xs uppercase text-slate-400">
                        Status: {event.status}{event.is_featured ? " • Main event" : ""}
                    </p>
                </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">Event content</h2>
                    <p className="text-sm text-slate-600">Edit the public-facing summary, narrative sections, and attached media.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <input
                        value={eventForm.title}
                        onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Event title"
                    />
                    <input
                        value={eventForm.location}
                        onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Location"
                    />
                    <select
                        value={eventForm.type}
                        onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="MARATHON">Marathon</option>
                        <option value="SEMINAR">Seminar</option>
                        <option value="BEACH_CLEANUP">Beach Cleanup</option>
                        <option value="OTHER">Other</option>
                    </select>
                    <select
                        value={eventForm.status}
                        onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                    </select>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={eventForm.is_featured}
                            onChange={(e) => setEventForm({ ...eventForm, is_featured: e.target.checked })}
                        />
                        Spotlight this as the main event
                    </label>
                    <input
                        type="datetime-local"
                        value={eventForm.start_at}
                        onChange={(e) => setEventForm({ ...eventForm, start_at: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                        value={eventForm.map_url}
                        onChange={(e) => setEventForm({ ...eventForm, map_url: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Map URL"
                    />
                    <input
                        type="datetime-local"
                        value={eventForm.reg_open_at}
                        onChange={(e) => setEventForm({ ...eventForm, reg_open_at: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                        type="datetime-local"
                        value={eventForm.reg_close_at}
                        onChange={(e) => setEventForm({ ...eventForm, reg_close_at: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <textarea
                        value={eventForm.narrative.summary}
                        onChange={(e) => setEventForm({ ...eventForm, narrative: { ...eventForm.narrative, summary: e.target.value } })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        rows={4}
                        placeholder="Hero summary"
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                        <input
                            value={eventForm.narrative.course_headline}
                            onChange={(e) => setEventForm({ ...eventForm, narrative: { ...eventForm.narrative, course_headline: e.target.value } })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Course headline"
                        />
                        <input
                            value={eventForm.narrative.cause_headline}
                            onChange={(e) => setEventForm({ ...eventForm, narrative: { ...eventForm.narrative, cause_headline: e.target.value } })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Cause headline"
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <textarea
                            value={eventForm.narrative.course_copy}
                            onChange={(e) => setEventForm({ ...eventForm, narrative: { ...eventForm.narrative, course_copy: e.target.value } })}
                            className="min-h-32 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Course narrative"
                        />
                        <textarea
                            value={eventForm.narrative.cause_copy}
                            onChange={(e) => setEventForm({ ...eventForm, narrative: { ...eventForm.narrative, cause_copy: e.target.value } })}
                            className="min-h-32 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Cause narrative"
                        />
                    </div>
                    <textarea
                        value={eventForm.narrative.faq_text}
                        onChange={(e) => setEventForm({ ...eventForm, narrative: { ...eventForm.narrative, faq_text: e.target.value } })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        rows={4}
                        placeholder={"FAQ lines as Question | Answer"}
                    />
                    {eventErrors.faq_text ? <p className="text-xs text-rose-600">{eventErrors.faq_text}</p> : null}

                    <div className="grid gap-4 md:grid-cols-3">
                        {[
                            { key: "hero", label: "Hero media", fallback: "4:5" },
                            { key: "course", label: "Course media", fallback: "16:9" },
                            { key: "cause", label: "Cause media", fallback: "4:3" }
                        ].map((slot) => {
                            const mediaId = eventForm.narrative[`${slot.key}_media_id` as keyof EventNarrativeDraft] as string
                            const aspectRatio = eventForm.narrative[`${slot.key}_media_aspect_ratio` as keyof EventNarrativeDraft] as string
                            const posterUrl = eventForm.narrative[`${slot.key}_media_poster_url` as keyof EventNarrativeDraft] as string
                            const selected = media.find((item) => String(item.id) === mediaId)
                            const video = selected ? isVideoMedia(selected.url, selected.mime, selected.type) : false
                            return (
                                <div key={slot.key} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{slot.label}</p>
                                    <select
                                        value={mediaId}
                                        onChange={(e) =>
                                            setEventForm({
                                                ...eventForm,
                                                narrative: { ...eventForm.narrative, [`${slot.key}_media_id`]: e.target.value }
                                            })
                                        }
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    >
                                        <option value="">None</option>
                                        {media.map((item) => (
                                            <option key={`${slot.key}-${item.id}`} value={item.id}>
                                                {item.alt_text || item.url}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        value={aspectRatio}
                                        onChange={(e) =>
                                            setEventForm({
                                                ...eventForm,
                                                narrative: { ...eventForm.narrative, [`${slot.key}_media_aspect_ratio`]: e.target.value }
                                            })
                                        }
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder={`Aspect ratio (${slot.fallback})`}
                                    />
                                    {eventErrors[`${slot.key}_media_aspect_ratio`] ? (
                                        <p className="text-xs text-rose-600">{eventErrors[`${slot.key}_media_aspect_ratio`]}</p>
                                    ) : null}
                                    {video ? (
                                        <input
                                            value={posterUrl}
                                            onChange={(e) =>
                                                setEventForm({
                                                    ...eventForm,
                                                    narrative: { ...eventForm.narrative, [`${slot.key}_media_poster_url`]: e.target.value }
                                                })
                                            }
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                            placeholder="Poster URL (optional)"
                                        />
                                    ) : null}
                                    {selected ? (
                                        <ResponsiveMedia
                                            src={selected.url}
                                            alt={selected.alt_text}
                                            mime={selected.mime}
                                            type={selected.type}
                                            poster={posterUrl || undefined}
                                            aspectRatio={aspectRatio || slot.fallback}
                                            className="overflow-hidden rounded-xl"
                                            fillMode="cover"
                                            controls={video}
                                            preload="metadata"
                                        />
                                    ) : null}
                                </div>
                            )
                        })}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Public preview</p>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-slate-800">{eventForm.title || "Event title preview"}</h3>
                            <p className="text-sm text-slate-600">{eventForm.narrative.summary || "Hero summary preview"}</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {[
                                { key: "hero", label: "Hero media", fallback: "4:5" },
                                { key: "course", label: "Course media", fallback: "16:9" },
                                { key: "cause", label: "Cause media", fallback: "4:3" }
                            ].map((slot) => {
                                const selected = previewMedia(eventForm.narrative[`${slot.key}_media_id` as keyof EventNarrativeDraft] as string)
                                const aspectRatio = eventForm.narrative[`${slot.key}_media_aspect_ratio` as keyof EventNarrativeDraft] as string
                                const posterUrl = eventForm.narrative[`${slot.key}_media_poster_url` as keyof EventNarrativeDraft] as string
                                if (!selected) {
                                    return (
                                        <div key={`preview-${slot.key}`} className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">
                                            {slot.label}: no media selected
                                        </div>
                                    )
                                }
                                const video = isVideoMedia(selected.url, selected.mime, selected.type)
                                return (
                                    <div key={`preview-${slot.key}`} className="space-y-2">
                                        <p className="text-xs text-slate-500">{slot.label}</p>
                                        <ResponsiveMedia
                                            src={selected.url}
                                            alt={selected.alt_text}
                                            mime={selected.mime}
                                            type={selected.type}
                                            poster={posterUrl || undefined}
                                            aspectRatio={aspectRatio || slot.fallback}
                                            className="overflow-hidden rounded-xl"
                                            fillMode="cover"
                                            controls={video}
                                            preload="metadata"
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button onClick={handleEventSave} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        Save event content
                    </button>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">Categories</h2>

                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                        <input
                            value={categoryForm.name}
                            onChange={(e) => {
                                const v = e.target.value
                                setCategoryForm({ ...categoryForm, name: v })
                                if (categoryErrors.name) setCatErr("name", v.trim() ? undefined : "Category name is required.")
                            }}
                            onBlur={() => setCatErr("name", categoryForm.name.trim() ? undefined : "Category name is required.")}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Category name"
                        />
                        {categoryErrors.name ? <p className="text-xs text-rose-600">{categoryErrors.name}</p> : null}
                    </div>

                    <div className="space-y-1">
                        <input
                            value={categoryForm.capacity}
                            onChange={(e) => {
                                const v = e.target.value
                                setCategoryForm({ ...categoryForm, capacity: v })
                                if (categoryErrors.capacity) setCatErr("capacity", undefined)
                            }}
                            onBlur={() => {
                                const v = categoryForm.capacity.trim()
                                if (!v) return setCatErr("capacity", undefined)
                                const n = Number(v)
                                if (!Number.isInteger(n)) return setCatErr("capacity", "Must be a whole number.")
                                if (n < 0) return setCatErr("capacity", "Cannot be negative.")
                                setCatErr("capacity", undefined)
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Capacity (optional)"
                        />
                        {categoryErrors.capacity ? <p className="text-xs text-rose-600">{categoryErrors.capacity}</p> : null}
                    </div>

                    <div className="space-y-1">
                        <input
                            value={categoryForm.price_kes}
                            onChange={(e) => {
                                const v = e.target.value
                                setCategoryForm({ ...categoryForm, price_kes: v })
                                if (categoryErrors.price_kes) setCatErr("price_kes", undefined)
                            }}
                            onBlur={() => {
                                const v = categoryForm.price_kes.trim()
                                if (!v) return setCatErr("price_kes", "Price KES is required.")
                                const n = Number(v)
                                if (Number.isNaN(n)) return setCatErr("price_kes", "Price KES must be a number.")
                                if (n < 0) return setCatErr("price_kes", "Price KES cannot be negative.")
                                setCatErr("price_kes", undefined)
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Price KES"
                        />
                        {categoryErrors.price_kes ? <p className="text-xs text-rose-600">{categoryErrors.price_kes}</p> : null}
                    </div>

                    <input
                        value={categoryForm.price_usd}
                        onChange={(e) => setCategoryForm({ ...categoryForm, price_usd: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Price USD"
                    />

                    <input
                        value={categoryForm.price_eur}
                        onChange={(e) => setCategoryForm({ ...categoryForm, price_eur: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Price EUR"
                    />

                    <input
                        value={categoryForm.bib_prefix}
                        onChange={(e) => setCategoryForm({ ...categoryForm, bib_prefix: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Bib prefix"
                    />

                    <div className="space-y-1">
                        <input
                            value={categoryForm.bib_range_start}
                            onChange={(e) => {
                                const v = e.target.value
                                setCategoryForm({ ...categoryForm, bib_range_start: v })
                                if (categoryErrors.bib_range_start) setCatErr("bib_range_start", undefined)
                            }}
                            onBlur={() => {
                                const v = categoryForm.bib_range_start.trim()
                                if (!v) return setCatErr("bib_range_start", undefined)
                                const n = Number(v)
                                if (!Number.isInteger(n)) return setCatErr("bib_range_start", "Must be a whole number.")
                                if (n < 0) return setCatErr("bib_range_start", "Cannot be negative.")
                                setCatErr("bib_range_start", undefined)
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Bib range start"
                        />
                        {categoryErrors.bib_range_start ? (
                            <p className="text-xs text-rose-600">{categoryErrors.bib_range_start}</p>
                        ) : null}
                    </div>

                    <div className="space-y-1">
                        <input
                            value={categoryForm.bib_range_end}
                            onChange={(e) => {
                                const v = e.target.value
                                setCategoryForm({ ...categoryForm, bib_range_end: v })
                                if (categoryErrors.bib_range_end) setCatErr("bib_range_end", undefined)
                            }}
                            onBlur={() => {
                                const v = categoryForm.bib_range_end.trim()
                                if (!v) return setCatErr("bib_range_end", undefined)
                                const n = Number(v)
                                if (!Number.isInteger(n)) return setCatErr("bib_range_end", "Must be a whole number.")
                                if (n < 0) return setCatErr("bib_range_end", "Cannot be negative.")

                                const start = parseOptionalInt(categoryForm.bib_range_start)
                                if (start != null && n < start) return setCatErr("bib_range_end", "Bib range end must be >= start.")
                                setCatErr("bib_range_end", undefined)
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Bib range end"
                        />
                        {categoryErrors.bib_range_end ? <p className="text-xs text-rose-600">{categoryErrors.bib_range_end}</p> : null}
                    </div>

                    <div className="space-y-1">
                        <input
                            value={categoryForm.bib_next}
                            onChange={(e) => {
                                const v = e.target.value
                                setCategoryForm({ ...categoryForm, bib_next: v })
                                if (categoryErrors.bib_next) setCatErr("bib_next", undefined)
                            }}
                            onBlur={() => {
                                const v = categoryForm.bib_next.trim()
                                if (!v) return setCatErr("bib_next", undefined)
                                const n = Number(v)
                                if (!Number.isInteger(n)) return setCatErr("bib_next", "Must be a whole number.")
                                if (n < 0) return setCatErr("bib_next", "Cannot be negative.")
                                setCatErr("bib_next", undefined)
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Next bib number"
                        />
                        {categoryErrors.bib_next ? <p className="text-xs text-rose-600">{categoryErrors.bib_next}</p> : null}
                    </div>
                </div>

                <div className="space-y-1">
          <textarea
              value={categoryForm.rules}
              onChange={(e) => {
                  const v = e.target.value
                  setCategoryForm({ ...categoryForm, rules: v })
                  if (categoryErrors.rules) setCatErr("rules", undefined)
              }}
              onBlur={() => {
                  const v = categoryForm.rules.trim()
                  if (!v) return setCatErr("rules", undefined)
                  try {
                      JSON.parse(v)
                      setCatErr("rules", undefined)
                  } catch {
                      setCatErr("rules", "Rules must be valid JSON.")
                  }
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              rows={3}
              placeholder="Advanced rules JSON (optional)"
          />
                    {categoryErrors.rules ? <p className="text-xs text-rose-600">{categoryErrors.rules}</p> : null}
                </div>

                <div className="flex flex-wrap gap-2">
                    <button onClick={handleCategorySave} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        {editingCategory ? "Update category" : "Create category"}
                    </button>
                    {editingCategory && (
                        <button
                            onClick={() => {
                                setEditingCategory(null)
                                setCategoryErrors({})
                                setCategoryForm({
                                    slug: "",
                                    name: "",
                                    price_kes: "",
                                    price_usd: "",
                                    price_eur: "",
                                    capacity: "",
                                    bib_prefix: "",
                                    bib_range_start: "",
                                    bib_range_end: "",
                                    bib_next: "",
                                    rules: "",
                                })
                            }}
                            className="rounded-full border border-slate-200 px-4 py-2 text-sm"
                        >
                            Cancel edit
                        </button>
                    )}
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-100">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">Price (KES)</th>
                            <th className="px-3 py-2">Capacity</th>
                            <th className="px-3 py-2">Bib range</th>
                            <th className="px-3 py-2">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {categorySummary.map((category) => (
                            <tr key={category.slug} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-700">{category.name}</td>
                                <td className="px-3 py-2 text-slate-600">{category.price_kes}</td>
                                <td className="px-3 py-2 text-slate-600">{category.capacity ?? "-"}</td>
                                <td className="px-3 py-2 text-slate-600">
                                    {category.bib_range_start ?? "-"} - {category.bib_range_end ?? "-"}
                                </td>

                                <td className="px-3 py-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleCategoryEdit(category)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                                            aria-label="Edit category"
                                            title="Edit"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleCategoryDelete(category)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-rose-700 transition hover:bg-slate-50"
                                            aria-label="Delete category"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {categories.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                                    No categories yet.
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">Registration form fields</h2>

                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                        <input
                            value={fieldForm.key}
                            onChange={(e) => {
                                const v = e.target.value
                                setFieldForm({ ...fieldForm, key: v })
                                if (fieldErrors.key) setFieldErr("key", v.trim() ? undefined : "Key is required.")
                            }}
                            onBlur={() => setFieldErr("key", fieldForm.key.trim() ? undefined : "Key is required.")}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Field key (e.g. emergency_phone)"
                        />
                        {fieldErrors.key ? <p className="text-xs text-rose-600">{fieldErrors.key}</p> : null}
                    </div>

                    <div className="space-y-1">
                        <input
                            value={fieldForm.label}
                            onChange={(e) => {
                                const v = e.target.value
                                setFieldForm({ ...fieldForm, label: v })
                                if (fieldErrors.label) setFieldErr("label", v.trim() ? undefined : "Label is required.")
                            }}
                            onBlur={() => setFieldErr("label", fieldForm.label.trim() ? undefined : "Label is required.")}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Label"
                        />
                        {fieldErrors.label ? <p className="text-xs text-rose-600">{fieldErrors.label}</p> : null}
                    </div>

                    <select
                        value={fieldForm.type}
                        onChange={(e) => setFieldForm({ ...fieldForm, type: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        {fieldTypes.map((type) => (
                            <option key={type} value={type}>
                                {type}
                            </option>
                        ))}
                    </select>

                    <div className="space-y-1">
                        <input
                            value={fieldForm.order}
                            onChange={(e) => {
                                const v = e.target.value
                                setFieldForm({ ...fieldForm, order: v })
                                if (fieldErrors.order) setFieldErr("order", undefined)
                            }}
                            onBlur={() => {
                                const v = fieldForm.order.trim()
                                if (!v) return setFieldErr("order", "Order is required.")
                                const n = Number(v)
                                if (!Number.isInteger(n)) return setFieldErr("order", "Order must be a whole number.")
                                if (n < 1) return setFieldErr("order", "Order must be >= 1.")
                                setFieldErr("order", undefined)
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Order"
                        />
                        {fieldErrors.order ? <p className="text-xs text-rose-600">{fieldErrors.order}</p> : null}
                    </div>

                    <input
                        value={fieldForm.options}
                        onChange={(e) => setFieldForm({ ...fieldForm, options: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Options (comma separated)"
                    />

                    <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                            type="checkbox"
                            checked={fieldForm.required}
                            onChange={(e) => setFieldForm({ ...fieldForm, required: e.target.checked })}
                        />
                        Required
                    </label>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button onClick={handleFieldSave} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        {editingField ? "Update field" : "Add field"}
                    </button>
                    {editingField && (
                        <button
                            onClick={() => {
                                setEditingField(null)
                                setFieldErrors({})
                                setFieldForm({ slug: "", key: "", label: "", type: "text", required: false, options: "", order: "1" })
                            }}
                            className="rounded-full border border-slate-200 px-4 py-2 text-sm"
                        >
                            Cancel edit
                        </button>
                    )}
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-100">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-3 py-2">Key</th>
                            <th className="px-3 py-2">Label</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Required</th>
                            <th className="px-3 py-2">Order</th>
                            <th className="px-3 py-2">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {formFields.map((field) => (
                            <tr key={field.slug} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-700">{field.key}</td>
                                <td className="px-3 py-2 text-slate-600">{field.label}</td>
                                <td className="px-3 py-2 text-slate-600">{field.type}</td>
                                <td className="px-3 py-2 text-slate-600">{field.required ? "Yes" : "No"}</td>
                                <td className="px-3 py-2 text-slate-600">{field.order}</td>

                                <td className="px-3 py-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleFieldEdit(field)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                                            aria-label="Edit field"
                                            title="Edit"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleFieldDelete(field)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-rose-700 transition hover:bg-slate-50"
                                            aria-label="Delete field"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {formFields.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                                    No form fields yet.
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </section>
        </main>
    )
}
