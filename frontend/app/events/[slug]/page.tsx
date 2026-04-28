import Image from "next/image"
import Link from "next/link"
import { MapPin } from "lucide-react"
import { serverGet } from "../../../lib/api-server"
import { formatDateTime, formatMoney } from "../../../lib/format"
import { normalizeSponsor } from "../../../lib/normalize-sponsor"

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
  results_published?: boolean
}

type CategoryApi = {
  slug: string
  name: string
  price_kes_minor: number
  price_usd_minor?: number | null
  price_eur_minor?: number | null
}

type PageProps = {
  params: Promise<{ slug: string }>
}

function computeImpactCopy(eventType: string) {
  const type = eventType.toUpperCase()
  if (type.includes("CLEANUP")) {
    return {
      title: "Plastic-free coast impact",
      lines: [
        "Your registration funds cleanup logistics and sorting supplies.",
        "Each event helps remove plastic waste before it reaches open water."
      ]
    }
  }
  if (type.includes("SEMINAR")) {
    return {
      title: "Citizen science impact",
      lines: [
        "Your fee supports community monitoring and data collection.",
        "Participants help turn estuary observations into local action."
      ]
    }
  }
  return {
    title: "Mangrove restoration impact",
    lines: [
      "Your bib supports shoreline replanting and nursery care.",
      "Each race contributes to stronger coastal flood protection."
    ]
  }
}

function registrationState(regOpenAt?: string | null, regCloseAt?: string | null) {
  const now = Date.now()
  const open = regOpenAt ? new Date(regOpenAt).getTime() : null
  const close = regCloseAt ? new Date(regCloseAt).getTime() : null
  if (open && open > now) return "upcoming"
  if (close && close < now) return "closed"
  return "open"
}

function registrationLabel(regOpenAt?: string | null, regCloseAt?: string | null) {
  const state = registrationState(regOpenAt, regCloseAt)
  if (state === "upcoming") return "Registration not open yet"
  if (state === "closed") return "Registration closed"
  if (!regCloseAt) return "Registration open"
  const close = new Date(regCloseAt).getTime()
  if (Number.isNaN(close)) return "Registration open"
  const diff = close - Date.now()
  if (diff <= 0) return "Registration closed"
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  if (days > 0) return `Closes in ${days}d ${hours}h`
  return `Closes in ${Math.max(hours, 1)}h`
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params

  try {
    const [event, categories, sponsors] = await Promise.all([
      serverGet<EventApi>(`/public/events/${slug}`),
      serverGet<CategoryApi[]>(`/public/events/${slug}/categories`).catch(() => []),
      serverGet<any[]>(`/public/sponsors?placement=EVENT_PAGE&event_slug=${slug}`).catch(() => [])
    ])

    const normalizedSponsors = sponsors.map(normalizeSponsor)
    const impact = computeImpactCopy(event.type)
    const state = registrationState(event.reg_open_at, event.reg_close_at)
    const kesPrices = categories
      .map((category) => category.price_kes_minor)
      .filter((price) => Number.isFinite(price))
      .sort((a, b) => a - b)
    const minKesPrice = kesPrices.length > 0 ? kesPrices[0] : null

    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.5fr_0.9fr]">
          <section className="space-y-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-tide-200 bg-tide-50 px-2.5 py-1 text-caption font-semibold uppercase tracking-[0.15em] text-tide-700">
                  {event.type.replaceAll("_", " ")}
                </span>
                <span className="rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-caption font-semibold text-warning">
                  {registrationLabel(event.reg_open_at, event.reg_close_at)}
                </span>
              </div>
              <h1 className="font-display text-h1 tracking-tight text-foreground md:text-display-lg">{event.title}</h1>
              <div className="flex items-center gap-2 text-body text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{event.location}</span>
              </div>
              <p className="text-body text-muted-foreground">{formatDateTime(event.start_at)}</p>
              <p className="text-body text-foreground/90">{event.description}</p>
            </div>

            <div className="rounded-2xl border border-forest-200 bg-forest-50/60 p-6">
              <h2 className="text-h3 font-semibold text-foreground">{impact.title}</h2>
              <p className="mt-3 text-body text-foreground/85">{impact.lines[0]}</p>
              <p className="mt-2 text-body text-foreground/85">{impact.lines[1]}</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-6">
              <h2 className="text-h3 font-semibold text-foreground">Course / estuary map</h2>
              {event.map_url ? (
                <a
                  href={event.map_url}
                  className="mt-3 inline-flex items-center rounded-full border border-tide-200 bg-tide-50 px-4 py-2 text-sm font-semibold text-tide-700 transition hover:bg-tide-100"
                >
                  Open route map
                </a>
              ) : (
                <p className="mt-3 text-body text-muted-foreground">Route map will be published before race day.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-6">
              <h2 className="text-h3 font-semibold text-foreground">Sponsor partners</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                {normalizedSponsors.map((sponsor) => (
                  <Link
                    key={sponsor.slug}
                    href={`/sponsors/${sponsor.url_slug}`}
                    className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition hover:border-tide-300"
                  >
                    {sponsor.logo.url ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                        <Image
                          src={sponsor.logo.url}
                          alt={sponsor.logo.alt || sponsor.name}
                          width={28}
                          height={28}
                          className="h-5 w-5 object-contain"
                        />
                      </span>
                    ) : null}
                    <span>{sponsor.name}</span>
                  </Link>
                ))}
                {normalizedSponsors.length === 0 ? (
                  <p className="text-body text-muted-foreground">Partner highlights will appear here soon.</p>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="h-max lg:sticky lg:top-24">
            <div className="rounded-2xl border border-tide-200 bg-surface p-6 shadow-sm">
              <p className="text-caption uppercase tracking-[0.2em] text-muted-foreground">Register</p>
              <p className="mt-2 text-body text-muted-foreground">
                {minKesPrice != null ? "Starting fee" : "Fee"}
              </p>
              <p className="mt-1 font-display text-h2 text-text-strong">
                {minKesPrice != null ? formatMoney("KES", minKesPrice) : "Contact organizer"}
              </p>

              {categories.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {categories.slice(0, 4).map((category) => (
                    <div key={category.slug} className="flex items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-2">
                      <span className="text-sm text-foreground">{category.name}</span>
                      <span className="text-sm font-semibold text-foreground">{formatMoney("KES", category.price_kes_minor)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 space-y-2">
                {state === "open" ? (
                  <Link
                    href={`/register/${event.url_slug}`}
                    className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                  >
                    Register now
                  </Link>
                ) : (
                  <div className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
                    {registrationLabel(event.reg_open_at, event.reg_close_at)}
                  </div>
                )}
                <Link
                  href="/events"
                  className="inline-flex h-10 w-full items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
                >
                  Browse all events
                </Link>
              </div>

              {event.results_published ? (
                <Link href={`/results/${event.url_slug}`} className="mt-4 inline-flex text-sm font-semibold text-primary hover:text-primary/80">
                  View published results
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      </main>
    )
  } catch (err) {
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
