"use client"

import Link from "next/link"
import { Menu, X } from "lucide-react"
import { useState } from "react"
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

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 md:px-8">
        <Link href="/" className="text-foreground">
          <EcoStrideLogo textClassName="text-lg" />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-foreground">
              {link.label}
            </Link>
          ))}
          <Link
            href="/admin/login"
            className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Log in
          </Link>
          <Link
            href="/events"
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Register
          </Link>
        </nav>
        <button
          aria-label="Toggle navigation"
          className="inline-flex items-center justify-center rounded-full border border-border p-2 text-foreground lg:hidden"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background lg:hidden">
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
                className="rounded-full border border-border px-5 py-2 text-center text-sm font-semibold text-foreground transition hover:bg-muted hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={() => setOpen(false)}
              >
                Log in
              </Link>
              <Link
                href="/events"
                className="rounded-full bg-primary px-5 py-2 text-center text-sm font-semibold text-primary-foreground"
                onClick={() => setOpen(false)}
              >
                Register
              </Link>
              <Link
                href="/support"
                className="rounded-full border border-border px-5 py-2 text-center text-sm font-semibold text-foreground"
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
