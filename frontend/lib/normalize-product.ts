export type NormalizedProduct = {
    slug: string
    url_slug: string
    name: string
    description: string
    type: string
    active: boolean
    allow_custom_amount: boolean
    price_kes_minor?: number
    price_usd_minor?: number
    price_eur_minor?: number
    stock_qty?: number | null
    primary_image_media_id?: number | null
    image_url?: string | null
    image_alt?: string | null
}

export function normalizeProduct(raw: any): NormalizedProduct {
    const slug = String(raw?.slug ?? "")
    const url_slug = String(raw?.url_slug ?? raw?.URLSlug ?? slug)
    const name = String(raw?.name ?? raw?.Name ?? "")
    const description = String(raw?.description ?? raw?.Description ?? "")
    const type = String(raw?.type ?? raw?.Type ?? "product")
    const active = Boolean(raw?.active ?? raw?.Active ?? raw?.is_active ?? true)
    const allow_custom_amount = Boolean(raw?.allow_custom_amount ?? raw?.allowCustomAmount ?? false)

    // Prices
    const price_kes_minor = typeof (raw?.price_kes_minor ?? raw?.priceKesMinor ?? raw?.priceKESMinor) === "number"
        ? (raw?.price_kes_minor ?? raw?.priceKesMinor ?? raw?.priceKESMinor)
        : undefined
    const price_usd_minor = typeof (raw?.price_usd_minor ?? raw?.priceUsdMinor ?? raw?.priceUSDMinor) === "number"
        ? (raw?.price_usd_minor ?? raw?.priceUsdMinor ?? raw?.priceUSDMinor)
        : undefined
    const price_eur_minor = typeof (raw?.price_eur_minor ?? raw?.priceEurMinor ?? raw?.priceEURMinor) === "number"
        ? (raw?.price_eur_minor ?? raw?.priceEurMinor ?? raw?.priceEURMinor)
        : undefined

    // Stock
    const stock_qty = typeof (raw?.stock_qty ?? raw?.stockQty) === "number" ? (raw?.stock_qty ?? raw?.stockQty) : null

    // Image
    const primary_image_media_id = typeof (raw?.primary_image_media_id ?? raw?.primaryImageMediaId) === "number"
        ? (raw?.primary_image_media_id ?? raw?.primaryImageMediaId)
        : null
    const image_url = raw?.image_url ?? raw?.imageUrl ?? null
    const image_alt = raw?.image_alt ?? raw?.imageAlt ?? null

    return {
        slug,
        url_slug,
        name,
        description,
        type,
        active,
        allow_custom_amount,
        price_kes_minor,
        price_usd_minor,
        price_eur_minor,
        stock_qty,
        primary_image_media_id,
        image_url,
        image_alt
    }
}
