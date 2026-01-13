"use client"

import { useEffect, useMemo, useState } from "react"
import { apiFetch, apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { useToast } from "../../../../components/toast"
import { toastApiError } from "../../../../lib/toast-api-error"
import { BlogHero, type HeroStyle } from "../../../../components/blog-hero"

// --------------------
// API response types (snake_case)
// --------------------
type cms_post = {
    id: number
    slug: string // UUID
    url_slug: string
    title: string
    status: string
    updated_at: string
    created_at: string
    published_at?: string | null
    content?: unknown
    excerpt?: string
    featured_image_media_id?: number | null
    featured_image_url?: string | null
    hero_style_id?: string | null
    hero_style?: HeroStyle | null
    hero_show_title?: boolean
}

type media_item = {
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

// --------------------
// Validation
// --------------------
type field_errors = {
    url_slug?: string
    title?: string
    body?: string
    media_url?: string
}

function is_valid_url_slug(s: string) {
    // lowercase, numbers, hyphens; no spaces; no leading/trailing hyphen
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}

function is_valid_http_url(value: string) {
    try {
        const u = new URL(value)
        return u.protocol === "http:" || u.protocol === "https:"
    } catch {
        return false
    }
}

export default function Page() {
    const [posts, setPosts] = useState<cms_post[]>([])
    const [media, setMedia] = useState<media_item[]>([])
    const [hero_styles, setHeroStyles] = useState<HeroStyle[]>([])
    const [default_hero_style_id, setDefaultHeroStyleId] = useState<string>("")

    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [editing_slug, setEditingSlug] = useState<string | null>(null) // UUID slug for edit mode

    const [form, setForm] = useState({
        url_slug: "",
        title: "",
        status: "draft",
        excerpt: "",
        body: "",
        featured_image_id: "",
        hero_style_id: "",
        hero_show_title: true
    })

    const [media_form, setMediaForm] = useState({
        type: "image",
        url: "",
        alt_text: ""
    })

    const [media_file, setMediaFile] = useState<File | null>(null)
    const { toast } = useToast()

    // field-level errors (shows where the issue is)
    const [field_errors, setFieldErrors] = useState<field_errors>({})

    const load_posts = async () => {
        try {
            const data = await apiGet<cms_post[]>("/admin/posts")
            setPosts(Array.isArray(data) ? data : [])
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load posts")
        }
    }

    const load_media = async () => {
        try {
            const data = await apiGet<media_item[]>("/admin/media")
            setMedia(Array.isArray(data) ? data : [])
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load media")
        }
    }

    const load_hero_styles = async () => {
        try {
            const [styles, def] = await Promise.all([
                apiGet<HeroStyle[]>("/admin/hero-styles?active=true"),
                apiGet<{ hero_style_id: string }>("/admin/settings/default-hero-style")
            ])
            setHeroStyles(Array.isArray(styles) ? styles : [])
            setDefaultHeroStyleId(def?.hero_style_id || "")
        } catch (err) {
            toastApiError(toast, err)
        }
    }

    useEffect(() => {
        void load_posts()
        void load_media()
        void load_hero_styles()
    }, [])

    const reset_form = () => {
        setForm({
            url_slug: "",
            title: "",
            status: "draft",
            excerpt: "",
            body: "",
            featured_image_id: "",
            hero_style_id: "",
            hero_show_title: true
        })
        setEditingSlug(null)
        setFieldErrors({})
    }

    const extract_body = (content: unknown) => {
        if (!content) return ""
        if (typeof content === "string") return content

        if (Array.isArray(content)) {
            return content
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

        if (typeof content === "object") {
            const record = content as Record<string, unknown>
            if (typeof record.body === "string") return record.body
            if (typeof record.text === "string") return record.text
        }

        return ""
    }

    // helper to add error styling without changing layout
    const with_error_class = (base: string, has_error: boolean) =>
        has_error ? `${base} border-rose-300 focus:ring-2 focus:ring-rose-200` : base

    const validate_post_form = (): field_errors => {
        const next: field_errors = {}
        const url_slug = form.url_slug.trim()
        const title = form.title.trim()

        if (!url_slug) next.url_slug = "Slug is required."
        else if (!is_valid_url_slug(url_slug))
            next.url_slug = "Use lowercase letters, numbers, and hyphens only (e.g. malindi-training-week)."

        if (!title) next.title = "Title is required."

        // if publishing, require body
        if (form.status === "published" && !form.body.trim()) {
            next.body = "Body is required when publishing."
        }

        return next
    }

    const handle_save = async () => {
        setError(null)
        setStatus(null)

        const next_errors = validate_post_form()
        setFieldErrors((prev) => ({ ...prev, ...next_errors }))

        if (Object.keys(next_errors).length > 0) {
            setError("Please fix the highlighted fields.")
            return
        }

        const trimmed_body = form.body.trim()
        const content_payload = trimmed_body ? { type: "markdown", body: trimmed_body } : {}
        const featured_image_media_id = form.featured_image_id ? Number(form.featured_image_id) : undefined
        const hero_style_id = form.hero_style_id.trim() ? form.hero_style_id.trim() : undefined

        try {
            // ✅ backend contract is snake_case
            const payload = {
                url_slug: form.url_slug.trim(),
                title: form.title.trim(),
                status: form.status,
                excerpt: form.excerpt,
                content: content_payload,
                featured_image_media_id,
                hero_style_id,
                hero_show_title: form.hero_show_title
            }

            if (editing_slug) {
                await apiPut(`/admin/posts/${editing_slug}`, payload)
                setStatus("Post updated")
            } else {
                await apiPost("/admin/posts", payload)
                setStatus("Post created")
            }

            reset_form()
            await load_posts()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to save post")
        }
    }

    const handle_edit = (post: cms_post) => {
        setForm({
            url_slug: post.url_slug,
            title: post.title,
            status: post.status,
            excerpt: post.excerpt ?? "",
            body: extract_body(post.content),
            featured_image_id: post.featured_image_media_id ? String(post.featured_image_media_id) : "",
            hero_style_id: post.hero_style_id ?? "",
            hero_show_title: post.hero_show_title ?? true
        })
        setEditingSlug(post.slug) // UUID slug
        setError(null)
        setStatus(null)
        setFieldErrors({})
    }

    const handle_publish = async (slug: string) => {
        setError(null)
        setStatus(null)
        try {
            await apiPost(`/admin/posts/${slug}/publish`, {})
            setStatus("Post published")
            await load_posts()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to publish post")
        }
    }

    const handle_add_media = async () => {
        setError(null)
        setStatus(null)

        const url = media_form.url.trim()
        const next: field_errors = {}

        if (!url) next.media_url = "Media URL is required."
        else if (!is_valid_http_url(url)) next.media_url = "Enter a valid http(s) URL."

        setFieldErrors((prev) => ({ ...prev, ...next }))

        if (Object.keys(next).length > 0) {
            setError("Please fix the highlighted fields.")
            return
        }

        try {
            await apiPost("/admin/media/upload", {
                type: media_form.type,
                url,
                alt_text: media_form.alt_text.trim()
            })
            setStatus("Media saved")
            setMediaForm({ type: "image", url: "", alt_text: "" })
            setFieldErrors((prev) => ({ ...prev, media_url: undefined }))
            await load_media()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to save media")
        }
    }

    const handle_upload_media = async () => {
        if (!media_file) {
            setError("Choose a file to upload.")
            return
        }
        setError(null)
        setStatus("Uploading media...")
        try {
            const fd = new FormData()
            fd.append("file", media_file)
            if (media_form.alt_text.trim()) {
                fd.append("alt_text", media_form.alt_text.trim())
            }
            await apiFetch("/admin/media/upload", { method: "POST", body: fd })
            setStatus("Media uploaded")
            setMediaFile(null)
            setMediaForm((prev) => ({ ...prev, url: "", alt_text: "" }))
            await load_media()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to upload media")
        }
    }

    // ensure keys are unique even if media has duplicates
    const media_options = useMemo(
        () =>
            media.map((item, idx) => ({
                id: item.id,
                key: `${item.id}-${idx}`,
                label: item.alt_text || item.url || item.path
            })),
        [media]
    )

    const selected_media = useMemo(() => {
        const id = form.featured_image_id ? Number(form.featured_image_id) : null
        if (!id) return null
        return media.find((m) => m.id === id) ?? null
    }, [form.featured_image_id, media])

    const selected_hero_style = useMemo(() => {
        const picked = form.hero_style_id.trim()
        if (picked) return hero_styles.find((h) => h.ID === picked) ?? null
        if (default_hero_style_id) return hero_styles.find((h) => h.ID === default_hero_style_id) ?? null
        return null
    }, [form.hero_style_id, hero_styles, default_hero_style_id])

    return (
        <main className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-forest">Blog & Media</h1>
                <p className="text-sm text-slate-600">Published posts appear on the public blog. Add images once and reuse.</p>
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
            {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">{editing_slug ? "Edit Post" : "New Post"}</h2>

                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                        <input
                            value={form.url_slug}
                            onChange={(e) => {
                                const v = e.target.value
                                setForm({ ...form, url_slug: v })
                                setFieldErrors((fe) => ({ ...fe, url_slug: undefined }))
                            }}
                            className={with_error_class("rounded-xl border border-slate-200 px-3 py-2 text-sm", !!field_errors.url_slug)}
                            placeholder="URL slug (e.g. malindi-training-week)"
                        />
                        {field_errors.url_slug && <p className="text-xs text-rose-600">{field_errors.url_slug}</p>}
                    </div>

                    <div className="space-y-1">
                        <input
                            value={form.title}
                            onChange={(e) => {
                                const v = e.target.value
                                setForm({ ...form, title: v })
                                setFieldErrors((fe) => ({ ...fe, title: undefined }))
                            }}
                            className={with_error_class("rounded-xl border border-slate-200 px-3 py-2 text-sm", !!field_errors.title)}
                            placeholder="Post title"
                        />
                        {field_errors.title && <p className="text-xs text-rose-600">{field_errors.title}</p>}
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

                <textarea
                    value={form.excerpt}
                    onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Short excerpt for previews."
                />

                <div className="space-y-1">
          <textarea
              value={form.body}
              onChange={(e) => {
                  const v = e.target.value
                  setForm({ ...form, body: v })
                  setFieldErrors((fe) => ({ ...fe, body: undefined }))
              }}
              className={with_error_class("w-full rounded-xl border border-slate-200 px-3 py-2 text-sm", !!field_errors.body)}
              rows={6}
              placeholder="Write the main blog content here."
          />
                    {field_errors.body && <p className="text-xs text-rose-600">{field_errors.body}</p>}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <select
                        value={form.featured_image_id}
                        onChange={(e) => setForm({ ...form, featured_image_id: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">No featured image</option>
                        {media_options.map((option) => (
                            <option key={option.key} value={option.id}>
                                {option.label || `Media ${option.id}`}
                            </option>
                        ))}
                    </select>

                    <select
                        value={form.hero_style_id}
                        onChange={(e) => setForm({ ...form, hero_style_id: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">Hero style: default</option>
                        {hero_styles.map((style, idx) => (
                            <option key={`${style.ID}-${idx}`} value={style.ID}>
                                {style.Name} ({style.Key})
                            </option>
                        ))}
                    </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                        type="checkbox"
                        checked={form.hero_show_title}
                        onChange={(e) => setForm({ ...form, hero_show_title: e.target.checked })}
                    />
                    Show title on hero
                </label>

                {selected_media?.url ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</p>
                        <div className="mt-3">
                            <BlogHero
                                imageUrl={selected_media.url}
                                title={form.title || "Preview title"}
                                excerpt={form.excerpt || "Preview excerpt"}
                                showTitle={form.hero_show_title}
                                heroStyle={selected_hero_style}
                            />
                        </div>
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                    <button onClick={handle_save} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        {editing_slug ? "Save changes" : "Create post"}
                    </button>
                    {editing_slug && (
                        <button
                            onClick={reset_form}
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
                    {posts.map((post) => (
                        <tr key={post.id} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-800">{post.url_slug}</td>
                            <td className="px-4 py-3 text-slate-600">{post.title}</td>
                            <td className="px-4 py-3 text-slate-600">{post.status}</td>
                            <td className="px-4 py-3 text-slate-600">
                                {post.updated_at ? new Date(post.updated_at).toLocaleDateString() : "-"}
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <button onClick={() => handle_edit(post)} className="font-semibold text-forest">
                                        Edit
                                    </button>
                                    {post.status !== "published" && (
                                        <button onClick={() => handle_publish(post.slug)} className="font-semibold text-sky-600">
                                            Publish
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    {posts.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                                No posts yet.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">Media Library</h2>
                <p className="text-sm text-slate-600">Add images you can reuse in posts. Upload a file or paste a hosted URL.</p>

                <div className="grid gap-3 md:grid-cols-3">
                    <select
                        value={media_form.type}
                        onChange={(e) => setMediaForm({ ...media_form, type: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="file">File</option>
                    </select>

                    <div className="space-y-1">
                        <input
                            value={media_form.url}
                            onChange={(e) => {
                                const v = e.target.value
                                setMediaForm({ ...media_form, url: v })
                                setFieldErrors((fe) => ({ ...fe, media_url: undefined }))
                            }}
                            className={with_error_class("rounded-xl border border-slate-200 px-3 py-2 text-sm", !!field_errors.media_url)}
                            placeholder="Media URL"
                        />
                        {field_errors.media_url && <p className="text-xs text-rose-600">{field_errors.media_url}</p>}
                    </div>

                    <input
                        value={media_form.alt_text}
                        onChange={(e) => setMediaForm({ ...media_form, alt_text: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Alt text (optional)"
                    />
                </div>

                <div className="flex flex-wrap gap-3">
                    <button onClick={handle_add_media} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        Save media URL
                    </button>
                    <input type="file" accept="image/*" onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)} />
                    <button
                        onClick={handle_upload_media}
                        className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
                    >
                        Upload file
                    </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-100">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <tr>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">URL</th>
                            <th className="px-3 py-2">Alt text</th>
                        </tr>
                        </thead>
                        <tbody>
                        {media.map((item) => (
                            <tr key={item.slug} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-600">{item.type}</td>
                                <td className="px-3 py-2 text-slate-600">{item.url || item.path || "-"}</td>
                                <td className="px-3 py-2 text-slate-600">{item.alt_text || "-"}</td>
                            </tr>
                        ))}
                        {media.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-3 py-3 text-center text-slate-500">
                                    No media yet.
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
