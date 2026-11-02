import Image from "next/image"
import Link from "next/link"
import { Eyebrow } from "../../components/eyebrow"
import { Reveal } from "../../components/reveal"
import { Section } from "../../components/section"
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
  const grouped = normalized.reduce<Record<string, typeof normalized>>((acc, sponsor) => {
    const key = sponsor.tier.name || "Partners"
    acc[key] = acc[key] || []
    acc[key].push(sponsor)
    return acc
  }, {})

  const tiers = Object.entries(grouped).sort((a, b) => {
    const aPriority = a[1][0]?.tier.priority ?? 999
    const bPriority = b[1][0]?.tier.priority ?? 999
    return aPriority - bPriority
  })

  return (
    <main>
      <Section>
        <Reveal className="space-y-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              <Eyebrow>Partners</Eyebrow>
              <h1 className="font-display text-h1 text-foreground md:text-display-lg">Manufacturers, tourism players, importers, and finance partners backing Malindi&apos;s circular transition.</h1>
              <p className="text-base leading-8 text-muted-foreground">
                This is more than logo placement. These partnerships back compliance pathways, public environmental accountability, and the infrastructure behind the Sabaki Estuary Wet Sand Marathon.
              </p>
            </div>
            <Link
              className="button-lift inline-flex h-11 items-center justify-center rounded-full bg-sand-300 px-5 text-sm font-semibold text-forest-900 hover:bg-sand-200"
              href="/contact"
            >
              Sponsor inquiry
            </Link>
          </div>

          <div className="space-y-12">
            {tiers.map(([tierName, items], tierIndex) => (
              <section key={tierName} className="space-y-6 border-t border-sand-200 pt-6">
                <div className="space-y-2">
                  <Eyebrow>{tierName}</Eyebrow>
                  <h2 className="font-display text-h2 text-foreground">{tierIndex === 0 ? "Lead supporters" : "Supporting partners"}</h2>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((sponsor) => (
                    <Link
                      key={sponsor.slug}
                      href={`/sponsors/${sponsor.url_slug}`}
                      className="group overflow-hidden border border-sand-200 bg-background transition hover:border-forest-300 hover:shadow-md"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-white">
                        {sponsor.logo.url ? (
                          <Image
                            src={sponsor.logo.url}
                            alt={sponsor.logo.alt || sponsor.name}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                            className="object-contain p-8 transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center px-6 text-center font-display text-2xl text-foreground">
                            {sponsor.name}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 border-t border-sand-100 p-5">
                        <h3 className="font-display text-h3 text-foreground transition-colors group-hover:text-forest-700">
                          {sponsor.name}
                        </h3>
                        <p className="line-clamp-3 text-sm leading-7 text-muted-foreground">
                          {sponsor.description || "Sponsor profile"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}

            {normalized.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sponsors yet. The first partner profile will appear here once published.</p>
            ) : null}
          </div>
        </Reveal>
      </Section>
    </main>
  )
}
