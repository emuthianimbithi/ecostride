type Props = {
  className?: string
  iconClassName?: string
  textClassName?: string
  showText?: boolean
}

export function EcoStrideLogo({ className = "", iconClassName = "", textClassName = "", showText = true }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/ecostride.svg"
        alt="EcoStride Logo"
        className={`h-7 w-7 object-contain ${iconClassName}`}
        aria-hidden="true"
      />
      {showText && <span className={`text-base font-semibold tracking-wide ${textClassName}`}>EcoStride</span>}
    </span>
  )
}
