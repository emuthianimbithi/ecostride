import * as React from "react"
import { cn } from "../../lib/cn"

type Step = {
  id: string
  label: string
}

type StepperProps = {
  steps: Step[]
  currentStep: number
  className?: string
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <ol className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-5", className)}>
      {steps.map((step, index) => {
        const done = index < currentStep
        const active = index === currentStep
        return (
          <li
            key={step.id}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-wide",
              done ? "border-success bg-success/10 text-success" : active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
            )}
            aria-current={active ? "step" : undefined}
          >
            {index + 1}. {step.label}
          </li>
        )
      })}
    </ol>
  )
}
