"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { toastApiError } from "../../../../lib/toast-api-error"
import { useToast } from "../../../../components/toast"
import { BlogHero, type HeroStyle } from "../../../../components/blog-hero"

type DefaultSettingResponse = { heroStyleId: string }

const layoutOptions = ["FULL_BLEED", "FULL_BLEED_GRADIENT", "CONTAINED_CARD", "SPLIT_LEFT"] as const
const paddingOptions = ["NONE", "SM", "MD", "LG"] as const
const placementOptions = ["LEFT", "CENTER", "RIGHT"] as const

function parseAspectRatio(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return "21:9"
  return trimmed
}

export default function Page() {
  const { toast } = useToast()
  const [styles, setStyles] = useState<HeroStyle[]>([])
  const [defaultHeroStyleId, setDefaultHeroStyleId] = useState<string>("")
  const [status, setStatus] = useState<string | null>(null)
  const [editing, setEditing] = useState<HeroStyle | null>(null)

  const [form, setForm] = useState({
    name: "",
    key: "",
    description: "",
    layoutType: "FULL_BLEED" as (typeof layoutOptions)[number],
    aspectRatio: "21:9",
    overlayEnabled: false,
    overlayType: "gradient" as "gradient" | "solid",
    overlayOpacity: 0.45,
    focalX: 0.5,
    focalY: 0.5,
    textPlacement: "LEFT" as (typeof placementOptions)[number],
    paddingVariant: "MD" as (typeof paddingOptions)[number],
    isActive: true
  })

  const load = async () => {
    try {
      const [s, def] = await Promise.all([
        apiGet<HeroStyle[]>("/admin/hero-styles"),
        apiGet<DefaultSettingResponse>("/admin/settings/default-hero-style")
      ])
      setStyles(s)
      setDefaultHeroStyleId(def.heroStyleId || "")
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const resetForm = () => {
    setEditing(null)
    setForm({
      name: "",
      key: "",
      description: "",
      layoutType: "FULL_BLEED",
      aspectRatio: "21:9",
      overlayEnabled: false,
      overlayType: "gradient",
      overlayOpacity: 0.45,
      focalX: 0.5,
      focalY: 0.5,
      textPlacement: "LEFT",
      paddingVariant: "MD",
      isActive: true
    })
  }

  const submitPayload = useMemo(() => {
    const overlay = form.overlayEnabled
      ? { enabled: true, type: form.overlayType, opacity: form.overlayOpacity }
      : { enabled: false }
    const focalPoint = { x: form.focalX, y: form.focalY }
    return {
      name: form.name.trim(),
      key: form.key.trim(),
      description: form.description.trim(),
      layoutType: form.layoutType,
      aspectRatio: parseAspectRatio(form.aspectRatio),
      overlay,
      focalPoint,
      textPlacement: form.textPlacement,
      paddingVariant: form.paddingVariant,
      isActive: form.isActive
    }
  }, [form])

  const handleEdit = (style: HeroStyle) => {
    setEditing(style)
    setStatus(null)
    const overlay = (style.Overlay ?? {}) as any
    const focal = (style.FocalPoint ?? {}) as any
    setForm({
      name: style.Name ?? "",
      key: style.Key ?? "",
      description: style.Description ?? "",
      layoutType: (layoutOptions.includes(style.LayoutType as any) ? (style.LayoutType as any) : "FULL_BLEED") as any,
      aspectRatio: style.AspectRatio ?? "21:9",
      overlayEnabled: !!overlay.enabled,
      overlayType: overlay.type === "solid" ? "solid" : "gradient",
      overlayOpacity: typeof overlay.opacity === "number" ? overlay.opacity : 0.45,
      focalX: typeof focal.x === "number" ? focal.x : 0.5,
      focalY: typeof focal.y === "number" ? focal.y : 0.5,
      textPlacement: (placementOptions.includes(style.TextPlacement as any) ? (style.TextPlacement as any) : "LEFT") as any,
      paddingVariant: (paddingOptions.includes(style.PaddingVariant as any) ? (style.PaddingVariant as any) : "MD") as any,
      isActive: style.IsActive ?? true
    })
  }

  const handleSave = async () => {
    setStatus(null)
    if (!submitPayload.name || !submitPayload.key) {
      toast({ title: "Name and key are required.", variant: "destructive" })
      return
    }
    try {
      if (editing) {
        await apiPut(`/admin/hero-styles/${editing.ID}`, submitPayload)
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

  const handleDisable = async (style: HeroStyle) => {
    setStatus(null)
    try {
      await apiPost(`/admin/hero-styles/${style.ID}/disable`, {})
      setStatus("Hero style disabled.")
      await load()
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const handleSetDefault = async (heroStyleId: string) => {
    setDefaultHeroStyleId(heroStyleId)
    try {
      await apiPut("/admin/settings/default-hero-style", { heroStyleId })
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
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Key</label>
              <input
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="machine_key"
                value={form.key}
                onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
              />
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
                  value={form.layoutType}
                  onChange={(e) => setForm((p) => ({ ...p, layoutType: e.target.value as any }))}
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
                  value={form.aspectRatio}
                  onChange={(e) => setForm((p) => ({ ...p, aspectRatio: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-foreground">Text placement</label>
                <select
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  value={form.textPlacement}
                  onChange={(e) => setForm((p) => ({ ...p, textPlacement: e.target.value as any }))}
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
                  value={form.paddingVariant}
                  onChange={(e) => setForm((p) => ({ ...p, paddingVariant: e.target.value as any }))}
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
                    checked={form.overlayEnabled}
                    onChange={(e) => setForm((p) => ({ ...p, overlayEnabled: e.target.checked }))}
                  />
                  Enabled
                </label>
              </div>
              {form.overlayEnabled ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <select
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                    value={form.overlayType}
                    onChange={(e) => setForm((p) => ({ ...p, overlayType: e.target.value as any }))}
                  >
                    <option value="gradient">gradient</option>
                    <option value="solid">solid</option>
                  </select>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                    value={form.overlayOpacity}
                    onChange={(e) => setForm((p) => ({ ...p, overlayOpacity: Number(e.target.value) }))}
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">Focal point</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  value={form.focalX}
                  onChange={(e) => setForm((p) => ({ ...p, focalX: Number(e.target.value) }))}
                />
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  value={form.focalY}
                  onChange={(e) => setForm((p) => ({ ...p, focalY: Number(e.target.value) }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
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
                .filter((s) => s.IsActive)
                .map((s) => (
                  <option key={s.ID} value={s.ID}>
                    {s.Name} ({s.Key})
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
                        id: editing?.ID ?? "preview",
                        name: submitPayload.name || "Preview",
                        key: submitPayload.key || "preview",
                        description: submitPayload.description || "",
                        layoutType: submitPayload.layoutType,
                        aspectRatio: submitPayload.aspectRatio,
                        overlay: submitPayload.overlay as any,
                        focalPoint: submitPayload.focalPoint as any,
                        textPlacement: submitPayload.textPlacement,
                        paddingVariant: submitPayload.paddingVariant,
                        isActive: submitPayload.isActive
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
            <div key={style.ID} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{style.Name}</p>
                  <p className="text-xs text-muted-foreground">
                    {style.Key} · {style.LayoutType} · {style.AspectRatio}
                  </p>
                  {style.Description ? <p className="mt-2 text-xs text-muted-foreground">{style.Description}</p> : null}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    style.IsActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {style.IsActive ? "Active" : "Disabled"}
                </span>
              </div>

              <div className="mt-4">
                <BlogHero imageUrl="/hero-placeholder.svg" title="Sample title" excerpt="Sample excerpt" showTitle heroStyle={style} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleEdit(style)}
                  className="h-9 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
                >
                  Edit
                </button>
                {style.IsActive ? (
                  <button
                    type="button"
                    onClick={() => void handleDisable(style)}
                    className="h-9 rounded-full border border-border bg-background px-4 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Disable
                  </button>
                ) : null}
                {defaultHeroStyleId === style.ID ? (
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
