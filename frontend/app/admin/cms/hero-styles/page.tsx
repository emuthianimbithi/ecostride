"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { toastApiError } from "../../../../lib/toast-api-error"
import { useToast } from "../../../../components/toast"
import { BlogHero, type HeroStyle } from "../../../../components/blog-hero"

type DefaultSettingResponse = { hero_style_id: string }

const layoutOptions = ["FULL_BLEED", "FULL_BLEED_GRADIENT", "CONTAINED_CARD", "SPLIT_LEFT"] as const
const paddingOptions = ["NONE", "SM", "MD", "LG"] as const
const placementOptions = ["LEFT", "CENTER", "RIGHT"] as const

function parseAspectRatio(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return "21:9"
    return trimmed
}

// --------------------
// API/UI type (snake_case)
// --------------------
type hero_style = {
    id: string
    name: string
    key: string
    description: string
    layout_type: string
    aspect_ratio: string
    overlay: unknown
    focal_point: unknown
    text_placement: string
    padding_variant: string
    is_active: boolean
    slug: string
}

export default function Page() {
    const { toast } = useToast()
    const [styles, setStyles] = useState<hero_style[]>([])
    const [defaultHeroStyleId, setDefaultHeroStyleId] = useState<string>("")
    const [status, setStatus] = useState<string | null>(null)
    const [editing, setEditing] = useState<hero_style | null>(null)

    // --------------------
    // Form state (snake_case)
    // --------------------
    const [form, setForm] = useState({
        name: "",
        key: "",
        description: "",
        layout_type: "FULL_BLEED" as (typeof layoutOptions)[number],
        aspect_ratio: "21:9",
        overlay_enabled: false,
        overlay_type: "gradient" as "gradient" | "solid",
        overlay_opacity: 0.45,
        focal_x: 0.5,
        focal_y: 0.5,
        text_placement: "LEFT" as (typeof placementOptions)[number],
        padding_variant: "MD" as (typeof paddingOptions)[number],
        is_active: true
    })

    // --------------------
    // Field-level validation (UI only; no design change)
    // --------------------
    const [errors, setErrors] = useState<Record<string, string>>({})

    const setFieldError = (field: string, message?: string) => {
        setErrors((prev) => {
            const next = { ...prev }
            if (!message) delete next[field]
            else next[field] = message
            return next
        })
    }

    const validate = () => {
        const next: Record<string, string> = {}

        if (!form.name.trim()) next.name = "Name is required."
        if (!form.key.trim()) next.key = "Key is required."
        if (!parseAspectRatio(form.aspect_ratio).trim()) next.aspect_ratio = "Aspect ratio is required."

        if (form.overlay_enabled) {
            if (typeof form.overlay_opacity !== "number" || Number.isNaN(form.overlay_opacity)) {
                next.overlay_opacity = "Overlay opacity must be a number."
            } else if (form.overlay_opacity < 0 || form.overlay_opacity > 1) {
                next.overlay_opacity = "Overlay opacity must be between 0 and 1."
            }
        }

        if (typeof form.focal_x !== "number" || Number.isNaN(form.focal_x) || form.focal_x < 0 || form.focal_x > 1) {
            next.focal_x = "Focal X must be between 0 and 1."
        }
        if (typeof form.focal_y !== "number" || Number.isNaN(form.focal_y) || form.focal_y < 0 || form.focal_y > 1) {
            next.focal_y = "Focal Y must be between 0 and 1."
        }

        setErrors(next)
        return Object.keys(next).length === 0
    }

    const load = async () => {
        try {
            const [s, def] = await Promise.all([
                apiGet<hero_style[]>("/admin/hero-styles"),
                apiGet<DefaultSettingResponse>("/admin/settings/default-hero-style")
            ])
            setStyles(Array.isArray(s) ? s : [])
            setDefaultHeroStyleId(def?.hero_style_id || "")
        } catch (err) {
            toastApiError(toast, err)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    const resetForm = () => {
        setEditing(null)
        setErrors({})
        setForm({
            name: "",
            key: "",
            description: "",
            layout_type: "FULL_BLEED",
            aspect_ratio: "21:9",
            overlay_enabled: false,
            overlay_type: "gradient",
            overlay_opacity: 0.45,
            focal_x: 0.5,
            focal_y: 0.5,
            text_placement: "LEFT",
            padding_variant: "MD",
            is_active: true
        })
    }

    // --------------------
    // API payload (snake_case)
    // --------------------
    const submitPayload = useMemo(() => {
        const overlay = form.overlay_enabled
            ? { enabled: true, type: form.overlay_type, opacity: form.overlay_opacity }
            : { enabled: false }

        const focalPoint = { x: form.focal_x, y: form.focal_y }

        return {
            name: form.name.trim(),
            key: form.key.trim(),
            description: form.description.trim(),
            layout_type: form.layout_type,
            aspect_ratio: parseAspectRatio(form.aspect_ratio),
            overlay,
            focal_point: focalPoint,
            text_placement: form.text_placement,
            padding_variant: form.padding_variant,
            is_active: form.is_active
        }
    }, [form])

    const handleEdit = (style: hero_style) => {
        setEditing(style)
        setStatus(null)
        setErrors({})

        const overlay = (style.overlay ?? {}) as any
        const focal = (style.focal_point ?? {}) as any

        setForm({
            name: style.name ?? "",
            key: style.key ?? "",
            description: style.description ?? "",
            layout_type: (layoutOptions.includes(style.layout_type as any) ? (style.layout_type as any) : "FULL_BLEED") as any,
            aspect_ratio: style.aspect_ratio ?? "21:9",
            overlay_enabled: !!overlay.enabled,
            overlay_type: overlay.type === "solid" ? "solid" : "gradient",
            overlay_opacity: typeof overlay.opacity === "number" ? overlay.opacity : 0.45,
            focal_x: typeof focal.x === "number" ? focal.x : 0.5,
            focal_y: typeof focal.y === "number" ? focal.y : 0.5,
            text_placement: (placementOptions.includes(style.text_placement as any) ? (style.text_placement as any) : "LEFT") as any,
            padding_variant: (paddingOptions.includes(style.padding_variant as any) ? (style.padding_variant as any) : "MD") as any,
            is_active: style.is_active ?? true
        })
    }

    const handleSave = async () => {
        setStatus(null)
        if (!validate()) {
            toast({ title: "Please fix the highlighted fields.", variant: "destructive" })
            return
        }

        try {
            if (editing) {
                await apiPut(`/admin/hero-styles/${editing.id}`, submitPayload)
                setStatus("Hero style updated.")
            } else {
                await apiPost("/admin/hero-styles", submitPayload)
                setStatus("Hero style created.")
            }
            resetForm()
            await load()
        } catch (err) {
            toastApiError(toast, err)
        }
    }

    const handleDisable = async (style: hero_style) => {
        setStatus(null)
        try {
            await apiPost(`/admin/hero-styles/${style.id}/disable`, {})
            setStatus("Hero style disabled.")
            await load()
        } catch (err) {
            toastApiError(toast, err)
        }
    }

    const handleSetDefault = async (heroStyleId: string) => {
        setDefaultHeroStyleId(heroStyleId)
        try {
            await apiPut("/admin/settings/default-hero-style", { hero_style_id: heroStyleId })
            setStatus("Default hero style updated.")
        } catch (err) {
            toastApiError(toast, err)
            await load()
        }
    }

    return (
        <main className="space-y-8">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">Hero Styles</h1>
                <p className="text-sm text-muted-foreground">
                    Preconfigured hero templates for blog featured images (no custom CSS).
                </p>
                {status ? <p className="text-sm text-forest">{status}</p> : null}
            </div>

            <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">{editing ? "Edit style" : "Create style"}</h2>
                        {editing ? (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                            >
                                Cancel
                            </button>
                        ) : null}
                    </div>

                    <div className="mt-5 grid gap-4">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium text-foreground">Name</label>
                            <input
                                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                value={form.name}
                                onChange={(e) => {
                                    const v = e.target.value
                                    setForm((p) => ({ ...p, name: v }))
                                    if (errors.name) setFieldError("name", v.trim() ? undefined : "Name is required.")
                                }}
                                onBlur={() => setFieldError("name", form.name.trim() ? undefined : "Name is required.")}
                                aria-invalid={!!errors.name}
                            />
                            {errors.name ? <p className="text-xs text-rose-600">{errors.name}</p> : null}
                        </div>

                        <div className="grid gap-2">
                            <label className="text-sm font-medium text-foreground">Key</label>
                            <input
                                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                placeholder="machine_key"
                                value={form.key}
                                onChange={(e) => {
                                    const v = e.target.value
                                    setForm((p) => ({ ...p, key: v }))
                                    if (errors.key) setFieldError("key", v.trim() ? undefined : "Key is required.")
                                }}
                                onBlur={() => setFieldError("key", form.key.trim() ? undefined : "Key is required.")}
                                aria-invalid={!!errors.key}
                            />
                            {errors.key ? <p className="text-xs text-rose-600">{errors.key}</p> : null}
                        </div>

                        <div className="grid gap-2">
                            <label className="text-sm font-medium text-foreground">Description</label>
                            <textarea
                                className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                                value={form.description}
                                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-foreground">Layout</label>
                                <select
                                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                    value={form.layout_type}
                                    onChange={(e) => setForm((p) => ({ ...p, layout_type: e.target.value as any }))}
                                >
                                    {layoutOptions.map((o) => (
                                        <option key={o} value={o}>
                                            {o}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-foreground">Aspect ratio</label>
                                <input
                                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                    value={form.aspect_ratio}
                                    onChange={(e) => {
                                        const v = e.target.value
                                        setForm((p) => ({ ...p, aspect_ratio: v }))
                                        if (errors.aspect_ratio) setFieldError("aspect_ratio", v.trim() ? undefined : "Aspect ratio is required.")
                                    }}
                                    onBlur={() =>
                                        setFieldError("aspect_ratio", parseAspectRatio(form.aspect_ratio).trim() ? undefined : "Aspect ratio is required.")
                                    }
                                    aria-invalid={!!errors.aspect_ratio}
                                />
                                {errors.aspect_ratio ? <p className="text-xs text-rose-600">{errors.aspect_ratio}</p> : null}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-foreground">Text placement</label>
                                <select
                                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                    value={form.text_placement}
                                    onChange={(e) => setForm((p) => ({ ...p, text_placement: e.target.value as any }))}
                                >
                                    {placementOptions.map((o) => (
                                        <option key={o} value={o}>
                                            {o}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-sm font-medium text-foreground">Padding</label>
                                <select
                                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                    value={form.padding_variant}
                                    onChange={(e) => setForm((p) => ({ ...p, padding_variant: e.target.value as any }))}
                                >
                                    {paddingOptions.map((o) => (
                                        <option key={o} value={o}>
                                            {o}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-background p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-foreground">Overlay</p>
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={form.overlay_enabled}
                                        onChange={(e) => setForm((p) => ({ ...p, overlay_enabled: e.target.checked }))}
                                    />
                                    Enabled
                                </label>
                            </div>

                            {form.overlay_enabled ? (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <select
                                        className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                        value={form.overlay_type}
                                        onChange={(e) => setForm((p) => ({ ...p, overlay_type: e.target.value as any }))}
                                    >
                                        <option value="gradient">gradient</option>
                                        <option value="solid">solid</option>
                                    </select>

                                    <div className="grid gap-1">
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="1"
                                            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                            value={form.overlay_opacity}
                                            onChange={(e) => {
                                                const n = Number(e.target.value)
                                                setForm((p) => ({ ...p, overlay_opacity: n }))
                                                if (!Number.isNaN(n) && n >= 0 && n <= 1) setFieldError("overlay_opacity", undefined)
                                            }}
                                            onBlur={() => {
                                                const n = form.overlay_opacity
                                                if (Number.isNaN(n)) setFieldError("overlay_opacity", "Overlay opacity must be a number.")
                                                else if (n < 0 || n > 1) setFieldError("overlay_opacity", "Overlay opacity must be between 0 and 1.")
                                                else setFieldError("overlay_opacity", undefined)
                                            }}
                                            aria-invalid={!!errors.overlay_opacity}
                                        />
                                        {errors.overlay_opacity ? <p className="text-xs text-rose-600">{errors.overlay_opacity}</p> : null}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-2xl border border-border bg-background p-4">
                            <p className="text-sm font-medium text-foreground">Focal point</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div className="grid gap-1">
                                    <input
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        max="1"
                                        className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                        value={form.focal_x}
                                        onChange={(e) => {
                                            const n = Number(e.target.value)
                                            setForm((p) => ({ ...p, focal_x: n }))
                                            if (!Number.isNaN(n) && n >= 0 && n <= 1) setFieldError("focal_x", undefined)
                                        }}
                                        onBlur={() => {
                                            const n = form.focal_x
                                            if (Number.isNaN(n) || n < 0 || n > 1) setFieldError("focal_x", "Focal X must be between 0 and 1.")
                                            else setFieldError("focal_x", undefined)
                                        }}
                                        aria-invalid={!!errors.focal_x}
                                    />
                                    {errors.focal_x ? <p className="text-xs text-rose-600">{errors.focal_x}</p> : null}
                                </div>

                                <div className="grid gap-1">
                                    <input
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        max="1"
                                        className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                        value={form.focal_y}
                                        onChange={(e) => {
                                            const n = Number(e.target.value)
                                            setForm((p) => ({ ...p, focal_y: n }))
                                            if (!Number.isNaN(n) && n >= 0 && n <= 1) setFieldError("focal_y", undefined)
                                        }}
                                        onBlur={() => {
                                            const n = form.focal_y
                                            if (Number.isNaN(n) || n < 0 || n > 1) setFieldError("focal_y", "Focal Y must be between 0 and 1.")
                                            else setFieldError("focal_y", undefined)
                                        }}
                                        aria-invalid={!!errors.focal_y}
                                    />
                                    {errors.focal_y ? <p className="text-xs text-rose-600">{errors.focal_y}</p> : null}
                                </div>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                            />
                            Active
                        </label>

                        <button
                            type="button"
                            onClick={handleSave}
                            className="h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-forest/90"
                        >
                            {editing ? "Save changes" : "Create style"}
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-foreground">Default hero style</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Used when a blog post has a featured image but no specific hero style selected.
                        </p>
                        <select
                            className="mt-4 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                            value={defaultHeroStyleId}
                            onChange={(e) => void handleSetDefault(e.target.value)}
                        >
                            <option value="">(none)</option>
                            {styles
                                .filter((s) => s.is_active)
                                .map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} ({s.key})
                                    </option>
                                ))}
                        </select>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-foreground">Preview</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Uses the placeholder image.</p>
                        <div className="mt-4">
                            <BlogHero
                                imageUrl="/hero-placeholder.svg"
                                title={submitPayload.name || "Sample title"}
                                excerpt="Sample excerpt"
                                showTitle
                                heroStyle={
                                    {
                                        id: editing?.id ?? "preview",
                                        name: submitPayload.name || "Preview",
                                        key: submitPayload.key || "preview",
                                        description: submitPayload.description || "",
                                        layoutType: submitPayload.layout_type,
                                        aspectRatio: submitPayload.aspect_ratio,
                                        overlay: submitPayload.overlay as any,
                                        focalPoint: submitPayload.focal_point as any,
                                        textPlacement: submitPayload.text_placement,
                                        paddingVariant: submitPayload.padding_variant,
                                        isActive: submitPayload.is_active
                                    } as unknown as HeroStyle
                                }
                            />
                        </div>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">All hero styles</h2>
                    <button
                        type="button"
                        onClick={load}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                    >
                        Refresh
                    </button>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {styles.map((style) => (
                        <div key={style.slug} className="rounded-2xl border border-border bg-background p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{style.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {style.key} · {style.layout_type} · {style.aspect_ratio}
                                    </p>
                                    {style.description ? <p className="mt-2 text-xs text-muted-foreground">{style.description}</p> : null}
                                </div>
                                <span
                                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                                        style.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                                    }`}
                                >
                  {style.is_active ? "Active" : "Disabled"}
                </span>
                            </div>

                            <div className="mt-4">
                                <BlogHero
                                    imageUrl="/hero-placeholder.svg"
                                    title="Sample title"
                                    excerpt="Sample excerpt"
                                    showTitle
                                    heroStyle={
                                        {
                                            id: style.id,
                                            name: style.name,
                                            key: style.key,
                                            description: style.description,
                                            layoutType: style.layout_type,
                                            aspectRatio: style.aspect_ratio,
                                            overlay: style.overlay as any,
                                            focalPoint: style.focal_point as any,
                                            textPlacement: style.text_placement,
                                            paddingVariant: style.padding_variant,
                                            isActive: style.is_active
                                        } as unknown as HeroStyle
                                    }
                                />
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleEdit(style)}
                                    className="h-9 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
                                >
                                    Edit
                                </button>
                                {style.is_active ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleDisable(style)}
                                        className="h-9 rounded-full border border-border bg-background px-4 text-sm font-medium text-red-700 hover:bg-red-50"
                                    >
                                        Disable
                                    </button>
                                ) : null}
                                {defaultHeroStyleId === style.id ? (
                                    <span className="inline-flex h-9 items-center rounded-full bg-forest/10 px-4 text-sm font-semibold text-forest">
                    Default
                  </span>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>

                {styles.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                        No hero styles found.
                    </div>
                ) : null}
            </section>
        </main>
    )
}
