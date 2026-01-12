export const formatDate = (value?: string | null) => {
  if (!value) return "TBD"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "TBD"
  return date.toLocaleDateString()
}

export const formatDateTime = (value?: string | null) => {
  if (!value) return "TBD"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "TBD"
  return date.toLocaleString()
}

export const formatMoney = (currency?: string, minor?: number | null) => {
  if (!currency || minor == null) return "-"
  const value = minor / 100
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export const registrationWindowLabel = (openAt?: string | null, closeAt?: string | null) => {
  const now = new Date()
  const open = openAt ? new Date(openAt) : null
  const close = closeAt ? new Date(closeAt) : null

  if (open && now < open) {
    return `Registration opens ${formatDate(openAt)}`
  }
  if (close && now > close) {
    return "Registration closed"
  }
  return "Registration open"
}

export const registrationWindowStatus = (openAt?: string | null, closeAt?: string | null) => {
  const now = new Date()
  const open = openAt ? new Date(openAt) : null
  const close = closeAt ? new Date(closeAt) : null

  if (open && now < open) return "upcoming"
  if (close && now > close) return "closed"
  return "open"
}

export const formatDuration = (seconds?: number | null) => {
  if (seconds == null || Number.isNaN(seconds)) return "-"
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const parts = [hrs, mins, secs].map((part) => String(part).padStart(2, "0"))
  return parts.join(":")
}
