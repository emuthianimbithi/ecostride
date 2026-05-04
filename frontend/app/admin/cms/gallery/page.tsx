"use client"

import { useEffect, useMemo, useState } from "react"
import { Trash2, Plus, ChevronDown, ChevronRight, ArrowUp, ArrowDown, X } from "lucide-react"
import { apiDelete, apiGet, apiPost, apiPut } from "../../../../lib/api-client"
import { useToast } from "../../../../components/toast"
import { toastApiError } from "../../../../lib/toast-api-error"

type Album = {
  id: string
  slug: string
  title: string
  url_slug: string
  description: string
  media_count: number
}

type AlbumMedia = {
  media_id: number
  url: string
  path: string
  type: string
  mime: string
  alt_text: string
  sort_order: number
}

type AlbumDetail = Album & { media: AlbumMedia[] }

type MediaItem = {
  ID: number
  slug: string
  type: string
  url: string
  mime: string
  alt_text: string
}

const isVideoMime = (mime: string) => mime.startsWith("video/")

function isValidSlug(s: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}

export default function AdminGalleryPage() {
  const { toast } = useToast()
  const [albums, setAlbums] = useState<Album[]>([])
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [openDetail, setOpenDetail] = useState<AlbumDetail | null>(null)
  const [editing, setEditing] = useState<Album | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState({ title: "", url_slug: "", description: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const loadAll = async () => {
    setLoading(true)
    try {
      const [a, m] = await Promise.all([
        apiGet<Album[]>("/admin/gallery/albums"),
        apiGet<MediaItem[]>("/admin/media")
      ])
      setAlbums(Array.isArray(a) ? a : [])
      setMedia(Array.isArray(m) ? m : [])
    } catch (err) {
      toastApiError(toast, err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  const loadOpen = async (slug: string) => {
    try {
      const detail = await apiGet<AlbumDetail>(`/admin/gallery/albums/${slug}`)
      setOpenDetail(detail)
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const validateForm = () => {
    const next: Record<string, string> = {}
    if (!form.title.trim()) next.title = "Title is required."
    if (!form.url_slug.trim()) next.url_slug = "URL slug is required."
    else if (!isValidSlug(form.url_slug.trim())) next.url_slug = "lowercase letters, numbers, hyphens only."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const resetForm = () => {
    setForm({ title: "", url_slug: "", description: "" })
    setEditing(null)
    setShowCreateForm(false)
    setErrors({})
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    const payload = {
      title: form.title.trim(),
      url_slug: form.url_slug.trim(),
      description: form.description.trim()
    }
    try {
      if (editing) {
        await apiPut(`/admin/gallery/albums/${editing.slug}`, payload)
        toast({ title: "Album updated", variant: "success" })
      } else {
        await apiPost("/admin/gallery/albums", payload)
        toast({ title: "Album created", variant: "success" })
      }
      resetForm()
      await loadAll()
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const handleDelete = async (album: Album) => {
    if (!confirm(`Delete album "${album.title}"? Media files are NOT deleted, only the album is removed.`)) return
    try {
      await apiDelete(`/admin/gallery/albums/${album.slug}`)
      toast({ title: "Album deleted", variant: "success" })
      if (openSlug === album.slug) {
        setOpenSlug(null)
        setOpenDetail(null)
      }
      await loadAll()
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const handleEdit = (album: Album) => {
    setEditing(album)
    setShowCreateForm(true)
    setForm({ title: album.title, url_slug: album.url_slug, description: album.description })
    setErrors({})
  }

  const toggleOpen = async (album: Album) => {
    if (openSlug === album.slug) {
      setOpenSlug(null)
      setOpenDetail(null)
      return
    }
    setOpenSlug(album.slug)
    setOpenDetail(null)
    await loadOpen(album.slug)
  }

  // ------- Media management within an open album -------
  const addMediaToAlbum = (mediaId: number) => {
    if (!openDetail) return
    if (openDetail.media.some((m) => m.media_id === mediaId)) return
    const found = media.find((m) => m.ID === mediaId)
    if (!found) return
    const newItem: AlbumMedia = {
      media_id: found.ID,
      url: found.url,
      path: "",
      type: found.type,
      mime: found.mime,
      alt_text: found.alt_text,
      sort_order: openDetail.media.length
    }
    setOpenDetail({ ...openDetail, media: [...openDetail.media, newItem] })
  }

  const removeFromAlbum = (mediaId: number) => {
    if (!openDetail) return
    setOpenDetail({ ...openDetail, media: openDetail.media.filter((m) => m.media_id !== mediaId) })
  }

  const moveItem = (idx: number, dir: -1 | 1) => {
    if (!openDetail) return
    const next = [...openDetail.media]
    const tgt = idx + dir
    if (tgt < 0 || tgt >= next.length) return
    ;[next[idx], next[tgt]] = [next[tgt], next[idx]]
    setOpenDetail({ ...openDetail, media: next })
  }

  const saveMediaOrder = async () => {
    if (!openDetail) return
    try {
      await apiPut(`/admin/gallery/albums/${openDetail.slug}/media`, {
        media_ids: openDetail.media.map((m) => m.media_id)
      })
      toast({ title: "Album media saved", variant: "success" })
      await loadAll()
      await loadOpen(openDetail.slug)
    } catch (err) {
      toastApiError(toast, err)
    }
  }

  const availableMedia = useMemo(() => {
    if (!openDetail) return media
    const inAlbum = new Set(openDetail.media.map((m) => m.media_id))
    return media.filter((m) => !inAlbum.has(m.ID))
  }, [media, openDetail])

  return (
    <main className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest">Gallery Albums</h1>
          <p className="text-sm text-slate-600">Group media into public albums and reorder them.</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowCreateForm(true)
          }}
          className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> New album
        </button>
      </div>

      {showCreateForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">{editing ? "Edit album" : "New album"}</h2>
            <button onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Malindi 2026 Cleanup"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">URL slug</label>
              <input
                value={form.url_slug}
                onChange={(e) => setForm({ ...form, url_slug: e.target.value })}
                placeholder="e.g. malindi-2026-cleanup"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              {errors.url_slug && <p className="mt-1 text-xs text-rose-600">{errors.url_slug}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-600">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSubmit} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white">
              {editing ? "Save changes" : "Create album"}
            </button>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : albums.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No albums yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {albums.map((album) => (
              <li key={album.slug}>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button onClick={() => toggleOpen(album)} className="flex flex-1 items-center gap-2 text-left">
                    {openSlug === album.slug ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800">{album.title}</div>
                      <div className="text-xs text-slate-500">
                        /{album.url_slug} • {album.media_count} item{album.media_count === 1 ? "" : "s"}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleEdit(album)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleDelete(album)}
                    className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {openSlug === album.slug && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                    {!openDetail ? (
                      <p className="text-sm text-slate-500">Loading album…</p>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700">In album ({openDetail.media.length})</h3>
                          {openDetail.media.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-500">Empty. Add media from the list below.</p>
                          ) : (
                            <ul className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                              {openDetail.media.map((item, idx) => (
                                <li
                                  key={item.media_id}
                                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"
                                >
                                  <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded bg-slate-100">
                                    {isVideoMime(item.mime) ? (
                                      <video src={item.url} className="h-full w-full object-cover" muted />
                                    ) : (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={item.url} alt={item.alt_text} className="h-full w-full object-cover" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs text-slate-700">{item.alt_text || `#${item.media_id}`}</div>
                                    <div className="text-xs text-slate-400">{item.mime}</div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => moveItem(idx, -1)}
                                      disabled={idx === 0}
                                      className="rounded p-1 text-slate-500 disabled:opacity-30 hover:bg-slate-100"
                                    >
                                      <ArrowUp className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => moveItem(idx, 1)}
                                      disabled={idx === openDetail.media.length - 1}
                                      className="rounded p-1 text-slate-500 disabled:opacity-30 hover:bg-slate-100"
                                    >
                                      <ArrowDown className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => removeFromAlbum(item.media_id)}
                                      className="rounded p-1 text-rose-500 hover:bg-rose-50"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                          <button
                            onClick={() => void saveMediaOrder()}
                            className="mt-3 rounded-full bg-forest px-4 py-2 text-xs font-semibold text-white"
                          >
                            Save album media
                          </button>
                        </div>

                        <div>
                          <h3 className="text-sm font-semibold text-slate-700">Add from media library ({availableMedia.length})</h3>
                          {availableMedia.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-500">All media is in this album already.</p>
                          ) : (
                            <ul className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                              {availableMedia.map((item) => (
                                <li
                                  key={item.ID}
                                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"
                                >
                                  <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded bg-slate-100">
                                    {isVideoMime(item.mime) ? (
                                      <video src={item.url} className="h-full w-full object-cover" muted />
                                    ) : (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={item.url} alt={item.alt_text} className="h-full w-full object-cover" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs text-slate-700">{item.alt_text || `#${item.ID}`}</div>
                                    <div className="text-xs text-slate-400">{item.mime}</div>
                                  </div>
                                  <button
                                    onClick={() => addMediaToAlbum(item.ID)}
                                    className="rounded-full border border-forest/40 px-2 py-1 text-xs font-semibold text-forest hover:bg-forest/5"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
