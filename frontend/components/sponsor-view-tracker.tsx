"use client"

import { useEffect } from "react"

type Props = {
  slug: string
  page?: string
}

export default function SponsorViewTracker({ slug, page = "SPONSOR_PAGE" }: Props) {
  useEffect(() => {
    if (!slug) return

    const base = process.env.NEXT_PUBLIC_API_BASE
    if (!base) return

    // NEXT_PUBLIC_API_BASE is commonly a same-origin path (for example `/api/v1`).
    // Resolve it against the current site so the tracker works with relative bases too.
    const url = new URL(base, window.location.origin)
    const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname
    url.pathname = `${basePath}/public/sponsors/${encodeURIComponent(slug)}/view`
    if (page) {
      url.searchParams.set("page", page)
    }

    fetch(url.toString(), { method: "POST" }).catch(() => {})
  }, [slug, page])

  return null
}
