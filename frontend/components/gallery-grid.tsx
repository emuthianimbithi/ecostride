"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Download, Expand, X } from "lucide-react"
import { CopyLinkButton } from "./copy-link-button"
import { ResponsiveMedia, isVideoMedia } from "./responsive-media"

export type GalleryItem = {
  url: string
  alt_text: string
  mime: string
  type?: string
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
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {items.map((item, idx) => {
          const video = isVideoMedia(item.url, item.mime, item.type)

          return (
            <article
              key={`${item.url}-${idx}`}
              id={`media-${idx + 1}`}
              className="mb-4 break-inside-avoid overflow-hidden border border-sand-200 bg-background p-2 text-left shadow-sm"
            >
              {video ? (
                <div className="space-y-2">
                  <ResponsiveMedia
                    src={item.url}
                    alt={item.alt_text || fallbackAlt}
                    mime={item.mime}
                    type={item.type}
                    fillMode="contain"
                    controls
                    preload="metadata"
                    className="max-h-[32rem] bg-black"
                    mediaClassName="max-h-[32rem]"
                  />
                  <div className="flex items-center justify-between gap-3">
                    {item.alt_text ? <p className="text-xs text-muted-foreground">{item.alt_text}</p> : <span />}
                    <button
                      type="button"
                      onClick={() => setOpenIndex(idx)}
                      className="inline-flex items-center gap-2 rounded-full border border-sand-300 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-sand-50"
                    >
                      <Expand className="h-3.5 w-3.5" />
                      Expand
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenIndex(idx)}
                  className="block w-full text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sand-400"
                >
                  <ResponsiveMedia
                    src={item.url}
                    alt={item.alt_text || fallbackAlt}
                    mime={item.mime}
                    type={item.type}
                    className="h-auto"
                    mediaClassName="h-auto"
                    fillMode="cover"
                  />
                  {item.alt_text && <p className="mt-2 text-xs text-muted-foreground">{item.alt_text}</p>}
                </button>
              )}
            </article>
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
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <a
              href={items[openIndex].url}
              download
              target="_blank"
              rel="noreferrer"
              className="button-lift inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
            <CopyLinkButton
              value={`${window.location.origin}${window.location.pathname}#media-${openIndex + 1}`}
              label="Share"
              className="border-white/15 bg-white/10 text-white hover:bg-white/20"
            />
            <button
              type="button"
              onClick={close}
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
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
              const video = isVideoMedia(item.url, item.mime, item.type)
              if (video) {
                return (
                  <ResponsiveMedia
                    key={item.url}
                    src={item.url}
                    alt={item.alt_text || fallbackAlt}
                    mime={item.mime}
                    type={item.type}
                    className="max-h-[85vh] max-w-full rounded-xl bg-black"
                    mediaClassName="max-h-[85vh] rounded-xl"
                    fillMode="contain"
                    controls
                    autoPlay
                    playsInline
                  />
                )
              }
              return (
                <ResponsiveMedia
                  src={item.url}
                  alt={item.alt_text || fallbackAlt}
                  mime={item.mime}
                  type={item.type}
                  className="max-h-[85vh] max-w-full rounded-xl"
                  mediaClassName="max-h-[85vh] rounded-xl"
                  fillMode="contain"
                />
              )
            })()}
            {items[openIndex].alt_text && (
              <p className="text-center text-sm text-white/85">{items[openIndex].alt_text}</p>
            )}
            <p className="text-xs tracking-[0.16em] text-white/60">← → Esc</p>
            <p className="text-xs text-white/60">
              {openIndex + 1} / {items.length}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
