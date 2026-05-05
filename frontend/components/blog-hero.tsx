import { ResponsiveMedia, isVideoMedia } from "./responsive-media"

function HeroMedia({ url, alt, pos }: { url: string; alt: string; pos: string }) {
  const video = isVideoMedia(url)
  return (
    <ResponsiveMedia
      src={url}
      alt={alt}
      className="absolute inset-0 h-full w-full bg-transparent"
      mediaClassName="h-full w-full"
      mediaStyle={{ objectPosition: pos }}
      fillMode={video ? "contain" : "cover"}
      autoPlay={video}
      muted={video}
      loop={video}
      playsInline
      controls={video}
      videoMode={video ? "player" : "ambient"}
      preload={video ? "auto" : "metadata"}
    />
  )
}

type Overlay = {
  enabled?: boolean
  type?: "gradient" | "solid"
  opacity?: number
}

type FocalPoint = {
  x?: number
  y?: number
}

export type HeroStyle = {
  id: string
  slug?: string
  name: string
  key: string
  description?: string
  layout_type: string
  aspect_ratio: string
  overlay?: Overlay | null
  focal_point?: FocalPoint | null
  text_placement?: "LEFT" | "CENTER" | "RIGHT" | string
  padding_variant?: "NONE" | "SM" | "MD" | "LG" | string
  is_active: boolean
}

function aspectClass(aspectRatio: string | undefined) {
  const value = (aspectRatio ?? "").trim()
  const match = value.match(/^(\d+)\s*:\s*(\d+)$/)
  if (!match) return "aspect-[21/9]"
  return `aspect-[${match[1]}/${match[2]}]`
}

function objectPosition(focalPoint: FocalPoint | null | undefined) {
  const x = typeof focalPoint?.x === "number" ? focalPoint.x : 0.5
  const y = typeof focalPoint?.y === "number" ? focalPoint.y : 0.5
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  return `${Math.round(clamp(x) * 100)}% ${Math.round(clamp(y) * 100)}%`
}

function textAlignClass(placement: string | undefined) {
  switch ((placement ?? "").toUpperCase()) {
    case "LEFT":
      return "items-start text-left"
    case "RIGHT":
      return "items-end text-right"
    default:
      return "items-center text-center"
  }
}

function paddingClass(variant: string | undefined) {
  switch ((variant ?? "").toUpperCase()) {
    case "SM":
      return "p-4 md:p-6"
    case "MD":
      return "p-6 md:p-8"
    case "LG":
      return "p-8 md:p-12"
    default:
      return "p-0"
  }
}

export function BlogHero(props: {
  imageUrl: string
  title: string
  excerpt?: string
  showTitle?: boolean
  heroStyle?: HeroStyle | null
}) {
  const { imageUrl, title, excerpt, showTitle = true, heroStyle } = props

  const layoutType = (heroStyle?.layout_type ?? "FULL_BLEED").toUpperCase()
  const overlay = heroStyle?.overlay ?? undefined
  const pos = objectPosition(heroStyle?.focal_point ?? undefined)
  const aspect = aspectClass(heroStyle?.aspect_ratio)

  if (layoutType === "SPLIT_LEFT") {
    return (
      <section className="mx-auto max-w-5xl">
        <div className="grid gap-6 md:grid-cols-2 md:items-center">
          <div className={`relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${aspect}`}>
            <HeroMedia url={imageUrl} alt={title} pos={pos} />
          </div>
          <div className="space-y-3">
            {showTitle && <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h1>}
            {excerpt ? <p className="text-sm text-muted-foreground md:text-base">{excerpt}</p> : null}
          </div>
        </div>
      </section>
    )
  }

  if (layoutType === "CONTAINED_CARD") {
    return (
      <section className="mx-auto max-w-5xl space-y-5">
        {showTitle && (
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h1>
            {excerpt ? <p className="text-sm text-muted-foreground md:text-base">{excerpt}</p> : null}
          </div>
        )}
        <div className={`relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${aspect}`}>
          <HeroMedia url={imageUrl} alt={title} pos={pos} />
        </div>
      </section>
    )
  }

  const hasOverlay = !!overlay?.enabled
  const overlayOpacity = typeof overlay?.opacity === "number" ? overlay.opacity : 0.45
  const placement = textAlignClass(heroStyle?.text_placement)
  const pad = paddingClass(heroStyle?.padding_variant)
  const video = isVideoMedia(imageUrl)

  return (
    <section className="mx-auto max-w-5xl">
      <div className={`relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${aspect}`}>
        <HeroMedia url={imageUrl} alt={title} pos={pos} />
        {!video && hasOverlay ? (
          overlay?.type === "solid" ? (
            <div className="absolute inset-0 bg-black" style={{ opacity: overlayOpacity }} />
          ) : (
            <div
              className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"
              style={{ opacity: overlayOpacity }}
            />
          )
        ) : null}
        {showTitle && !video ? (
          <div className={`absolute inset-0 flex flex-col justify-end ${placement} ${pad}`}>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white drop-shadow md:text-4xl">
              {title}
            </h1>
            {excerpt ? <p className="mt-2 max-w-2xl text-sm text-white/85 md:text-base">{excerpt}</p> : null}
          </div>
        ) : null}
      </div>
      {showTitle && video ? (
        <div className="mt-5 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h1>
          {excerpt ? <p className="text-sm text-muted-foreground md:text-base">{excerpt}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
