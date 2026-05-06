export type RawMediaItem = {
  id?: number
  ID?: number
  slug?: string
  Slug?: string
  type?: string
  Type?: string
  path?: string
  Path?: string
  url?: string
  URL?: string
  mime?: string
  Mime?: string
  size?: number
  Size?: number
  alt_text?: string
  AltText?: string
  created_at?: string
  CreatedAt?: string
}

export type NormalizedMediaItem = {
  id: number
  slug: string
  type: string
  path: string
  url: string
  mime: string
  size: number
  alt_text: string
  created_at: string
}

export function normalizeMediaItem(raw: RawMediaItem): NormalizedMediaItem {
  return {
    id: Number(raw.id ?? raw.ID ?? 0),
    slug: String(raw.slug ?? raw.Slug ?? ""),
    type: String(raw.type ?? raw.Type ?? ""),
    path: String(raw.path ?? raw.Path ?? ""),
    url: String(raw.url ?? raw.URL ?? ""),
    mime: String(raw.mime ?? raw.Mime ?? ""),
    size: Number(raw.size ?? raw.Size ?? 0),
    alt_text: String(raw.alt_text ?? raw.AltText ?? ""),
    created_at: String(raw.created_at ?? raw.CreatedAt ?? "")
  }
}

export function normalizeMediaItems(raw: unknown): NormalizedMediaItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => normalizeMediaItem((item ?? {}) as RawMediaItem))
}
