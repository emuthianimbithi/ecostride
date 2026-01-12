import Image from "next/image"
import Link from "next/link"
import { serverGet } from "../../lib/api-server"
import { normalizeSponsor } from "../../lib/normalize-sponsor"

export default async function Page() {
  let sponsors: any[] = []
  try {
    sponsors = await serverGet<any[]>("/public/sponsors", { next: { revalidate: 60 } })
  } catch {
    sponsors = []
  }

  const normalized = sponsors.map(normalizeSponsor)

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Sponsors</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Partners powering EcoStride events and coastal impact.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Become a sponsor</h2>
              <p className="text-sm text-muted-foreground">
                Support community races, environmental cleanups, and youth programs.
              </p>
            </div>
            <Link
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              href="/contact"
            >
              Sponsor inquiry
            </Link>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {normalized.map((sponsor) => (
            <Link
              key={sponsor.slug}
              href={`/sponsors/${sponsor.url_slug}`}
              className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                {sponsor.logo.url ? (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <Image
                      src={sponsor.logo.url}
                      alt={sponsor.logo.alt || sponsor.name}
                      width={72}
                      height={72}
                      className="h-8 w-8 object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-foreground">
                    {sponsor.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-semibold text-foreground">{sponsor.name}</h2>
                  {sponsor.tier.name && (
                    <span className="mt-1 inline-flex rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {sponsor.tier.name}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{sponsor.description || ""}</p>
              {sponsor.website_url && (
                <span className="mt-3 inline-flex text-xs font-semibold text-primary">{sponsor.website_url}</span>
              )}
            </Link>
          ))}
          {normalized.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No sponsors yet.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
