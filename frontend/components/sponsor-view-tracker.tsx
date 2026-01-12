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

    const url = new URL(base)
    const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname
    url.pathname = `${basePath}/public/sponsors/${slug}/view`
    if (page) {
      url.searchParams.set("page", page)
    }

    fetch(url.toString(), { method: "POST" }).catch(() => {})
  }, [slug, page])

  return null
}
