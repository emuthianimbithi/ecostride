"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { apiFetch, apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { useToast } from "../../../../components/toast"
import { toastApiError } from "../../../../lib/toast-api-error"
import { BlogHero, type HeroStyle } from "../../../../components/blog-hero"
import { compressVideo, isCompressibleVideo } from "../../../../lib/compress-video"
import { ResponsiveMedia, isVideoMedia } from "../../../../components/responsive-media"

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

type post_media_block = {
    id: string
    media_id?: number | null
    url: string
    mime: string
    type: "image" | "video" | "media"
    alt_text: string
    caption: string
    aspect_ratio: string
    poster_url: string
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

function extract_media_blocks(content: unknown): post_media_block[] {
    if (!Array.isArray(content)) return []

    return content.flatMap((block, index) => {
            if (!block || typeof block !== "object") return null
            const record = block as { type?: string; data?: Record<string, unknown> }
            const data = record.data ?? {}
            const url =
                typeof data.url === "string"
                    ? data.url
                    : typeof data.src === "string"
                      ? data.src
                      : typeof data.imageUrl === "string"
                        ? data.imageUrl
                        : ""
            if (!url) return null

            const mime =
                typeof data.mime === "string"
                    ? data.mime
                    : typeof data.contentType === "string"
                      ? data.contentType
                      : typeof data.mimeType === "string"
                        ? data.mimeType
                        : ""
            const type = isVideoMedia(url, mime, record.type) ? "video" : "image"

            return {
                id: `${index}-${url}`,
                media_id: typeof data.mediaId === "number" ? data.mediaId : null,
                url,
                mime,
                type,
                alt_text:
                    typeof data.altText === "string"
                        ? data.altText
                        : typeof data.alt === "string"
                          ? data.alt
                          : "",
                caption: typeof data.caption === "string" ? data.caption : "",
                aspect_ratio:
                    typeof data.aspectRatio === "string"
                        ? data.aspectRatio
                        : typeof data.ratio === "string"
                          ? data.ratio
                          : "",
                poster_url:
                    typeof data.posterUrl === "string"
                        ? data.posterUrl
                        : typeof data.poster === "string"
                          ? data.poster
                          : "",
            } satisfies post_media_block
        })
        .filter(Boolean) as post_media_block[]
}

function build_post_content(body: string, media_blocks: post_media_block[]) {
    const blocks: Array<{ type: string; data: Record<string, unknown> }> = []
    const trimmed = body.trim()
    if (trimmed) {
        blocks.push({ type: "paragraph", data: { body: trimmed } })
    }

    media_blocks.forEach((block) => {
        blocks.push({
            type: block.type,
            data: {
                url: block.url,
                altText: block.alt_text,
                caption: block.caption,
                mime: block.mime,
                posterUrl: block.poster_url || undefined,
                aspectRatio: block.aspect_ratio || undefined,
                mediaId: block.media_id || undefined,
            }
        })
    })

    return blocks
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
        hero_show_title: true,
        media_blocks: [] as post_media_block[]
    })

    const [media_form, setMediaForm] = useState({
        type: "image",
        url: "",
        alt_text: ""
    })

    const [media_files, setMediaFiles] = useState<File[]>([])
    const { toast } = useToast()

    // field-level errors (shows where the issue is)
    const [field_errors, setFieldErrors] = useState<field_errors>({})
    const initialFormRef = useRef("")
    const draftKey = "admin_cms_post_draft_v1"

    const load_posts = async () => {
        try {
            const data = await apiGet<cms_post[]>("/admin/posts")
            setPosts(Array.isArray(data) ? data : [])
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load posts")
        }
    }

    type media_item_api = {
        ID?: number
        id?: number
        slug: string
        type: string
        path: string
        url: string
        mime: string
        size: number
        alt_text: string
        CreatedAt?: string
        created_at?: string
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

    const normalize_media = (item: media_item_api): media_item => ({
        id: item.id ?? item.ID ?? 0,
        slug: item.slug,
        type: item.type,
        path: item.path,
        url: item.url,
        mime: item.mime,
        size: item.size,
        alt_text: item.alt_text,
        created_at: item.created_at ?? item.CreatedAt ?? ""
    })

    const load_media = async () => {
        try {
            const data = await apiGet<media_item_api[]>("/admin/media")
            setMedia(Array.isArray(data) ? data.map(normalize_media).filter((m) => m.id > 0) : [])
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
        try {
            const raw = localStorage.getItem(draftKey)
            if (raw) {
                const parsed = JSON.parse(raw)
                setForm((prev) => ({ ...prev, ...parsed }))
                setStatus("Draft restored")
            }
        } catch {
            // ignore draft restore failures
        }
    }, [])

    useEffect(() => {
        initialFormRef.current = JSON.stringify(form)
        // only when switching records/resetting; not on every keystroke
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing_slug])

    const reset_form = () => {
        setForm({
            url_slug: "",
            title: "",
            status: "draft",
            excerpt: "",
            body: "",
            featured_image_id: "",
            hero_style_id: "",
            hero_show_title: true,
            media_blocks: []
        })
        setEditingSlug(null)
        setFieldErrors({})
        try {
            localStorage.removeItem(draftKey)
        } catch {
            // ignore
        }
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

        const content_payload = build_post_content(form.body, form.media_blocks)
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

    useEffect(() => {
        const t = window.setTimeout(() => {
            try {
                localStorage.setItem(draftKey, JSON.stringify(form))
            } catch {
                // ignore autosave failures
            }
        }, 400)
        return () => window.clearTimeout(t)
    }, [form])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                e.preventDefault()
                void handle_save()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [form, editing_slug])

    const handle_edit = (post: cms_post) => {
        setForm({
            url_slug: post.url_slug,
            title: post.title,
            status: post.status,
            excerpt: post.excerpt ?? "",
            body: extract_body(post.content),
            featured_image_id: post.featured_image_media_id ? String(post.featured_image_media_id) : "",
            hero_style_id: post.hero_style_id ?? "",
            hero_show_title: post.hero_show_title ?? true,
            media_blocks: extract_media_blocks(post.content)
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
        if (media_form.type === "image" && !media_form.alt_text.trim()) {
            next.media_url = next.media_url ?? "Alt text is required for images."
        }

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
        if (media_files.length === 0) {
            setError("Choose file(s) to upload.")
            return
        }

        if (!media_form.alt_text.trim()) {
            setError("Alt text is required.")
            return
        }

        setError(null)
        setStatus("Uploading media...")

        try {
            for (let i = 0; i < media_files.length; i++) {
                const original = media_files[i]
                let toSend: File = original

                if (isCompressibleVideo(original)) {
                    setStatus(`Compressing video ${i + 1}/${media_files.length}: ${original.name} 0%`)

                    try {
                        const compressed = await compressVideo(original, {
                            onProgress: (p) => {
                                setStatus(
                                    `Compressing video ${i + 1}/${media_files.length}: ${original.name} ${Math.round(p * 100)}%`
                                )
                            }
                        })

                        // Keep a real filename + mime type after compression
                        toSend = new File(
                            [compressed],
                            original.name.replace(/\.[^.]+$/, ".mp4"),
                            { type: "video/mp4" }
                        )
                    } catch (compressErr) {
                        console.error("video compression failed, uploading original", compressErr)
                        toSend = original
                    }
                }

                setStatus(`Uploading ${i + 1}/${media_files.length}: ${toSend.name}`)

                const fd = new FormData()
                fd.append("file", toSend, toSend.name)

                // Important: backend should not have to infer this from a compressed blob
                fd.append("type", toSend.type.startsWith("video/") ? "video" : toSend.type.startsWith("image/") ? "image" : "file")

                const suffix = media_files.length > 1 ? ` (${i + 1}/${media_files.length})` : ""
                fd.append("alt_text", `${media_form.alt_text.trim()}${suffix}`)

                await apiFetch("/admin/media/upload", {
                    method: "POST",
                    body: fd
                })
            }

            setStatus("Media uploaded")
            setMediaFiles([])
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
        if (picked) return hero_styles.find((h) => h.id === picked) ?? null
        if (default_hero_style_id) return hero_styles.find((h) => h.id === default_hero_style_id) ?? null
        return null
    }, [form.hero_style_id, hero_styles, default_hero_style_id])

    const [block_media_id, setBlockMediaId] = useState("")

    const add_media_block = () => {
        const id = block_media_id ? Number(block_media_id) : NaN
        const item = media.find((entry) => entry.id === id)
        if (!item) {
            setError("Choose a media item to add to the post body.")
            return
        }

        const isVideo = isVideoMedia(item.url, item.mime, item.type)
        setForm((prev) => ({
            ...prev,
            media_blocks: [
                ...prev.media_blocks,
                {
                    id: `${item.id}-${Date.now()}`,
                    media_id: item.id,
                    url: item.url,
                    mime: item.mime,
                    type: isVideo ? "video" : "image",
                    alt_text: item.alt_text,
                    caption: "",
                    aspect_ratio: "",
                    poster_url: ""
                }
            ]
        }))
        setBlockMediaId("")
        setError(null)
    }

    const update_media_block = (id: string, patch: Partial<post_media_block>) => {
        setForm((prev) => ({
            ...prev,
            media_blocks: prev.media_blocks.map((block) => (block.id === id ? { ...block, ...patch } : block))
        }))
    }

    const move_media_block = (id: string, direction: -1 | 1) => {
        setForm((prev) => {
            const index = prev.media_blocks.findIndex((block) => block.id === id)
            if (index < 0) return prev
            const nextIndex = index + direction
            if (nextIndex < 0 || nextIndex >= prev.media_blocks.length) return prev
            const nextBlocks = [...prev.media_blocks]
            const [block] = nextBlocks.splice(index, 1)
            nextBlocks.splice(nextIndex, 0, block)
            return { ...prev, media_blocks: nextBlocks }
        })
    }

    const remove_media_block = (id: string) => {
        setForm((prev) => ({
            ...prev,
            media_blocks: prev.media_blocks.filter((block) => block.id !== id)
        }))
    }

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

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-slate-800">Body media blocks</h3>
                        <p className="text-xs text-slate-500">
                            Add reusable images or videos from the media library. Videos render with native player controls on the public blog.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <select
                            value={block_media_id}
                            onChange={(e) => setBlockMediaId(e.target.value)}
                            className="min-w-[18rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                            <option value="">Choose media to insert</option>
                            {media_options.map((option) => (
                                <option key={`block-${option.key}`} value={option.id}>
                                    {option.label || `Media ${option.id}`}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={add_media_block}
                            className="rounded-full border border-forest/25 px-4 py-2 text-sm font-semibold text-forest"
                        >
                            Add to post body
                        </button>
                    </div>

                    <div className="space-y-4">
                        {form.media_blocks.map((block, index) => {
                            const video = isVideoMedia(block.url, block.mime, block.type)
                            return (
                                <div key={block.id} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                                    <div className="space-y-2">
                                        <ResponsiveMedia
                                            src={block.url}
                                            alt={block.alt_text}
                                            mime={block.mime}
                                            type={block.type}
                                            poster={block.poster_url || undefined}
                                            aspectRatio={block.aspect_ratio || undefined}
                                            className="overflow-hidden rounded-xl"
                                            fillMode="contain"
                                            controls={video}
                                            preload="metadata"
                                        />
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                            {video ? "Video block" : "Image block"} #{index + 1}
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <input
                                                value={block.alt_text}
                                                onChange={(e) => update_media_block(block.id, { alt_text: e.target.value })}
                                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                                placeholder="Alt text"
                                            />
                                            <input
                                                value={block.aspect_ratio}
                                                onChange={(e) => update_media_block(block.id, { aspect_ratio: e.target.value })}
                                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                                placeholder="Aspect ratio (e.g. 16:9, 4:5)"
                                            />
                                        </div>

                                        <input
                                            value={block.caption}
                                            onChange={(e) => update_media_block(block.id, { caption: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                            placeholder="Caption"
                                        />

                                        {video ? (
                                            <input
                                                value={block.poster_url}
                                                onChange={(e) => update_media_block(block.id, { poster_url: e.target.value })}
                                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                                placeholder="Poster image URL (optional)"
                                            />
                                        ) : null}

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => move_media_block(block.id, -1)}
                                                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                            >
                                                Move up
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => move_media_block(block.id, 1)}
                                                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                            >
                                                Move down
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => remove_media_block(block.id)}
                                                className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}

                        {form.media_blocks.length === 0 ? (
                            <p className="text-sm text-slate-500">No media blocks yet.</p>
                        ) : null}
                    </div>
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
                            <option key={`${style.id}-${idx}`} value={style.id}>
                                {style.name} ({style.key})
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

            <section className="sticky bottom-3 z-20 rounded-2xl border border-tide-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                        {JSON.stringify(form) === initialFormRef.current ? "No unsaved changes" : "Unsaved changes"}
                        {" • "}
                        Press <span className="font-semibold">⌘S / Ctrl+S</span> to save.
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={reset_form} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                            Reset
                        </button>
                        <button onClick={handle_save} className="rounded-full bg-forest px-3 py-1.5 text-xs font-semibold text-white">
                            Save now
                        </button>
                    </div>
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
                        placeholder="Alt text (required for images)"
                    />
                </div>

                <div className="flex flex-wrap gap-3">
                    <button onClick={handle_add_media} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
                        Save media URL
                    </button>
                    <input
                        type="file"
                        accept="image/*,video/mp4,video/webm"
                        multiple
                        onChange={(e) => setMediaFiles(Array.from(e.target.files ?? []))}
                    />
                    <button
                        onClick={handle_upload_media}
                        className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
                    >
                        Upload file{media_files.length > 1 ? "s" : ""}
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
