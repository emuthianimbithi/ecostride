import * as React from "react"
import { cn } from "../../lib/cn"

type ToastTone = "default" | "success" | "warning" | "danger"

const toneClasses: Record<ToastTone, string> = {
  default: "border-border bg-card text-card-foreground",
  success: "border-success/30 bg-success/10 text-foreground",
  warning: "border-warning/30 bg-warning/10 text-foreground",
  danger: "border-danger/30 bg-danger/10 text-foreground"
}

type ToastProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: ToastTone
  title: string
  description?: string
}

export function Toast({ className, tone = "default", title, description, ...props }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("rounded-lg border px-4 py-3 shadow-sm", toneClasses[tone], className)}
      {...props}
    >
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}
