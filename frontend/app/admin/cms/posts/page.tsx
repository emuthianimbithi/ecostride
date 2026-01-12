"use client"

import { useEffect, useMemo, useState } from "react"
import { apiFetch, apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { useToast } from "../../../../components/toast"
import { toastApiError } from "../../../../lib/toast-api-error"
import { BlogHero, type HeroStyle } from "../../../../components/blog-hero"

// --------------------
// API response types (snake_case)
// --------------------
type CMSPostResponse = {
    id: number
    slug: string
    url_slug: string
    title: string
    status: string
    updated_at: string
    created_at: string
    published_at?: string | null
    content?: unknown
    excerpt?: string
    featured_image_media_id?: number | null
    featured_image_url?: string
    hero_style_id?: string | null
    hero_style?: HeroStyle | null
    hero_show_title?: boolean
}

type MediaItemResponse = {
    ID: number
    Slug: string
    Type: string
    Path: string
    Url: string
    Mime: string
    Size: number
    AltText: string
    CreatedAt: string
}

// --------------------
// Internal UI types (PascalCase)
// --------------------
type CMSPost = {
    ID: number
    Slug: string
    URLSlug: string
    Title: string
    Status: string
    UpdatedAt: string
    CreatedAt: string
    PublishedAt?: string | null
    Content?: unknown
    Excerpt?: string
    FeaturedImageMediaID?: number | null
    FeaturedImageURL?: string
    HeroStyleID?: string | null
    HeroStyle?: HeroStyle | null
    HeroShowTitle?: boolean
}

type MediaItem = {
    ID: number
    Slug: string
    Type: string
    Path: string
    URL: string
    Mime: string
    Size: number
    AltText: string
    CreatedAt: string
}

// --------------------
// Mappers (snake_case -> PascalCase)
// --------------------
function mapPost(p: CMSPostResponse): CMSPost {
    return {
        ID: p.id,
        Slug: p.slug,
        URLSlug: p.url_slug,
        Title: p.title,
        Status: p.status,
        UpdatedAt: p.updated_at,
        CreatedAt: p.created_at,
        PublishedAt: p.published_at ?? null,
        Content: p.content,
        Excerpt: p.excerpt,
        FeaturedImageMediaID: p.featured_image_media_id ?? null,
        FeaturedImageURL: p.featured_image_url,
        HeroStyleID: p.hero_style_id ?? null,
        HeroStyle: p.hero_style,
        HeroShowTitle: p.hero_show_title
    }
}

function mapMedia(m: MediaItemResponse): MediaItem {
    return {
        ID: m.ID,
        Slug: m.Slug,
        Type: m.Type,
        Path: m.Path,
        URL: m.Url,
        Mime: m.Mime,
        Size: m.Size,
        AltText: m.AltText,
        CreatedAt: m.CreatedAt
    }
}

export default function Page() {
    const [posts, setPosts] = useState<CMSPost[]>([])
    const [media, setMedia] = useState<MediaItem[]>([])
    const [heroStyles, setHeroStyles] = useState<HeroStyle[]>([])
    const [defaultHeroStyleId, setDefaultHeroStyleId] = useState<string>("")
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [editingSlug, setEditingSlug] = useState<string | null>(null)
    const [form, setForm] = useState({
        slug: "",
        title: "",
        status: "draft",
        excerpt: "",
        body: "",
        featuredImageId: "",
        heroStyleId: "",
        heroShowTitle: true
    })
    const [mediaForm, setMediaForm] = useState({
        type: "image",
        url: "",
        altText: ""
    })
    const [mediaFile, setMediaFile] = useState<File | null>(null)
    const { toast } = useToast()

    const loadPosts = async () => {
        try {
            const data = await apiGet<CMSPostResponse[]>("/admin/posts")
            setPosts(data.map(mapPost))
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load posts")
        }
    }

    const loadMedia = async () => {
        try {
            const data = await apiGet<MediaItemResponse[]>("/admin/media")
            setMedia(data.map(mapMedia))
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load media")
        }
    }

    const loadHeroStyles = async () => {
        try {
            const [styles, def] = await Promise.all([
                apiGet<HeroStyle[]>("/admin/hero-styles?active=true"),
                apiGet<{ heroStyleId: string }>("/admin/settings/default-hero-style")
            ])
            setHeroStyles(styles)
            setDefaultHeroStyleId(def.heroStyleId || "")
        } catch (err) {
            toastApiError(toast, err)
        }
    }

    useEffect(() => {
        void loadPosts()
        void loadMedia()
        void loadHeroStyles()
    }, [])

    const resetForm = () => {
        setForm({
            slug: "",
            title: "",
            status: "draft",
            excerpt: "",
            body: "",
            featuredImageId: "",
            heroStyleId: "",
            heroShowTitle: true
        })
        setEditingSlug(null)
    }

    const extractBody = (content: unknown) => {
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

    const handleSave = async () => {
        setError(null)
        setStatus(null)
        if (!form.slug || !form.title) {
            setError("Slug and title are required.")
            return
        }
        const trimmedBody = form.body.trim()
        const contentPayload = trimmedBody ? { type: "markdown", body: trimmedBody } : {}
        const featuredId = form.featuredImageId ? Number(form.featuredImageId) : undefined
        const heroStyleId = form.heroStyleId.trim() ? form.heroStyleId.trim() : undefined

        try {
            const payload = {
                slug: form.slug,
                title: form.title,
                status: form.status,
                excerpt: form.excerpt,
                content: contentPayload,
                featured_image_media_id: featuredId,
                hero_style_id: heroStyleId,
                hero_show_title: form.heroShowTitle
            }
            if (editingSlug) {
                await apiPut(`/admin/posts/${editingSlug}`, payload)
                setStatus("Post updated")
            } else {
                await apiPost("/admin/posts", payload)
                setStatus("Post created")
            }
            resetForm()
            await loadPosts()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to save post")
        }
    }

    const handleEdit = (post: CMSPost) => {
        setForm({
            slug: post.URLSlug,
            title: post.Title,
            status: post.Status,
            excerpt: post.Excerpt ?? "",
            body: extractBody(post.Content),
            featuredImageId: post.FeaturedImageMediaID ? String(post.FeaturedImageMediaID) : "",
            heroStyleId: post.HeroStyleID ?? "",
            heroShowTitle: post.HeroShowTitle ?? true
        })
        setEditingSlug(post.Slug)
        setError(null)
        setStatus(null)
    }

    const handlePublish = async (slug: string) => {
        setError(null)
        setStatus(null)
        try {
            await apiPost(`/admin/posts/${slug}/publish`, {})
            setStatus("Post published")
            await loadPosts()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to publish post")
        }
    }

    const handleAddMedia = async () => {
        setError(null)
        setStatus(null)
        if (!mediaForm.url.trim()) {
            setError("Media URL is required.")
            return
        }
        try {
            await apiPost("/admin/media/upload", {
                type: mediaForm.type,
                url: mediaForm.url.trim(),
                alt_text: mediaForm.altText.trim()
            })
            setStatus("Media saved")
            setMediaForm({ type: "image", url: "", altText: "" })
            await loadMedia()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to save media")
        }
    }

    const handleUploadMedia = async () => {
        if (!mediaFile) {
            setError("Choose a file to upload.")
            return
        }
        setError(null)
        setStatus("Uploading media...")
        try {
            const fd = new FormData()
            fd.append("file", mediaFile)
            if (mediaForm.altText.trim()) {
                fd.append("alt_text", mediaForm.altText.trim())
            }
            await apiFetch("/admin/media/upload", { method: "POST", body: fd })
            setStatus("Media uploaded")
            setMediaFile(null)
            setMediaForm((prev) => ({ ...prev, url: "", altText: "" }))
            await loadMedia()
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to upload media")
        }
    }

    // ✅ ensure keys are unique even if media has duplicates
    const mediaOptions = useMemo(
        () =>
            media.map((item, idx) => ({
                id: item.ID,
                key: `${item.ID}-${idx}`,
                label: item.AltText || item.URL || item.Path
            })),
        [media]
    )

    const selectedMedia = useMemo(() => {
        const id = form.featuredImageId ? Number(form.featuredImageId) : null
        if (!id) return null
        return media.find((m) => m.ID === id) ?? null
    }, [form.featuredImageId, media])

    const selectedHeroStyle = useMemo(() => {
        const picked = form.heroStyleId.trim()
        if (picked) return heroStyles.find((h) => h.id === picked) ?? null
        if (defaultHeroStyleId) return heroStyles.find((h) => h.id === defaultHeroStyleId) ?? null
        return null
    }, [form.heroStyleId, heroStyles, defaultHeroStyleId])

    return (
        <main className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-forest">Blog & Media</h1>
                <p className="text-sm text-slate-600">Published posts appear on the public blog. Add images once and reuse.</p>
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
            {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800">{editingSlug ? "Edit Post" : "New Post"}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                    <input
                        value={form.slug}
                        onChange={(e) => setForm({ ...form, slug: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="URL slug (e.g. malindi-training-week)"
                    />
                    <input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Post title"
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
                    value={form.excerpt}
                    onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Short excerpt for previews."
                />
                <textarea
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    rows={6}
                    placeholder="Write the main blog content here."
                />
                <div className="grid gap-3 md:grid-cols-2">
                    <select
                        value={form.featuredImageId}
                        onChange={(e) => setForm({ ...form, featuredImageId: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">No featured image</option>
                        {mediaOptions.map((option) => (
                            <option key={option.key} value={option.id}>
                                {option.label || `Media ${option.id}`}
                            </option>
                        ))}
                    </select>
                    <select
                        value={form.heroStyleId}
                        onChange={(e) => setForm({ ...form, heroStyleId: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="">Hero style: default</option>
                        {heroStyles.map((style, idx) => (
                            <option key={`${style.id}-${idx}`} value={style.id}>
                                {style.name} ({style.key})
                            </option>
                        ))}
                    </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                        type="checkbox"
                        checked={form.heroShowTitle}
                        onChange={(e) => setForm({ ...form, heroShowTitle: e.target.checked })}
                    />
                    Show title on hero
                </label>
                {selectedMedia?.URL ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</p>
                        <div className="mt-3">
                            <BlogHero
                                imageUrl={selectedMedia.URL}
                                title={form.title || "Preview title"}
                                excerpt={form.excerpt || "Preview excerpt"}
                                showTitle={form.heroShowTitle}
                                heroStyle={selectedHeroStyle}
                            />
                        </div>
                    </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                    <button onClick={handleSave} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        {editingSlug ? "Save changes" : "Create post"}
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
                    {posts.map((post) => (
                        <tr key={post.ID} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-800">{post.URLSlug}</td>
                            <td className="px-4 py-3 text-slate-600">{post.Title}</td>
                            <td className="px-4 py-3 text-slate-600">{post.Status}</td>
                            <td className="px-4 py-3 text-slate-600">
                                {post.UpdatedAt ? new Date(post.UpdatedAt).toLocaleDateString() : "-"}
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <button onClick={() => handleEdit(post)} className="font-semibold text-forest">
                                        Edit
                                    </button>
                                    {post.Status !== "published" && (
                                        <button onClick={() => handlePublish(post.Slug)} className="font-semibold text-sky-600">
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
                <p className="text-sm text-slate-600">
                    Add images you can reuse in posts. Upload a file or paste a hosted URL.
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                    <select
                        value={mediaForm.type}
                        onChange={(e) => setMediaForm({ ...mediaForm, type: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="file">File</option>
                    </select>
                    <input
                        value={mediaForm.url}
                        onChange={(e) => setMediaForm({ ...mediaForm, url: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Media URL"
                    />
                    <input
                        value={mediaForm.altText}
                        onChange={(e) => setMediaForm({ ...mediaForm, altText: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Alt text (optional)"
                    />
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={handleAddMedia}
                        className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
                    >
                        Save media URL
                    </button>
                    <input type="file" accept="image/*" onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)} />
                    <button
                        onClick={handleUploadMedia}
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
                            <tr key={item.ID} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-600">{item.Type}</td>
                                <td className="px-3 py-2 text-slate-600">{item.URL || item.Path || "-"}</td>
                                <td className="px-3 py-2 text-slate-600">{item.AltText || "-"}</td>
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
