import { cn } from "../lib/cn"

type SectionTone = "sand" | "tide" | "forest"

const toneClasses: Record<SectionTone, string> = {
  sand: "bg-sand-50",
  tide: "bg-tide-50/70",
  forest: "bg-forest-900 text-white"
}

type SectionProps = React.HTMLAttributes<HTMLElement> & {
  containerClassName?: string
  tone?: SectionTone
}

export function Section({
  children,
  className,
  containerClassName,
  tone,
  ...props
}: SectionProps) {
  return (
    <section className={cn("py-20 md:py-28", tone ? toneClasses[tone] : "", className)} {...props}>
      <div className={cn("mx-auto max-w-6xl px-4 sm:px-6 md:px-8", containerClassName)}>{children}</div>
    </section>
  )
}
