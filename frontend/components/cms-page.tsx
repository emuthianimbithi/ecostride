import { CMSBlocks } from "./cms-blocks"
import { serverGet } from "../lib/api-server"

type CMSPageData = {
    title: string
    blocks: unknown
}

type CMSPageMeta = {
    id: number
    slug: string // UUID used by /public/pages/:slug
    url_slug: string // pretty URL
    title: string
    status: string
}

export async function CMSPage({
                                  urlSlug,
                                  fallbackTitle
                              }: {
    urlSlug: string
    fallbackTitle: string
}) {
    if (!urlSlug) {
        return (
            <main className="px-6 py-12 md:py-16">
                <div className="mx-auto max-w-4xl space-y-4">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">{fallbackTitle}</h1>
                    <p className="text-sm text-muted-foreground">Invalid page URL.</p>
                </div>
            </main>
        )
    }

    try {
        // 🔎 DEBUG: force backend call while you verify
        // After confirming it works, you can revert cache to `{ next: { revalidate: 60 } }`
        const pages = await serverGet<CMSPageMeta[]>(
            `/public/pages?status=published`,
            { cache: "no-store" }
        )

        console.log("CMS Pages:", pages)

        const match = (Array.isArray(pages) ? pages : []).find(
            (p) => String(p?.url_slug ?? "").toLowerCase() === urlSlug.toLowerCase()
        )

        if (!match?.slug) {
            return (
                <main className="px-6 py-12 md:py-16">
                    <div className="mx-auto max-w-4xl space-y-4">
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{fallbackTitle}</h1>
                        <p className="text-sm text-muted-foreground">No content found for this page.</p>
                    </div>
                </main>
            )
        }

        const page = await serverGet<CMSPageData>(
            `/public/pages/${encodeURIComponent(match.slug)}`,
            { cache: "no-store" }
        )

        const blocks = Array.isArray(page.blocks) ? page.blocks : []

        return (
            <main className="px-6 py-12 md:py-16">
                <div className="mx-auto max-w-4xl space-y-8">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                        {page.title || match.title || fallbackTitle}
                    </h1>
                    <CMSBlocks blocks={blocks as any} />
                </div>
            </main>
        )
    } catch {
        return (
            <main className="px-6 py-12 md:py-16">
                <div className="mx-auto max-w-4xl space-y-4">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">{fallbackTitle}</h1>
                    <p className="text-sm text-muted-foreground">Content will appear once the CMS page is published.</p>
                </div>
            </main>
        )
    }
}
