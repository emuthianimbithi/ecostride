import * as React from "react"
import { cn } from "../../lib/cn"

type EmptyStateProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ className, title, description, action, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn("rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center", className)}
      {...props}
    >
      <h3 className="text-h4 font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-2 text-body text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
