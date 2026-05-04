"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "../lib/cn"

function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -10% 0px" }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return { ref, visible }
}

type RevealProps = React.HTMLAttributes<HTMLDivElement>

export function Reveal({ children, className, ...props }: RevealProps) {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={cn("reveal-on-scroll", visible && "is-visible", className)}
      {...props}
    >
      {children}
    </div>
  )
}
