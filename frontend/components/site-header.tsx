"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { useEffect, useState } from "react"
import { EcoStrideLogo } from "./ecostride-logo"

const navLinks = [
  { label: "Events", href: "/events" },
  { label: "Results", href: "/results" },
  { label: "Support", href: "/support" },
  { label: "Blog", href: "/blog" },
  { label: "Sponsors", href: "/sponsors" },
  { label: "Volunteers", href: "/volunteers" },
  { label: "Gallery", href: "/gallery" },
  { label: "Contact", href: "/contact" }
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const isHome = pathname === "/"
  // On the home page the cinematic hero owns the first viewport — hide the chrome until the user scrolls past it.
  const [hidden, setHidden] = useState(isHome)

  useEffect(() => {
    if (!isHome) {
      setHidden(false)
      return
    }
    const onScroll = () => {
      setHidden(window.scrollY < window.innerHeight - 80)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [isHome])

  // On home, position fixed so the header takes no flow space and the cinematic hero owns the full viewport.
  // On other routes, sticky so content sits below it normally.
  const positionClass = isHome ? "fixed inset-x-0" : "sticky"

  return (
    <header
      className={`${positionClass} top-0 z-50 border-b border-sand-200 bg-background/88 backdrop-blur transition-[opacity,transform] duration-500 ${
        hidden ? "pointer-events-none -translate-y-full opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 md:px-8">
        <Link href="/" className="text-foreground">
          <EcoStrideLogo textClassName="text-lg" />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-sand-700 lg:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="link-underline transition hover:text-foreground">
              {link.label}
            </Link>
          ))}
          <Link
            href="/admin/login"
            className="button-lift rounded-full border border-sand-300 bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-forest-300 hover:bg-sand-50"
          >
            Log in
          </Link>
          <Link
            href="/events"
            className="button-lift rounded-full bg-sand-300 px-5 py-2 text-sm font-semibold text-forest-900 transition hover:bg-sand-200"
          >
            Register now
          </Link>
        </nav>
        <button
          aria-label="Toggle navigation"
          className="inline-flex items-center justify-center rounded-full border border-sand-300 p-2 text-foreground lg:hidden"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-sand-200 bg-background lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 md:px-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-foreground"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-3 pt-2">
              <Link
                href="/admin/login"
                className="button-lift rounded-full border border-sand-300 px-5 py-2 text-center text-sm font-semibold text-foreground transition hover:bg-sand-50"
                onClick={() => setOpen(false)}
              >
                Log in
              </Link>
              <Link
                href="/events"
                className="button-lift rounded-full bg-sand-300 px-5 py-2 text-center text-sm font-semibold text-forest-900"
                onClick={() => setOpen(false)}
              >
                Register now
              </Link>
              <Link
                href="/support"
                className="button-lift rounded-full border border-sand-300 px-5 py-2 text-center text-sm font-semibold text-foreground"
                onClick={() => setOpen(false)}
              >
                Donate
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
