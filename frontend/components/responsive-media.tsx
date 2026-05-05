import type { CSSProperties } from "react"
import { cn } from "../lib/cn"

export function isVideoMedia(src?: string | null, mime?: string | null, type?: string | null): boolean {
  if (type?.toLowerCase() === "video") return true
  if (mime?.toLowerCase().startsWith("video/")) return true
  if (!src) return false
  const clean = src.split("?")[0].toLowerCase()
  return clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".mov") || clean.endsWith(".m4v")
}

function toAspectRatio(value?: string | number | null, width?: number | null, height?: number | null) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value)
  if (typeof value === "string") {
    const trimmed = value.trim()
    const ratioMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/)
    if (ratioMatch) {
      const w = Number(ratioMatch[1])
      const h = Number(ratioMatch[2])
      if (w > 0 && h > 0) return `${w} / ${h}`
    }
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric) && numeric > 0) return String(numeric)
  }
  if (width && height && width > 0 && height > 0) return `${width} / ${height}`
  return undefined
}

type ResponsiveMediaProps = {
  src?: string | null
  alt?: string
  mime?: string | null
  type?: string | null
  poster?: string | null
  aspectRatio?: string | number | null
  width?: number | null
  height?: number | null
  className?: string
  mediaClassName?: string
  mediaStyle?: CSSProperties
  fillMode?: "contain" | "cover"
  imageLoading?: "eager" | "lazy"
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  playsInline?: boolean
  controls?: boolean
  preload?: "none" | "metadata" | "auto"
  videoMode?: "ambient" | "player"
}

export function ResponsiveMedia({
  src,
  alt = "",
  mime,
  type,
  poster,
  aspectRatio,
  width,
  height,
  className,
  mediaClassName,
  mediaStyle,
  fillMode = "cover",
  imageLoading = "lazy",
  autoPlay = false,
  muted = false,
  loop = false,
  playsInline = true,
  controls = false,
  preload = "metadata",
  videoMode
}: ResponsiveMediaProps) {
  if (!src) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-sm text-muted-foreground", className)}>
        Media unavailable
      </div>
    )
  }

  const video = isVideoMedia(src, mime, type)
  const ratio = toAspectRatio(aspectRatio, width, height)
  const objectClass = fillMode === "contain" ? "object-contain" : "object-cover"
  const resolvedVideoMode = videoMode ?? (controls ? "player" : "ambient")
  const showControls = video ? resolvedVideoMode === "player" || controls : false
  const shouldAutoPlay = video ? (resolvedVideoMode === "ambient" ? autoPlay : false) : autoPlay
  const shouldMute = video ? (resolvedVideoMode === "ambient" ? muted : false) : muted
  const shouldLoop = video ? (resolvedVideoMode === "ambient" ? loop : false) : loop
  const resolvedPreload = video ? (resolvedVideoMode === "player" ? "auto" : preload) : preload

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-2xl bg-sand-100", className)}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      {video ? (
        <video
          src={src}
          poster={poster ?? undefined}
          controls={showControls}
          autoPlay={shouldAutoPlay}
          muted={shouldMute}
          loop={shouldLoop}
          playsInline={playsInline}
          preload={resolvedPreload}
          style={mediaStyle}
          className={cn("block h-full w-full rounded-[inherit] bg-black", objectClass, mediaClassName)}
        >
          Your browser does not support the video tag.
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={imageLoading}
          style={mediaStyle}
          className={cn("editorial-image block h-full w-full rounded-[inherit]", objectClass, mediaClassName)}
        />
      )}
    </div>
  )
}
