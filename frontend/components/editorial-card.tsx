import Image from "next/image"
import Link from "next/link"
import { cn } from "../lib/cn"
import { Eyebrow } from "./eyebrow"

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
  return (
    <Link href={href} className={cn("group block space-y-4", className)}>
      <div className="relative aspect-[4/5] overflow-hidden bg-sand-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            className="editorial-image object-cover transition duration-500 group-hover:scale-[1.03]"
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
