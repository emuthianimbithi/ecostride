import { CMSBlocks } from "./cms-blocks"
import { serverGet } from "../lib/api-server"

type CMSPageData = {
  Title: string
  Blocks: unknown
}

export async function CMSPage({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) {
  try {
    const page = await serverGet<CMSPageData>(`/public/pages/${slug}`, { next: { revalidate: 60 } })
    const blocks = Array.isArray(page.Blocks) ? (page.Blocks as CMSPageData["Blocks"][]) : []

    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {page.Title || fallbackTitle}
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
