import Image from "next/image"
import Link from "next/link"
import { serverGet } from "../../../lib/api-server"
import { formatDateTime, formatMoney, registrationWindowLabel, registrationWindowStatus } from "../../../lib/format"
import { normalizeSponsor } from "../../../lib/normalize-sponsor"

// ---- API Response Types (snake_case matching backend contract) ----

type EventApi = {
  slug: string
  url_slug: string
  type: string
  title: string
  description: string
  location: string
  map_url: string
  start_at: string
  reg_open_at?: string | null
  reg_close_at?: string | null
  status: string
  hero_media_id?: number | null
  seo_title?: string
  seo_desc?: string
  results_published?: boolean
}

type CategoryApi = {
  slug: string
  event_id: number
  name: string
  price_kes_minor: number
  price_usd_minor?: number | null
  price_eur_minor?: number | null
  capacity?: number | null
}

// ---- Page Component ----

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function Page({ params }: PageProps) {
  // Next.js 15+: params is a Promise, unwrap it
  const { slug } = await params

  try {
    const [event, categories, sponsors] = await Promise.all([
      serverGet<EventApi>(`/public/events/${slug}`),
      serverGet<CategoryApi[]>(`/public/events/${slug}/categories`),
      serverGet<any[]>(`/public/sponsors?placement=EVENT_PAGE&event_slug=${slug}`).catch(() => [])
    ])
    const normalizedSponsors = sponsors.map(normalizeSponsor)

    const regStatus = registrationWindowStatus(event.reg_open_at, event.reg_close_at)

    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1">{event.type.replace("_", " ")}</span>
              <span className="rounded-full border border-border px-3 py-1">
                {registrationWindowLabel(event.reg_open_at, event.reg_close_at)}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{event.title}</h1>
            <p className="text-sm text-muted-foreground md:text-base">{event.description}</p>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>{event.location}</span>
              <span>{formatDateTime(event.start_at)}</span>
              <span>Status: {event.status}</span>
            </div>
            {event.results_published && (
              <Link className="inline-flex text-sm font-semibold text-primary" href={`/results/${event.url_slug}`}>
                View published results
              </Link>
            )}
          </div>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Categories</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {categories.map((category) => (
                <div key={category.slug} className="rounded-xl border border-border/60 bg-background p-4">
                  <h3 className="font-semibold text-foreground">{category.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney("KES", category.price_kes_minor)}
                    {category.price_usd_minor ? ` • ${formatMoney("USD", category.price_usd_minor)}` : ""}
                    {category.price_eur_minor ? ` • ${formatMoney("EUR", category.price_eur_minor)}` : ""}
                  </p>
                </div>
              ))}
              {categories.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  This event has open registration without categories.
                </div>
              )}
            </div>
            {regStatus === "open" ? (
              <Link
                href={`/register/${event.url_slug}`}
                className="inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Register for this event
              </Link>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Registration is currently closed.{" "}
                <Link className="font-semibold text-primary" href="/events">
                  Explore other events
                </Link>
                .
              </div>
            )}
          </section>

          {event.map_url && (
            <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Location</h2>
              <a className="mt-2 inline-flex text-sm font-semibold text-primary" href={event.map_url}>
                Open map
              </a>
            </section>
          )}

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Volunteer for this event</h2>
            <p className="text-sm text-muted-foreground">
              Help with check-in, hydration points, or cleanup teams. We will match you to shifts.
            </p>
            <Link href="/volunteers" className="inline-flex text-sm font-semibold text-primary">
              Sign up to volunteer
            </Link>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Event partners</h2>
            <div className="flex flex-wrap gap-3">
              {normalizedSponsors.map((sponsor) => (
                <Link
                  key={sponsor.slug}
                  href={`/sponsors/${sponsor.url_slug}`}
                  className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground transition hover:border-primary/40"
                >
                  {sponsor.logo.url ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                      <Image
                        src={sponsor.logo.url}
                        alt={sponsor.logo.alt || sponsor.name}
                        width={24}
                        height={24}
                        className="h-4 w-4 object-contain"
                      />
                    </span>
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {sponsor.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {sponsor.name}
                </Link>
              ))}
              {normalizedSponsors.length === 0 && (
                <p className="text-sm text-muted-foreground">Sponsor highlights will appear soon.</p>
              )}
            </div>
          </section>
        </div>
      </main>
    )
  } catch (err) {
    // Log the actual error for debugging
    console.error("Failed to load event page:", err)
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Event not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this event.</p>
        </div>
      </main>
    )
  }
}
