"use client"

import { useEffect, useState } from "react"
import { apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { Pencil, UploadCloud } from "lucide-react"

type CMSPage = {
    slug: string
    url_slug: string
    title: string
    status: string
    updated_at: string
    blocks?: unknown
}

type FieldErrors = {
    slug?: string
    title?: string
    body?: string
}

export default function Page() {
    const [pages, setPages] = useState<CMSPage[]>([])
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [form, setForm] = useState({
        slug: "",
        title: "",
        status: "draft",
        body: ""
    })
    const [editingSlug, setEditingSlug] = useState<string | null>(null)

    // ✅ field-level validation state (no design changes)
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

    const loadPages = async () => {
        try {
            const data = await apiGet<CMSPage[]>("/admin/pages")
            setPages(Array.isArray(data) ? data : [])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load")
        }
    }

    useEffect(() => {
        void loadPages()
    }, [])

    const resetForm = () => {
        setForm({ slug: "", title: "", status: "draft", body: "" })
        setEditingSlug(null)
        setFieldErrors({})
    }

    const extractBody = (blocks: unknown) => {
        if (!Array.isArray(blocks)) return ""
        return blocks
            .map((block) => {
                if (!block || typeof block !== "object") return ""
                const data = (block as { data?: Record<string, unknown> }).data ?? {}
                const body = data.body
                const text = data.text
                if (typeof body === "string") return body
                if (typeof text === "string") return text
                return ""
            })
            .filter(Boolean)
            .join("\n\n")
    }

    // ✅ validation logic (minimal)
    const validate = (): FieldErrors => {
        const next: FieldErrors = {}

        const slug = form.slug.trim()
        const title = form.title.trim()

        if (!slug) next.slug = "Slug is required."
        else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
            next.slug = "Use lowercase letters, numbers, and hyphens only (e.g. contact-us)."
        }

        if (!title) next.title = "Title is required."

        // optional rule: body required if publishing
        if (form.status === "published" && !form.body.trim()) {
            next.body = "Body is required when publishing."
        }

        return next
    }

    const handleSave = async () => {
        setError(null)
        setStatus(null)

        const nextErrors = validate()
        setFieldErrors(nextErrors)

        if (Object.keys(nextErrors).length > 0) {
            setError("Please fix the highlighted fields.")
            return
        }

        const trimmedBody = form.body.trim()
        const blocksPayload = trimmedBody ? [{ type: "paragraph", data: { body: trimmedBody } }] : []

        try {
            const payload = {
                // backend expects snake_case
                url_slug: form.slug.trim(),
                title: form.title.trim(),
                status: form.status,
                blocks: blocksPayload
            }

            if (editingSlug) {
                await apiPut(`/admin/pages/${editingSlug}`, payload)
                setStatus("Page updated")
            } else {
                await apiPost("/admin/pages", payload)
                setStatus("Page created")
            }

            resetForm()
            await loadPages()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save page")
        }
    }

    const handleEdit = (page: CMSPage) => {
        setForm({
            slug: page.url_slug,
            title: page.title,
            status: page.status,
            body: extractBody(page.blocks)
        })
        setEditingSlug(page.slug)
        setStatus(null)
        setError(null)
        setFieldErrors({})
    }

    const handlePublish = async (slug: string) => {
        setError(null)
        setStatus(null)
        try {
            await apiPost(`/admin/pages/${slug}/publish`, {})
            setStatus("Page published")
            await loadPages()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to publish page")
        }
    }

    // ✅ add error styles without changing layout/design
    const withErrorClass = (base: string, hasError: boolean) =>
        hasError ? `${base} border-rose-300 focus:ring-2 focus:ring-rose-200` : base

    return (
        <main className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-forest">Site Pages</h1>
                <p className="text-sm text-slate-600">
                    These pages power your main site content like Contact, FAQ, Privacy, and other static pages.
                </p>
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
            {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">{editingSlug ? "Edit Page" : "New Page"}</h2>

                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                        <input
                            value={form.slug}
                            onChange={(e) => {
                                const v = e.target.value
                                setForm({ ...form, slug: v })
                                setFieldErrors((fe) => ({ ...fe, slug: undefined }))
                            }}
                            className={withErrorClass("rounded-xl border border-slate-200 px-3 py-2 text-sm", !!fieldErrors.slug)}
                            placeholder="URL slug (e.g. contact)"
                        />
                        {fieldErrors.slug && <p className="text-xs text-rose-600">{fieldErrors.slug}</p>}
                    </div>

                    <div className="space-y-1">
                        <input
                            value={form.title}
                            onChange={(e) => {
                                const v = e.target.value
                                setForm({ ...form, title: v })
                                setFieldErrors((fe) => ({ ...fe, title: undefined }))
                            }}
                            className={withErrorClass("rounded-xl border border-slate-200 px-3 py-2 text-sm", !!fieldErrors.title)}
                            placeholder="Page title"
                        />
                        {fieldErrors.title && <p className="text-xs text-rose-600">{fieldErrors.title}</p>}
                    </div>
                </div>

                <select
                    value={form.status}
                    onChange={(e) => {
                        const v = e.target.value
                        setForm({ ...form, status: v })
                        setFieldErrors((fe) => ({ ...fe, body: undefined }))
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                </select>

                <div className="space-y-1">
          <textarea
              value={form.body}
              onChange={(e) => {
                  const v = e.target.value
                  setForm({ ...form, body: v })
                  setFieldErrors((fe) => ({ ...fe, body: undefined }))
              }}
              className={withErrorClass("w-full rounded-xl border border-slate-200 px-3 py-2 text-sm", !!fieldErrors.body)}
              rows={6}
              placeholder="Write the page content here. Keep it short and friendly."
          />
                    {fieldErrors.body && <p className="text-xs text-rose-600">{fieldErrors.body}</p>}
                </div>

                <div className="flex flex-wrap gap-3">
                    <button onClick={handleSave} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        {editingSlug ? "Save changes" : "Create page"}
                    </button>
                    {editingSlug && (
                        <button
                            onClick={resetForm}
                            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                        >
                            Cancel edit
                        </button>
                    )}
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th className="px-4 py-3">Slug</th>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Updated</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {pages.map((page) => (
                        <tr key={page.slug} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-800">{page.url_slug}</td>
                            <td className="px-4 py-3 text-slate-600">{page.title}</td>
                            <td className="px-4 py-3 text-slate-600">{page.status}</td>
                            <td className="px-4 py-3 text-slate-600">
                                {page.updated_at ? new Date(page.updated_at).toLocaleDateString() : "-"}
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleEdit(page)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                                        aria-label="Edit page"
                                        title="Edit"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>

                                    {page.status !== "published" && (
                                        <button
                                            onClick={() => handlePublish(page.slug)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sky-700 transition hover:bg-slate-50"
                                            aria-label="Publish page"
                                            title="Publish"
                                        >
                                            <UploadCloud className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    {pages.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                                No pages yet.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </section>
        </main>
    )
}
