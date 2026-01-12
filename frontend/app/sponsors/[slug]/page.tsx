import Image from "next/image"
import SponsorViewTracker from "../../../components/sponsor-view-tracker"
import { serverGet } from "../../../lib/api-server"
import { normalizeSponsor } from "../../../lib/normalize-sponsor"

export default async function Page({ params }: { params: { slug: string } }) {
  let sponsors: any[] = []
  try {
    sponsors = await serverGet<any[]>("/public/sponsors", { next: { revalidate: 60 } })
  } catch {
    sponsors = []
  }

  const sponsor = sponsors.map(normalizeSponsor).find((item) => item.url_slug === params.slug)
  if (!sponsor) {
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sponsor not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this sponsor.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-4xl space-y-8">
        <SponsorViewTracker slug={sponsor.url_slug} />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            {sponsor.logo.url ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Image
                  src={sponsor.logo.url}
                  alt={sponsor.logo.alt || sponsor.name}
                  width={96}
                  height={96}
                  className="h-10 w-10 object-contain"
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-lg font-semibold text-foreground">
                {sponsor.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{sponsor.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground md:text-base">{sponsor.description || ""}</p>
        </div>
        {sponsor.website_url && (
          <a className="text-sm font-semibold text-primary" href={sponsor.website_url}>
            {sponsor.website_url}
          </a>
        )}
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Support their work</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sponsors help fund race logistics, beach cleanups, and community programming.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              href="/support"
            >
              Donate to EcoStride
            </a>
            <a
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40"
              href="/events"
            >
              View events
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
