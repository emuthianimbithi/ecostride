"use client"

import { useEffect, useMemo, useState } from "react"
import { UploadCloud } from "lucide-react"
import { apiFetch, apiGet } from "../../../../lib/api-client"
import { useToast } from "../../../../components/toast"
import { DataState } from "../../../../components/data-state"
import { compressVideo, isCompressibleVideo } from "../../../../lib/compress-video"

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

export default function MediaLibraryPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [altPrefix, setAltPrefix] = useState("")
  const [saving, setSaving] = useState(false)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)

  const loadMedia = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<MediaItem[]>("/admin/media")
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMedia()
  }, [])

  const onDropFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const next = Array.from(incoming).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"))
    setFiles(next)
  }

  const uploadAll = async () => {
    if (files.length === 0) {
      toast({ title: "No files selected", description: "Pick files to upload.", variant: "destructive" })
      return
    }
    if (!altPrefix.trim()) {
      toast({ title: "Alt text required", description: "Enter an alt text prefix for accessibility.", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const original = files[i]
        let toSend: File = original
        if (isCompressibleVideo(original)) {
          setProgressLabel(`Compressing ${i + 1}/${files.length}: ${original.name} 0%`)
          try {
            toSend = await compressVideo(original, {
              onProgress: (p) => {
                setProgressLabel(`Compressing ${i + 1}/${files.length}: ${original.name} ${Math.round(p * 100)}%`)
              }
            })
          } catch (compressErr) {
            console.error("video compression failed, uploading original", compressErr)
            toSend = original
          }
        }
        setProgressLabel(`Uploading ${i + 1}/${files.length}: ${toSend.name}`)
        const fd = new FormData()
        fd.append("file", toSend)
        fd.append("alt_text", `${altPrefix.trim()} (${i + 1}/${files.length})`)
        await apiFetch("/admin/media/upload", { method: "POST", body: fd })
      }
      toast({ title: "Upload complete", description: `${files.length} file(s) uploaded.`, variant: "success" })
      setFiles([])
      setAltPrefix("")
      await loadMedia()
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" })
    } finally {
      setProgressLabel(null)
      setSaving(false)
    }
  }


  const queueSummary = useMemo(() => {
    if (files.length === 0) return "No pending uploads."
    const totalMb = files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)
    return `${files.length} file(s) queued • ${totalMb.toFixed(1)} MB`
  }, [files])

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Media Library</h1>
        <p className="text-sm text-slate-600">
          Bulk upload assets, enforce alt text, and attach media to events/posts/galleries.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            onDropFiles(e.dataTransfer.files)
          }}
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"
        >
          <UploadCloud className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-2 text-sm text-slate-700">Drag and drop images/videos here, or choose files.</p>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm,application/pdf"
            onChange={(e) => onDropFiles(e.target.files)}
            className="mt-3"
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={altPrefix}
            onChange={(e) => setAltPrefix(e.target.value)}
            placeholder="Alt text prefix (required)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            onClick={uploadAll}
            disabled={saving}
            className="rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Uploading..." : "Upload queued files"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{queueSummary}</p>
        {progressLabel && <p className="mt-1 text-xs font-medium text-forest">{progressLabel}</p>}
        <p className="mt-1 text-xs text-slate-500">
          Upload pipeline generates responsive variants server-side where configured (400/800/1600w) and should produce poster frames for video when backend support is enabled.
        </p>
      </section>

      <DataState loading={loading} error={error} isEmpty={items.length === 0} emptyView={<p className="text-sm text-slate-500">No media yet.</p>}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">URL / Path</th>
                <th className="px-3 py-2">Alt text</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.slug} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 text-slate-600">{item.type}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{item.url || item.path || "-"}</td>
                  <td className="px-3 py-2 text-slate-600">{item.alt_text || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </DataState>
    </main>
  )
}
