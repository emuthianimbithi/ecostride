"use client"

import { useEffect, useState } from "react"
import { apiGet, apiPost, apiPut } from "../../../../lib/api-client"

type CMSPage = {
  Slug: string
  URLSlug: string
  Title: string
  Status: string
  UpdatedAt: string
  Blocks?: unknown
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

  const loadPages = async () => {
    try {
      const data = await apiGet<CMSPage[]>("/admin/pages")
      setPages(data)
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

  const handleSave = async () => {
    setError(null)
    setStatus(null)
    if (!form.slug || !form.title) {
      setError("Slug and title are required.")
      return
    }
    const trimmedBody = form.body.trim()
    const blocksPayload = trimmedBody
      ? [{ type: "paragraph", data: { body: trimmedBody } }]
      : []
    try {
      const payload = {
        slug: form.slug,
        title: form.title,
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
      slug: page.URLSlug,
      title: page.Title,
      status: page.Status,
      body: extractBody(page.Blocks)
    })
    setEditingSlug(page.Slug)
    setStatus(null)
    setError(null)
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
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="URL slug (e.g. contact)"
          />
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Page title"
          />
        </div>
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          rows={6}
          placeholder="Write the page content here. Keep it short and friendly."
        />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
          >
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
              <tr key={page.Slug} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{page.URLSlug}</td>
                <td className="px-4 py-3 text-slate-600">{page.Title}</td>
                <td className="px-4 py-3 text-slate-600">{page.Status}</td>
                <td className="px-4 py-3 text-slate-600">
                  {page.UpdatedAt ? new Date(page.UpdatedAt).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button onClick={() => handleEdit(page)} className="font-semibold text-forest">
                      Edit
                    </button>
                    {page.Status !== "published" && (
                      <button onClick={() => handlePublish(page.Slug)} className="font-semibold text-sky-600">
                        Publish
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
