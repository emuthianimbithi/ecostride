import Link from "next/link"
import { cn } from "../lib/cn"
import { Eyebrow } from "./eyebrow"
import { ResponsiveMedia, isVideoMedia } from "./responsive-media"

type EditorialCardProps = {
  href: string
  imageUrl?: string | null
  imageAlt: string
  eyebrow: string
  title: string
  meta?: string
  className?: string
}

export function EditorialCard({
  href,
  imageUrl,
  imageAlt,
  eyebrow,
  title,
  meta,
  className
}: EditorialCardProps) {
  const video = isVideoMedia(imageUrl)

  if (video && imageUrl) {
    return (
      <article className={cn("space-y-4", className)}>
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand-100">
          <ResponsiveMedia
            src={imageUrl}
            alt={imageAlt}
            className="h-full"
            mediaClassName="h-full w-full"
            fillMode="contain"
            controls
            videoMode="player"
            preload="auto"
          />
        </div>
        <div className="space-y-2">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Link href={href} className="group block">
            <h3 className="font-display text-h3 text-foreground transition-colors group-hover:text-forest-700">
              {title}
            </h3>
          </Link>
          {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
        </div>
      </article>
    )
  }

  return (
    <Link href={href} className={cn("group block space-y-4", className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand-100">
        {imageUrl ? (
          <ResponsiveMedia
            src={imageUrl}
            alt={imageAlt}
            className="h-full"
            mediaClassName="transition duration-500 group-hover:scale-[1.03]"
            fillMode="cover"
          />
        ) : (
          <div className="editorial-placeholder flex h-full items-center justify-center text-sm text-sand-50/92">
            {title}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="font-display text-h3 text-foreground transition-colors group-hover:text-forest-700">
          {title}
        </h3>
        {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
      </div>
    </Link>
  )
}
