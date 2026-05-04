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
              <Eyebrow>Sponsors</Eyebrow>
              <h1 className="font-display text-h1 text-foreground md:text-display-lg">Tiered partners backing race logistics, cleanup work, and the public face of EcoStride.</h1>
              <p className="text-base leading-8 text-muted-foreground">
                Top-tier logos carry more visual weight. Lower tiers stay present without pretending every partnership is the same shape.
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
                <div className={`grid gap-6 ${tierIndex === 0 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                  {items.map((sponsor) => (
                    <Link key={sponsor.slug} href={`/sponsors/${sponsor.url_slug}`} className="group space-y-4">
                      <div className="flex min-h-[148px] items-center justify-center border border-sand-200 bg-background p-8 transition group-hover:border-forest-300">
                        {sponsor.logo.url ? (
                          <Image
                            src={sponsor.logo.url}
                            alt={sponsor.logo.alt || sponsor.name}
                            width={tierIndex === 0 ? 180 : 120}
                            height={tierIndex === 0 ? 180 : 120}
                            className="max-h-20 w-auto object-contain"
                          />
                        ) : (
                          <span className="font-display text-3xl text-foreground">{sponsor.name}</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-display text-h3 text-foreground transition-colors group-hover:text-forest-700">{sponsor.name}</h3>
                        <p className="text-sm leading-7 text-muted-foreground">{sponsor.description || "Sponsor profile"}</p>
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
