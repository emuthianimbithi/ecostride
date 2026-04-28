"use client"

import { useMemo, useState } from "react"

type TypedConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  requiredText: string
  confirmLabel?: string
  cancelLabel?: string
  onClose: () => void
  onConfirm: () => Promise<void> | void
}

export function TypedConfirmDialog({
  open,
  title,
  description,
  requiredText,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onClose,
  onConfirm
}: TypedConfirmDialogProps) {
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  const canConfirm = useMemo(() => value.trim() === requiredText.trim() && !saving, [value, requiredText, saving])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close confirmation backdrop"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="text-h3 font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Type to confirm</p>
        <p className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground">
          {requiredText}
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          placeholder={`Type "${requiredText}"`}
        />
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={async () => {
              setSaving(true)
              try {
                await onConfirm()
              } finally {
                setSaving(false)
                setValue("")
              }
            }}
            className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Working..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
