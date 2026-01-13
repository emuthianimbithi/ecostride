"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react"
import { EcoStrideLogo } from "./ecostride-logo"
import { apiGet } from "../lib/api-client"

const quickLinks = [
    { label: "Events", href: "/events" },
    { label: "Results", href: "/results" },
    { label: "Support", href: "/support" },
    { label: "Blog", href: "/blog" },
    { label: "Gallery", href: "/gallery" },
    { label: "Sponsors", href: "/sponsors" }
]

type CMSPage = {
    slug: string
    url_slug: string
    title: string
    status: string
}

export function SiteFooter() {
    const [pages, setPages] = useState<CMSPage[]>([])

    useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const data = await apiGet<any[]>("/public/pages?status=published")
                console.log("Fetched CMS pages for footer:", data)
                const published = (Array.isArray(data) ? data : [])
                    .filter((p) => String(p?.status ?? "").toLowerCase() === "published")
                    .map((p) => ({
                        slug: String(p.slug),
                        url_slug: String(p.url_slug ?? ""),
                        title: String(p.title ?? ""),
                        status: String(p.status ?? "")
                    }))
                    .filter((p) => p.slug && p.url_slug && p.title)

                if (mounted) setPages(published)
            } catch {
                // footer should be resilient; ignore failures
            }
        })()
        return () => {
            mounted = false
        }
    }, [])

    const pageLinks = useMemo(
        () => pages.map((p) => ({ key: p.slug, label: p.title, href: `/${p.url_slug}` })),
        [pages]
    )

    return (
        <footer className="border-t border-border bg-background py-12">
            <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6 md:px-8">
                <div className="grid gap-8 md:grid-cols-3">
                    <div className="space-y-3">
                        <EcoStrideLogo textClassName="text-lg" />
                        <p className="text-sm text-muted-foreground">Community-led races, learning, and coastal cleanups in Malindi.</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            Malindi, Kenya
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            hello@ecostride.org
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            +254 700 000 000
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Quick links</div>
                        <div className="grid gap-2 text-sm text-muted-foreground">
                            {quickLinks.map((link) => (
                                <Link key={link.href} href={link.href} className="transition hover:text-foreground">
                                    {link.label}
                                </Link>
                            ))}

                            {/* ✅ CMS pages pulled from /admin/pages (published only) */}
                            {pageLinks.map((p) => (
                                <Link key={p.key} href={p.href} className="transition hover:text-foreground">
                                    {p.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Stay connected</div>
                        <p className="text-sm text-muted-foreground">Follow EcoStride for updates and volunteer calls.</p>
                        <div className="flex items-center gap-3">
                            <a className="rounded-full border border-border p-2 text-foreground transition hover:bg-muted" href="#">
                                <Instagram className="h-4 w-4" />
                            </a>
                            <a className="rounded-full border border-border p-2 text-foreground transition hover:bg-muted" href="#">
                                <Facebook className="h-4 w-4" />
                            </a>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Newsletter</p>
                            <p className="mt-2 text-sm text-muted-foreground">Monthly highlights and event announcements.</p>
                            <div className="mt-3 flex gap-2">
                                <input
                                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder="Email address"
                                />
                                <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
                                    Join
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <p>© {new Date().getFullYear()} EcoStride Association. All rights reserved.</p>
                    <div className="flex gap-4">
                        {/* keep these if you still want canonical URLs */}
                        <Link href="/privacy" className="hover:text-foreground">
                            Privacy
                        </Link>
                        <Link href="/cookies" className="hover:text-foreground">
                            Cookies
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}
