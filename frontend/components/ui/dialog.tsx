"use client"

import * as React from "react"
import { cn } from "../../lib/cn"

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  React.useEffect(() => {
    if (!open) {
      return
    }

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close dialog backdrop" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn("relative z-10 w-full max-w-xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xl")}
      >
        <header className="space-y-1">
          <h2 id="dialog-title" className="text-h3 font-semibold">
            {title}
          </h2>
          {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
        </header>
        <div className="mt-4">{children}</div>
        {footer ? <footer className="mt-6 flex items-center justify-end gap-3">{footer}</footer> : null}
      </section>
    </div>
  )
}
