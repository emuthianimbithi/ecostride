import Image from "next/image"
import Link from "next/link"
import SponsorViewTracker from "../../../components/sponsor-view-tracker"
import { Eyebrow } from "../../../components/eyebrow"
import { Reveal } from "../../../components/reveal"
import { Section } from "../../../components/section"
import { serverGet } from "../../../lib/api-server"
import { normalizeSponsor } from "../../../lib/normalize-sponsor"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params

  let sponsors: any[] = []
  try {
    sponsors = await serverGet<any[]>("/public/sponsors")
  } catch (err) {
    console.error("Failed to load sponsors:", err)
    sponsors = []
  }

  const sponsor = sponsors.map(normalizeSponsor).find((item) => item.url_slug === slug)
  if (!sponsor) {
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="font-display text-h1 text-foreground">Sponsor not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this sponsor.</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Section>
        <Reveal className="mx-auto max-w-5xl space-y-10">
          <SponsorViewTracker slug={sponsor.url_slug} />
          <Link className="link-underline text-xs uppercase tracking-[0.24em] text-tide-600" href="/sponsors">
            Back to sponsors
          </Link>

          <div className="grid gap-8 md:grid-cols-[160px_minmax(0,1fr)] md:items-start">
            <div className="flex aspect-square items-center justify-center border border-sand-200 bg-background p-6">
              {sponsor.logo.url ? (
                <Image
                  src={sponsor.logo.url}
                  alt={sponsor.logo.alt || sponsor.name}
                  width={140}
                  height={140}
                  className="max-h-28 w-auto object-contain"
                />
              ) : (
                <div className="font-display text-4xl text-foreground">{sponsor.name.slice(0, 2).toUpperCase()}</div>
              )}
            </div>
            <div className="space-y-4">
              <Eyebrow>{sponsor.tier.name || "Partner"}</Eyebrow>
              <h1 className="font-display text-h1 text-foreground md:text-display-lg">{sponsor.name}</h1>
              <p className="max-w-3xl text-base leading-8 text-muted-foreground">{sponsor.description || "Sponsor profile."}</p>
              {sponsor.website_url ? (
                <a className="link-underline text-sm font-semibold text-tide-600" href={sponsor.website_url}>
                  Visit sponsor site
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-3 border-t border-sand-200 pt-4">
              <h2 className="font-display text-h2 text-foreground">Sponsor profile</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                This partner helps fund race logistics, beach cleanups, and the operational quality that keeps EcoStride credible on the coast.
              </p>
            </div>
            <div className="space-y-3 border-t border-sand-200 pt-4">
              <h2 className="font-display text-h2 text-foreground">Support their impact</h2>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="button-lift inline-flex h-11 items-center justify-center rounded-full bg-sand-300 px-5 text-sm font-semibold text-forest-900 hover:bg-sand-200"
                  href="/support"
                >
                  Donate to EcoStride
                </Link>
                <Link
                  className="button-lift inline-flex h-11 items-center justify-center rounded-full border border-sand-300 px-5 text-sm font-semibold text-foreground hover:bg-sand-100"
                  href="/events"
                >
                  View events
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>
    </main>
  )
}
