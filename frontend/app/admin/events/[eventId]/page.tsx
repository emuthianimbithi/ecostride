"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { apiDelete, apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { Pencil, Trash2 } from "lucide-react"

type Event = {
    slug: string
    url_slug: string
    title: string
    type: string
    status: string
    location: string
    start_at: string
    reg_open_at?: string | null
    reg_close_at?: string | null
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
    const [categories, setCategories] = useState<Category[]>([])
    const [formFields, setFormFields] = useState<FormField[]>([])
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

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

    useEffect(() => {
        void loadEvent()
        void loadCategories()
        void loadFormFields()
    }, [eventId])

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
                    <p className="text-xs uppercase text-slate-400">Status: {event.status}</p>
                </section>
            )}

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
