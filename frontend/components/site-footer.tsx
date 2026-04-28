"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react"
import { EcoStrideLogo } from "./ecostride-logo"
import { apiGet, apiPost } from "../lib/api-client"
import { normalizeSponsor, type NormalizedSponsor } from "../lib/normalize-sponsor"
import { defaultLocale, locales, type Locale } from "../lib/i18n"
import { useToast } from "./toast"

const quickLinks = [
  { label: "Events", href: "/events" },
  { label: "Results", href: "/results" },
  { label: "Support", href: "/support" },
  { label: "Registrations", href: "/registrations" },
  { label: "Orders", href: "/orders" },
  { label: "Blog", href: "/blog" },
  { label: "Gallery", href: "/gallery" },
  { label: "Sponsors", href: "/sponsors" }
]

type CMSPageResponse = {
  ID?: number
  slug?: string
  url_slug?: string
  title?: string
  status?: string
}

type CMSPage = {
  id: number
  slug: string
  url_slug: string
  title: string
}

function readStoredLocale() {
  try {
    const value = localStorage.getItem("ecostride_locale")
    if (value === "en" || value === "sw") return value
  } catch {
    // ignore
  }
  return defaultLocale
}

async function submitNewsletter(email: string) {
  const configuredPath = process.env.NEXT_PUBLIC_NEWSLETTER_PATH
  const candidates = [configuredPath, "/public/newsletter/subscribe", "/public/newsletter/subscriptions"].filter(
    (value): value is string => Boolean(value)
  )

  for (const path of candidates) {
    try {
      await apiPost(path, { email, source: "site_footer" })
      return "remote"
    } catch {
      // try next candidate
    }
  }

  // Safe fallback while endpoint is being introduced.
  const key = "ecostride_newsletter_waitlist"
  const payload = JSON.stringify({ email, queued_at: new Date().toISOString() })
  localStorage.setItem(key, payload)
  return "local"
}

export function SiteFooter() {
  const { toast } = useToast()
  const [pages, setPages] = useState<CMSPage[]>([])
  const [partners, setPartners] = useState<NormalizedSponsor[]>([])
  const [newsletterEmail, setNewsletterEmail] = useState("")
  const [newsletterLoading, setNewsletterLoading] = useState(false)
  const [locale, setLocale] = useState<Locale>(defaultLocale)

  useEffect(() => {
    setLocale(readStoredLocale())
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const data = await apiGet<CMSPageResponse[]>("/public/pages?status=published")
        const published = (Array.isArray(data) ? data : [])
          .filter((p) => String(p?.status ?? "").toLowerCase() === "published")
          .map((p) => ({
            id: p.ID ?? 0,
            slug: String(p.slug ?? ""),
            url_slug: String(p.url_slug ?? ""),
            title: String(p.title ?? "")
          }))
          .filter((p) => p.slug && p.url_slug && p.title)
        if (mounted) setPages(published)
      } catch {
        if (mounted) setPages([])
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const data = await apiGet<any[]>("/public/sponsors?placement=HOME_STRIP")
        const normalized = (Array.isArray(data) ? data : []).map(normalizeSponsor).slice(0, 8)
        if (mounted) setPartners(normalized)
      } catch {
        if (mounted) setPartners([])
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const pageLinks = useMemo(
    () => pages.map((p) => ({ key: p.slug, label: p.title, href: `/page/${p.url_slug}` })),
    [pages]
  )

  const onLocaleChange = (nextLocale: Locale) => {
    setLocale(nextLocale)
    try {
      localStorage.setItem("ecostride_locale", nextLocale)
      document.documentElement.lang = nextLocale
    } catch {
      // ignore local persistence errors
    }
    toast({
      title: "Language preference saved",
      description: "Full EN/SW translation rollout is in progress.",
      variant: "default"
    })
  }

  const onNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = newsletterEmail.trim()
    if (!email) {
      toast({
        title: "Email required",
        description: "Enter your email to join the newsletter.",
        variant: "destructive"
      })
      return
    }

    setNewsletterLoading(true)
    try {
      const mode = await submitNewsletter(email)
      setNewsletterEmail("")
      if (mode === "remote") {
        toast({
          title: "Subscribed",
          description: "You are now on the EcoStride newsletter.",
          variant: "success"
        })
      } else {
        toast({
          title: "Saved for follow-up",
          description: "Your signup was queued while newsletter service is being finalized.",
          variant: "default"
        })
      }
    } catch {
      toast({
        title: "Signup failed",
        description: "Please try again shortly.",
        variant: "destructive"
      })
    } finally {
      setNewsletterLoading(false)
    }
  }

  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6 md:px-8">
        {partners.length > 0 ? (
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Partner Strip</p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {partners.map((partner) => (
                <Link
                  key={partner.slug}
                  href={`/sponsors/${partner.url_slug}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 transition hover:border-tide-300"
                >
                  {partner.logo.url ? (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Image
                        src={partner.logo.url}
                        alt={partner.logo.alt || partner.name}
                        width={36}
                        height={36}
                        className="h-8 w-8 object-contain"
                      />
                    </span>
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-foreground">
                      {partner.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm font-medium text-foreground">{partner.name}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-8 md:grid-cols-3">
          <div className="space-y-3">
            <EcoStrideLogo textClassName="text-lg" />
            <p className="text-sm text-muted-foreground">
              Community-led races, learning, and coastal cleanups in Malindi.
            </p>
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
              <a
                className="rounded-full border border-border p-2 text-foreground transition hover:bg-muted"
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                aria-label="EcoStride on Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                className="rounded-full border border-border p-2 text-foreground transition hover:bg-muted"
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                aria-label="EcoStride on Facebook"
              >
                <Facebook className="h-4 w-4" />
              </a>
            </div>
            <form onSubmit={onNewsletterSubmit} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Newsletter</p>
              <p className="mt-2 text-sm text-muted-foreground">Monthly highlights and event announcements.</p>
              <div className="mt-3 flex gap-2">
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Email address"
                  aria-label="Newsletter email"
                />
                <button
                  type="submit"
                  disabled={newsletterLoading}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {newsletterLoading ? "..." : "Join"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} EcoStride Association. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <span>Language</span>
              <select
                value={locale}
                onChange={(e) => onLocaleChange(e.target.value as Locale)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                {locales.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
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
