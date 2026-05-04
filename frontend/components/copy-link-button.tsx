"use client"

import { Check, Link2 } from "lucide-react"
import { useState } from "react"
import { cn } from "../lib/cn"

type CopyLinkButtonProps = {
  className?: string
  label?: string
  value: string
}

export function CopyLinkButton({ className, label = "Copy link", value }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      const resolvedValue = value.startsWith("/") ? `${window.location.origin}${value}` : value
      await navigator.clipboard.writeText(resolvedValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "button-lift inline-flex items-center gap-2 rounded-full border border-sand-300 px-4 py-2 text-sm font-semibold text-foreground hover:bg-sand-100",
        className
      )}
      aria-label={label}
    >
      {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </button>
  )
}
