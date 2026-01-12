"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { apiDelete, apiGet, apiPost, apiPut } from "../../../../lib/api-client"

type Event = {
  Slug: string
  URLSlug: string
  Title: string
  Type: string
  Status: string
  Location: string
  StartAt: string
  RegOpenAt?: string | null
  RegCloseAt?: string | null
}

type Category = {
  Slug: string
  Name: string
  PriceKESMinor: number
  PriceUSDMinor?: number
  PriceEURMinor?: number
  Capacity?: number
  BibPrefix?: string
  BibRangeStart?: number
  BibRangeEnd?: number
  BibNext?: number
  Rules?: unknown
}

type FormField = {
  Slug: string
  Key: string
  Label: string
  Type: string
  Required: boolean
  Options?: unknown
  Order: number
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
  const [categoryForm, setCategoryForm] = useState({
    slug: "",
    name: "",
    priceKES: "",
    priceUSD: "",
    priceEUR: "",
    capacity: "",
    bibPrefix: "",
    bibRangeStart: "",
    bibRangeEnd: "",
    bibNext: "",
    rules: ""
  })
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [fieldForm, setFieldForm] = useState({
    slug: "",
    key: "",
    label: "",
    type: "text",
    required: false,
    options: "",
    order: "1"
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

  const handleCategorySave = async () => {
    setError(null)
    setStatus(null)
    if (!categoryForm.name) {
      setError("Category name is required.")
      return
    }
    let rulesValue: unknown
    if (categoryForm.rules.trim()) {
      try {
        rulesValue = JSON.parse(categoryForm.rules)
      } catch {
        setError("Rules must be valid JSON.")
        return
      }
    }
    const payload = {
      name: categoryForm.name,
      price_kes_minor: toMinor(categoryForm.priceKES) ?? 0,
      price_usd_minor: toMinor(categoryForm.priceUSD),
      price_eur_minor: toMinor(categoryForm.priceEUR),
      capacity: parseOptionalInt(categoryForm.capacity),
      bib_prefix: categoryForm.bibPrefix,
      bib_range_start: parseOptionalInt(categoryForm.bibRangeStart),
      bib_range_end: parseOptionalInt(categoryForm.bibRangeEnd),
      bib_next: parseOptionalInt(categoryForm.bibNext),
      rules: rulesValue
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
        priceKES: "",
        priceUSD: "",
        priceEUR: "",
        capacity: "",
        bibPrefix: "",
        bibRangeStart: "",
        bibRangeEnd: "",
        bibNext: "",
        rules: ""
      })
      setEditingCategory(null)
      await loadCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category")
    }
  }

  const handleCategoryEdit = (category: Category) => {
    setEditingCategory(category.Slug)
    setCategoryForm({
      slug: category.Slug,
      name: category.Name,
      priceKES: (category.PriceKESMinor / 100).toFixed(2),
      priceUSD: category.PriceUSDMinor ? (category.PriceUSDMinor / 100).toFixed(2) : "",
      priceEUR: category.PriceEURMinor ? (category.PriceEURMinor / 100).toFixed(2) : "",
      capacity: category.Capacity ? String(category.Capacity) : "",
      bibPrefix: category.BibPrefix ?? "",
      bibRangeStart: category.BibRangeStart ? String(category.BibRangeStart) : "",
      bibRangeEnd: category.BibRangeEnd ? String(category.BibRangeEnd) : "",
      bibNext: category.BibNext ? String(category.BibNext) : "",
      rules: category.Rules ? JSON.stringify(category.Rules) : ""
    })
  }

  const handleCategoryDelete = async (category: Category) => {
    if (!confirm(`Delete ${category.Name}?`)) return
    setError(null)
    try {
      await apiDelete(`/admin/events/${eventId}/categories/${category.Slug}`)
      setStatus("Category deleted")
      await loadCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category")
    }
  }

  const handleFieldSave = async () => {
    setError(null)
    setStatus(null)
    if (!fieldForm.key || !fieldForm.label) {
      setError("Key and label are required.")
      return
    }
    const options = fieldForm.options
      ? fieldForm.options.split(",").map((value) => value.trim()).filter(Boolean)
      : []
    const payload = {
      key: fieldForm.key,
      label: fieldForm.label,
      type: fieldForm.type,
      required: fieldForm.required,
      options,
      order: Number(fieldForm.order || "1")
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
      setEditingField(null)
      await loadFormFields()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save form field")
    }
  }

  const handleFieldEdit = (field: FormField) => {
    const optionValues = Array.isArray(field.Options) ? field.Options : []
    const optionLabels = optionValues
      .map((option) => (typeof option === "string" ? option : ""))
      .filter(Boolean)
      .join(", ")
    setEditingField(field.Slug)
    setFieldForm({
      slug: field.Slug,
      key: field.Key,
      label: field.Label,
      type: field.Type,
      required: field.Required,
      options: optionLabels,
      order: String(field.Order ?? 1)
    })
  }

  const handleFieldDelete = async (field: FormField) => {
    if (!confirm(`Delete ${field.Label}?`)) return
    setError(null)
    try {
      await apiDelete(`/admin/events/${eventId}/form-fields/${field.Slug}`)
      setStatus("Form field deleted")
      await loadFormFields()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete form field")
    }
  }

  const categorySummary = useMemo(() => {
    return categories.map((category) => ({
      ...category,
      priceKES: (category.PriceKESMinor / 100).toFixed(2)
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
          <h2 className="text-lg font-semibold text-slate-800">{event.Title}</h2>
          <p className="text-sm text-slate-600">
            {event.Type} • {event.Location || "Location TBD"} •{" "}
            {event.StartAt ? new Date(event.StartAt).toLocaleDateString() : "TBD"}
          </p>
          <p className="text-xs uppercase text-slate-400">Status: {event.Status}</p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Categories</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={categoryForm.name}
            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Category name"
          />
          <input
            value={categoryForm.capacity}
            onChange={(e) => setCategoryForm({ ...categoryForm, capacity: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Capacity (optional)"
          />
          <input
            value={categoryForm.priceKES}
            onChange={(e) => setCategoryForm({ ...categoryForm, priceKES: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Price KES"
          />
          <input
            value={categoryForm.priceUSD}
            onChange={(e) => setCategoryForm({ ...categoryForm, priceUSD: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Price USD"
          />
          <input
            value={categoryForm.priceEUR}
            onChange={(e) => setCategoryForm({ ...categoryForm, priceEUR: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Price EUR"
          />
          <input
            value={categoryForm.bibPrefix}
            onChange={(e) => setCategoryForm({ ...categoryForm, bibPrefix: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Bib prefix"
          />
          <input
            value={categoryForm.bibRangeStart}
            onChange={(e) => setCategoryForm({ ...categoryForm, bibRangeStart: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Bib range start"
          />
          <input
            value={categoryForm.bibRangeEnd}
            onChange={(e) => setCategoryForm({ ...categoryForm, bibRangeEnd: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Bib range end"
          />
          <input
            value={categoryForm.bibNext}
            onChange={(e) => setCategoryForm({ ...categoryForm, bibNext: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Next bib number"
          />
        </div>
        <textarea
          value={categoryForm.rules}
          onChange={(e) => setCategoryForm({ ...categoryForm, rules: e.target.value })}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          rows={3}
          placeholder="Advanced rules JSON (optional)"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCategorySave} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
            {editingCategory ? "Update category" : "Create category"}
          </button>
          {editingCategory && (
            <button
              onClick={() => {
                setEditingCategory(null)
                setCategoryForm({
                  slug: "",
                  name: "",
                  priceKES: "",
                  priceUSD: "",
                  priceEUR: "",
                  capacity: "",
                  bibPrefix: "",
                  bibRangeStart: "",
                  bibRangeEnd: "",
                  bibNext: "",
                  rules: ""
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
                <tr key={category.Slug} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">{category.Name}</td>
                  <td className="px-3 py-2 text-slate-600">{category.priceKES}</td>
                  <td className="px-3 py-2 text-slate-600">{category.Capacity ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {category.BibRangeStart ?? "-"} - {category.BibRangeEnd ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex gap-2">
                      <button onClick={() => handleCategoryEdit(category)} className="font-semibold text-forest">
                        Edit
                      </button>
                      <button onClick={() => handleCategoryDelete(category)} className="font-semibold text-rose-600">
                        Delete
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
          <input
            value={fieldForm.key}
            onChange={(e) => setFieldForm({ ...fieldForm, key: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Field key (e.g. emergencyPhone)"
          />
          <input
            value={fieldForm.label}
            onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Label"
          />
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
          <input
            value={fieldForm.order}
            onChange={(e) => setFieldForm({ ...fieldForm, order: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Order"
          />
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
                <tr key={field.Slug} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">{field.Key}</td>
                  <td className="px-3 py-2 text-slate-600">{field.Label}</td>
                  <td className="px-3 py-2 text-slate-600">{field.Type}</td>
                  <td className="px-3 py-2 text-slate-600">{field.Required ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-slate-600">{field.Order}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex gap-2">
                      <button onClick={() => handleFieldEdit(field)} className="font-semibold text-forest">
                        Edit
                      </button>
                      <button onClick={() => handleFieldDelete(field)} className="font-semibold text-rose-600">
                        Delete
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
