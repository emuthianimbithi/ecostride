"use client"

import type { ReactNode } from "react"

export function IconAction(props: {
  label: string
  onClick?: () => void
  href?: string
  disabled?: boolean
  children: ReactNode
}) {
  const { label, onClick, href, disabled, children } = props

  const className =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-muted disabled:opacity-50"

  if (href) {
    return (
      <a
        className={className}
        href={href}
        aria-label={label}
        title={label}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noreferrer" : undefined}
      >
        {children}
      </a>
    )
  }

  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      {children}
    </button>
  )
}

