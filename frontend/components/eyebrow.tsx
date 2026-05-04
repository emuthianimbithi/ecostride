import { cn } from "../lib/cn"

type EyebrowProps = React.HTMLAttributes<HTMLParagraphElement>

export function Eyebrow({ className, ...props }: EyebrowProps) {
  return (
    <p
      className={cn("text-xs font-semibold uppercase tracking-[0.24em] text-tide-600", className)}
      {...props}
    />
  )
}
