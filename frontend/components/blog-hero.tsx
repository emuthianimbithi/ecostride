import Image from "next/image"

type Overlay = {
  Enabled?: boolean
  Type?: "gradient" | "solid"
  Opacity?: number
}

type FocalPoint = {
  x?: number
  y?: number
}

export type HeroStyle = {
  ID: string
  Name: string
  Key: string
  Description: string
  LayoutType: string
  AspectRatio: string
  Overlay?: Overlay | null
  FocalPoint?: FocalPoint | null
  TextPlacement?: "LEFT" | "CENTER" | "RIGHT" | string
  PaddingVariant?: "NONE" | "SM" | "MD" | "LG" | string
  IsActive: boolean
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

  const layoutType = (heroStyle?.LayoutType ?? "FULL_BLEED").toUpperCase()
  const overlay = heroStyle?.Overlay ?? undefined
  const pos = objectPosition(heroStyle?.FocalPoint ?? undefined)
  const aspect = aspectClass(heroStyle?.AspectRatio)

  if (layoutType === "SPLIT_LEFT") {
    return (
      <section className="mx-auto max-w-5xl">
        <div className="grid gap-6 md:grid-cols-2 md:items-center">
          <div className={`relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${aspect}`}>
            <Image src={imageUrl} alt={title} fill className="object-cover" style={{ objectPosition: pos }} />
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
          <Image src={imageUrl} alt={title} fill className="object-cover" style={{ objectPosition: pos }} />
        </div>
      </section>
    )
  }

  const hasOverlay = !!overlay?.Enabled
  const overlayOpacity = typeof overlay?.Opacity === "number" ? overlay.Opacity : 0.45
  const placement = textAlignClass(heroStyle?.TextPlacement)
  const pad = paddingClass(heroStyle?.PaddingVariant)

  return (
    <section className="mx-auto max-w-5xl">
      <div className={`relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${aspect}`}>
        <Image src={imageUrl} alt={title} fill className="object-cover" style={{ objectPosition: pos }} />
        {hasOverlay ? (
          overlay?.Type === "solid" ? (
            <div className="absolute inset-0 bg-black" style={{ opacity: overlayOpacity }} />
          ) : (
            <div
              className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"
              style={{ opacity: overlayOpacity }}
            />
          )
        ) : null}
        {showTitle ? (
          <div className={`absolute inset-0 flex flex-col justify-end ${placement} ${pad}`}>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white drop-shadow md:text-4xl">
              {title}
            </h1>
            {excerpt ? <p className="mt-2 max-w-2xl text-sm text-white/85 md:text-base">{excerpt}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

