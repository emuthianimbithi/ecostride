export const locales = ["en", "sw"] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "en"

export function isSupportedLocale(input: string): input is Locale {
  return locales.includes(input as Locale)
}
