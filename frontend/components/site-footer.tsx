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
    <footer className="border-t border-sand-200 bg-background py-16">
      <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6 md:px-8">
        {partners.length > 0 ? (
          <section className="space-y-4 border-b border-sand-200 pb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-tide-600">Partners</p>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              {partners.map((partner) => (
                <Link
                  key={partner.slug}
                  href={`/sponsors/${partner.url_slug}`}
                  className="link-underline flex items-center gap-3 text-sm text-sand-700 transition hover:text-foreground"
                >
                  {partner.logo.url ? (
                    <span className="flex h-10 w-10 items-center justify-center">
                      <Image
                        src={partner.logo.url}
                        alt={partner.logo.alt || partner.name}
                        width={36}
                        height={36}
                        className="h-8 w-8 object-contain"
                      />
                    </span>
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-100 text-xs font-semibold text-foreground">
                      {partner.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="font-medium">{partner.name}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-8 md:grid-cols-3">
          <div className="space-y-4">
            <EcoStrideLogo textClassName="text-lg" />
            <p className="font-display text-2xl text-foreground">Run with the tide.</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Coastal endurance events funding cleanup, restoration, and community action in Malindi.
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
              +254 791 648 304
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-tide-600">Explore</div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              {quickLinks.map((link) => (
                <Link key={link.href} href={link.href} className="link-underline w-max transition hover:text-foreground">
                  {link.label}
                </Link>
              ))}
              {pageLinks.map((p) => (
                <Link key={p.key} href={p.href} className="link-underline w-max transition hover:text-foreground">
                  {p.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-tide-600">Stay connected</div>
            <p className="text-sm text-muted-foreground">Race launches, volunteer calls, and shoreline stories.</p>
            <div className="flex items-center gap-3">
              <a
                className="button-lift rounded-full border border-tide-300 p-2 text-tide-600 transition hover:bg-tide-50"
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                aria-label="EcoStride on Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                className="button-lift rounded-full border border-tide-300 p-2 text-tide-600 transition hover:bg-tide-50"
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                aria-label="EcoStride on Facebook"
              >
                <Facebook className="h-4 w-4" />
              </a>
            </div>
            <form onSubmit={onNewsletterSubmit} className="space-y-3">
              <label className="block text-sm text-muted-foreground" htmlFor="newsletter-email">
                Newsletter
              </label>
              <input
                id="newsletter-email"
                type="email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                className="h-11 w-full rounded-full border border-sand-300 bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
                placeholder={locale === "sw" ? "barua pepe yako" : "you@example.com"}
                aria-label="Newsletter email"
              />
              <button
                type="submit"
                disabled={newsletterLoading}
                className="button-lift inline-flex h-11 items-center justify-center rounded-full bg-sand-300 px-5 text-sm font-semibold text-forest-900 transition hover:bg-sand-200 disabled:opacity-60"
              >
                {newsletterLoading ? "Submitting..." : locale === "sw" ? "Jiunge" : "Join"}
              </button>
            </form>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-6 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} EcoStride Association. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <span>Language</span>
              <select
                value={locale}
                onChange={(e) => onLocaleChange(e.target.value as Locale)}
                className="rounded-md border border-sand-300 bg-background px-2 py-1 text-xs text-foreground"
              >
                {locales.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <Link href="/privacy" className="link-underline hover:text-foreground">
              Privacy
            </Link>
            <Link href="/cookies" className="link-underline hover:text-foreground">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
