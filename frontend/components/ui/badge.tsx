import * as React from "react"
import { cn } from "../../lib/cn"

type BadgeVariant = "default" | "outline" | "success" | "warning" | "danger"

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary/10 text-primary",
  outline: "border border-border bg-transparent text-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger"
}

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", variantClasses[variant], className)}
      {...props}
    />
  )
}
