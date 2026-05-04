"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { cn } from "../lib/cn"

type MobileRegisterBarProps = {
  href: string
  label: string
  price: string
  visible: boolean
}

export function MobileRegisterBar({ href, label, price, visible }: MobileRegisterBarProps) {
  const [footerInView, setFooterInView] = useState(false)

  useEffect(() => {
    const footer = document.querySelector("footer")
    if (!footer) return

    const observer = new IntersectionObserver(
      (entries) => setFooterInView(Boolean(entries[0]?.isIntersecting)),
      { threshold: 0.05 }
    )

    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  if (!visible) return null

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-background/96 px-4 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur md:hidden",
        footerInView && "hidden"
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{price}</p>
        </div>
        <Link
          href={href}
          className="button-lift inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-sand-300 px-5 text-sm font-semibold text-forest-900 hover:bg-sand-200"
        >
          Register now
        </Link>
      </div>
    </div>
  )
}
