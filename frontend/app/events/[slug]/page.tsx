import Image from "next/image"
import Link from "next/link"
import { serverGet } from "../../../lib/api-server"
import { formatDateTime, formatMoney, registrationWindowLabel, registrationWindowStatus } from "../../../lib/format"
import { normalizeSponsor } from "../../../lib/normalize-sponsor"

type Event = {
  Title: string
  Description: string
  Location: string
  MapURL: string
  StartAt: string
  Status: string
  URLSlug: string
  Type: string
  RegOpenAt?: string | null
  RegCloseAt?: string | null
  ResultsPublished?: boolean
}

type Category = {
  Slug: string
  Name: string
  PriceKESMinor: number
  PriceUSDMinor?: number
  PriceEURMinor?: number
}

export default async function Page({ params }: { params: { slug: string } }) {
  try {
    const [event, categories, sponsors] = await Promise.all([
      serverGet<Event>(`/public/events/${params.slug}`, { next: { revalidate: 60 }, cache: "no-cache" }),
      serverGet<Category[]>(`/public/events/${params.slug}/categories`, { next: { revalidate: 60 },cache: "no-cache"  }),
      serverGet<any[]>(`/public/sponsors?placement=EVENT_PAGE&event_slug=${params.slug}`, {
        next: { revalidate: 60 },
          cache: "no-cache"
      }).catch(() => [])
    ])
    const normalizedSponsors = sponsors.map(normalizeSponsor)

    const regStatus = registrationWindowStatus(event.RegOpenAt, event.RegCloseAt)

    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1">{event.Type.replace("_", " ")}</span>
              <span className="rounded-full border border-border px-3 py-1">
                {registrationWindowLabel(event.RegOpenAt, event.RegCloseAt)}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{event.Title}</h1>
            <p className="text-sm text-muted-foreground md:text-base">{event.Description}</p>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>{event.Location}</span>
              <span>{formatDateTime(event.StartAt)}</span>
              <span>Status: {event.Status}</span>
            </div>
            {event.ResultsPublished && (
              <Link className="inline-flex text-sm font-semibold text-primary" href={`/results/${event.URLSlug}`}>
                View published results
              </Link>
            )}
          </div>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Categories</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {categories.map((category) => (
                <div key={category.Slug} className="rounded-xl border border-border/60 bg-background p-4">
                  <h3 className="font-semibold text-foreground">{category.Name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney("KES", category.PriceKESMinor)}
                    {category.PriceUSDMinor ? ` • ${formatMoney("USD", category.PriceUSDMinor)}` : ""}
                    {category.PriceEURMinor ? ` • ${formatMoney("EUR", category.PriceEURMinor)}` : ""}
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
                href={`/register/${event.URLSlug}`}
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

          {event.MapURL && (
            <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Location</h2>
              <a className="mt-2 inline-flex text-sm font-semibold text-primary" href={event.MapURL}>
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
  } catch {
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
