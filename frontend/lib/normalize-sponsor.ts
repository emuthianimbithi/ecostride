export type SponsorPlacement = {
    event_slug: string | null
    location_key: string | null
    display_order: number
}

export type NormalizedSponsor = {
    slug: string
    url_slug: string
    name: string
    tier: { name: string | null; priority: number | null; slug?: string | null }
    logo: { url: string | null; alt: string | null; media_id?: number | null }
    website_url: string | null
    description: string | null
    is_featured: boolean
    display_order: number
    placements: SponsorPlacement[]
}

export function normalizeSponsor(raw: any): NormalizedSponsor {
    const slug = String(raw?.slug ?? raw?.Slug ?? "")
    const url_slug = String(raw?.url_slug ?? raw?.URLSlug ?? raw?.urlSlug ?? slug).trim()
    const name = String(raw?.name ?? raw?.Name ?? "")
    const website_url = raw?.website_url ?? raw?.websiteUrl ?? null
    const description = raw?.description ?? raw?.Description ?? null
    const is_featured = Boolean(raw?.is_featured ?? raw?.isFeatured ?? false)
    const display_order = Number(raw?.display_order ?? raw?.displayOrder ?? 0)

    // Tier info
    const tierRaw = raw?.tier ?? raw?.Tier ?? {}
    const tier = {
        name: tierRaw?.name ?? tierRaw?.Name ?? raw?.tier_name ?? raw?.TierName ?? null,
        priority: typeof tierRaw?.priority === "number"
            ? tierRaw.priority
            : typeof raw?.tier_priority === "number"
                ? raw.tier_priority
                : typeof raw?.TierPriority === "number"
                    ? raw.TierPriority
                    : null,
        slug: tierRaw?.slug ?? tierRaw?.Slug ?? raw?.tier_slug ?? raw?.TierSlug ?? null
    }

    // Logo info
    const logoRaw = raw?.logo ?? raw?.Logo ?? {}
    const logo = {
        url: logoRaw?.url ?? logoRaw?.URL ?? raw?.logo_url ?? raw?.LogoURL ?? null,
        alt: logoRaw?.alt ?? logoRaw?.Alt ?? raw?.logo_alt ?? raw?.LogoAlt ?? name,
        media_id: typeof logoRaw?.media_id === "number" || typeof logoRaw?.mediaId === "number"
            ? (logoRaw?.media_id ?? logoRaw?.mediaId)
            : typeof raw?.logo_media_id === "number" || typeof raw?.LogoMediaID === "number"
                ? (raw?.logo_media_id ?? raw?.LogoMediaID)
                : null
    }

    // Placements
    const placementsRaw = raw?.placements ?? raw?.Placements ?? []
    const placements: SponsorPlacement[] = Array.isArray(placementsRaw)
        ? placementsRaw.map((p: any) => ({
            event_slug: p?.event_slug ?? p?.eventSlug ?? null,
            location_key: p?.location_key ?? p?.locationKey ?? null,
            display_order: Number(p?.display_order ?? p?.displayOrder ?? 0)
        }))
        : []

    return {
        slug,
        url_slug,
        name,
        tier,
        logo,
        website_url,
        description,
        is_featured,
        display_order,
        placements
    }
}
