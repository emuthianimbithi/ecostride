"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

export type GalleryItem = {
  url: string
  alt_text: string
  mime: string
  type?: string
}

function isVideo(item: GalleryItem): boolean {
  if (item.type === "video") return true
  if (item.mime?.startsWith("video/")) return true
  const lower = item.url.split("?")[0].toLowerCase()
  return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov") || lower.endsWith(".m4v")
}

export function GalleryGrid({ items, fallbackAlt }: { items: GalleryItem[]; fallbackAlt: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const close = useCallback(() => setOpenIndex(null), [])
  const next = useCallback(() => {
    setOpenIndex((i) => (i === null ? null : (i + 1) % items.length))
  }, [items.length])
  const prev = useCallback(() => {
    setOpenIndex((i) => (i === null ? null : (i - 1 + items.length) % items.length))
  }, [items.length])

  useEffect(() => {
    if (openIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowRight") next()
      else if (e.key === "ArrowLeft") prev()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [openIndex, close, next, prev])

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
        No photos uploaded yet.
      </div>
    )
  }

  return (
    <>
      {/* Masonry-style: items keep their natural aspect ratio, no forced cropping. */}
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {items.map((item, idx) => {
          const video = isVideo(item)
          return (
            <button
              key={`${item.url}-${idx}`}
              type="button"
              onClick={() => setOpenIndex(idx)}
              className="mb-4 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-border bg-card p-2 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-forest"
            >
              {video ? (
                <video
                  src={item.url}
                  className="block h-auto w-full rounded-xl"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.alt_text || fallbackAlt}
                  className="block h-auto w-full rounded-xl"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
                  Media unavailable
                </div>
              )}
              {item.alt_text && <p className="mt-2 text-xs text-muted-foreground">{item.alt_text}</p>}
            </button>
          )
        })}
      </div>

      {openIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                aria-label="Previous"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                aria-label="Next"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <div className="mx-auto flex max-h-[90vh] w-full max-w-[95vw] flex-col items-center justify-center gap-3 px-12">
            {(() => {
              const item = items[openIndex]
              const video = isVideo(item)
              if (video) {
                return (
                  <video
                    key={item.url}
                    src={item.url}
                    className="max-h-[85vh] w-auto max-w-full rounded-xl"
                    controls
                    autoPlay
                    playsInline
                  />
                )
              }
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.alt_text || fallbackAlt}
                  className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain"
                />
              )
            })()}
            {items[openIndex].alt_text && (
              <p className="text-center text-sm text-white/85">{items[openIndex].alt_text}</p>
            )}
            <p className="text-xs text-white/60">
              {openIndex + 1} / {items.length}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
