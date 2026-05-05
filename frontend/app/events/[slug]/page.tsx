import Link from "next/link"
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react"
import { Eyebrow } from "../../../components/eyebrow"
import { MobileRegisterBar } from "../../../components/mobile-register-bar"
import { Reveal } from "../../../components/reveal"
import { ResponsiveMedia } from "../../../components/responsive-media"
import { Section } from "../../../components/section"
import { formatDate, formatDateTime, formatMoney } from "../../../lib/format"
import { serverGet } from "../../../lib/api-server"
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

type NarrativeFAQ = {
  question: string
  answer: string
}

type EventNarrative = {
  summary: string
  courseHeadline?: string
  courseCopy?: string
  causeHeadline?: string
  causeCopy?: string
  faq?: NarrativeFAQ[]
  heroMedia?: EventNarrativeMedia
  courseMedia?: EventNarrativeMedia
  causeMedia?: EventNarrativeMedia
}

type EventNarrativeMedia = {
  url: string
  mime?: string
  posterUrl?: string
  aspectRatio?: string
  altText?: string
}

function isNarrativeVideo(media?: EventNarrativeMedia) {
  return Boolean(media?.url && media?.mime?.toLowerCase().startsWith("video/"))
}

function parseEventNarrative(raw: string) {
  const fallback: EventNarrative = { summary: raw || "" }
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== "object") return fallback

    const faq = Array.isArray(parsed.faq)
      ? parsed.faq
          .map((item) => {
            if (!item || typeof item !== "object") return null
            const row = item as Record<string, unknown>
            return typeof row.question === "string" && typeof row.answer === "string"
              ? { question: row.question, answer: row.answer }
              : null
          })
          .filter((item): item is NarrativeFAQ => item !== null)
      : undefined

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : raw,
      courseHeadline: typeof parsed.courseHeadline === "string" ? parsed.courseHeadline : undefined,
      courseCopy: typeof parsed.courseCopy === "string" ? parsed.courseCopy : undefined,
      causeHeadline: typeof parsed.causeHeadline === "string" ? parsed.causeHeadline : undefined,
      causeCopy: typeof parsed.causeCopy === "string" ? parsed.causeCopy : undefined,
      faq: faq && faq.length > 0 ? faq : undefined,
      heroMedia: readNarrativeMedia(parsed.heroMedia),
      courseMedia: readNarrativeMedia(parsed.courseMedia),
      causeMedia: readNarrativeMedia(parsed.causeMedia),
    }
  } catch {
    return fallback
  }
}

function readNarrativeMedia(value: unknown): EventNarrativeMedia | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  if (typeof record.url !== "string" || !record.url) return undefined
  return {
    url: record.url,
    mime: typeof record.mime === "string" ? record.mime : undefined,
    posterUrl: typeof record.posterUrl === "string" ? record.posterUrl : undefined,
    aspectRatio: typeof record.aspectRatio === "string" ? record.aspectRatio : undefined,
    altText: typeof record.altText === "string" ? record.altText : undefined,
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
  if (days > 0) return `Registration closes in ${days}d ${hours}h`
  return `Registration closes in ${Math.max(hours, 1)}h`
}

function eventTypeLabel(eventType: string) {
  return eventType.replaceAll("_", " ")
}

function eventMood(eventType: string) {
  const type = eventType.toUpperCase()
  if (type.includes("CLEANUP")) {
    return {
      eyebrow: "Coastal cleanup event",
      causeTitle: "The cause",
      causeCopy:
        "This start line funds beach cleanup logistics, waste sorting, and the volunteer crews that keep plastic out of the estuary before the tide moves it offshore.",
      courseTitle: "The course",
      courseCopy:
        "Expect a practical shoreline route that stays close to the cleanup zone and keeps runners connected to the place the event is protecting."
    }
  }
  if (type.includes("SEMINAR")) {
    return {
      eyebrow: "Citizen science gathering",
      causeTitle: "The cause",
      causeCopy:
        "Entries support local observation work, data collection, and public learning tied directly to estuary health and stewardship.",
      courseTitle: "The format",
      courseCopy:
        "The day is structured for participation rather than pure speed, with route or session details published as field logistics are confirmed."
    }
  }
  return {
    eyebrow: "Beach marathon series",
    causeTitle: "The cause",
    causeCopy:
      "Every bib contributes to mangrove restoration, shoreline protection, and the cleanup operations that keep this coastline worth racing on.",
    courseTitle: "The course",
    courseCopy:
      "Expect a coastal route shaped by wet sand, estuary edges, and race-day conditions rather than a sterile city loop."
  }
}

function eventChips(event: EventApi, categories: CategoryApi[]) {
  return [
    { label: "Location", value: event.location || "Malindi coast" },
    { label: "Start", value: formatDate(event.start_at) },
    { label: "Categories", value: categories.length > 0 ? String(categories.length) : "TBA" }
  ]
}

function inclusions(eventType: string) {
  const type = eventType.toUpperCase()
  const shared = [
    {
      title: "Race pack",
      copy: "Core event information, route guidance, and on-site check-in support."
    },
    {
      title: "Event tee",
      copy: "A branded EcoStride shirt for race weekend and post-race visibility."
    },
    {
      title: "Finish medal",
      copy: "A clean finisher piece tied to the specific coastline event."
    },
    {
      title: "Cause access",
      copy: "A direct link to cleanup and restoration work attached to your registration."
    }
  ]

  if (type.includes("SEMINAR")) {
    shared[2] = {
      title: "Participation kit",
      copy: "Materials and on-site support tailored to the day’s program."
    }
  }

  return shared
}

function buildFaq(event: EventApi, categories: CategoryApi[]) {
  return [
    {
      question: "When does registration close?",
      answer: registrationLabel(event.reg_open_at, event.reg_close_at)
    },
    {
      question: "How do I choose a category?",
      answer:
        categories.length > 0
          ? "Pick the category that matches your pace, price point, or team plan. The registration flow will present the available options inline."
          : "Category options will appear in registration as soon as they are published."
    },
    {
      question: "When will the route map be available?",
      answer: event.map_url
        ? "The route map is already live below in the course section."
        : "Route details will be published before race day once shoreline conditions are confirmed."
    },
    {
      question: "Are results published online?",
      answer: event.results_published
        ? "Yes. This event has a published results page available after the finish."
        : "Results will appear online once timing and verification are complete."
    }
  ]
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
    const state = registrationState(event.reg_open_at, event.reg_close_at)
    const mood = eventMood(event.type)
    const narrative = parseEventNarrative(event.description)
    const faq = narrative.faq && narrative.faq.length > 0 ? narrative.faq : buildFaq(event, categories)
    const chips = eventChips(event, categories)
    const inclusionsList = inclusions(event.type)

    const kesPrices = categories
      .map((category) => category.price_kes_minor)
      .filter((price) => Number.isFinite(price))
      .sort((a, b) => a - b)
    const minKesPrice = kesPrices.length > 0 ? kesPrices[0] : null

    const registerHref = `/register/${event.url_slug}`
    const detailsHref = event.results_published ? `/results/${event.url_slug}` : "/events"

    return (
      <>
        <main className="pb-20 md:pb-0">
          <section className="relative isolate overflow-hidden bg-forest-900 text-white">
            <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,rgba(230,153,56,0.22),transparent_22%),linear-gradient(135deg,rgba(10,31,54,0.96),rgba(28,89,142,0.82),rgba(10,31,54,0.96))]" />
            <div className="grain-overlay" />
            <div className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 md:px-8 md:pb-28 md:pt-32">
              <Reveal className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_320px] lg:items-end">
                <div className="space-y-5">
                  <Eyebrow className="text-sand-300">{mood.eyebrow}</Eyebrow>
                  <h1 className="max-w-4xl font-display text-[clamp(2.75rem,6vw,5rem)] leading-[0.95] text-white">
                    {event.title}
                  </h1>
                  <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-sand-100/90">
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-sand-300" />
                      {event.location}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-sand-300" />
                      {formatDateTime(event.start_at)}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-sand-300" />
                      {registrationLabel(event.reg_open_at, event.reg_close_at)}
                    </span>
                  </div>
                  <p className="max-w-2xl text-base leading-8 text-sand-100/88 md:text-lg">
                    {narrative.summary}
                  </p>
                </div>

                <div className="space-y-4">
                  {narrative.heroMedia?.url ? (
                    <ResponsiveMedia
                      src={narrative.heroMedia.url}
                      alt={narrative.heroMedia.altText || event.title}
                      mime={narrative.heroMedia.mime}
                      poster={narrative.heroMedia.posterUrl}
                      aspectRatio={narrative.heroMedia.aspectRatio || "4:5"}
                      className="overflow-hidden rounded-2xl border border-white/15 bg-black/20"
                      mediaClassName="h-full w-full"
                      fillMode={isNarrativeVideo(narrative.heroMedia) ? "contain" : "cover"}
                      controls={isNarrativeVideo(narrative.heroMedia)}
                      videoMode={isNarrativeVideo(narrative.heroMedia) ? "player" : "ambient"}
                      preload={isNarrativeVideo(narrative.heroMedia) ? "auto" : "metadata"}
                      playsInline
                    />
                  ) : null}
                  <div className="border border-white/15 bg-white/8 p-6 backdrop-blur">
                    <Eyebrow className="text-sand-300">{eventTypeLabel(event.type)}</Eyebrow>
                    <p className="mt-3 text-sm leading-7 text-sand-100/88">
                      A conversion-first event page: date, route, pricing, and registration without forcing extra clicks.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {state === "open" ? (
                        <Link
                          href={registerHref}
                          className="button-lift inline-flex h-11 items-center justify-center rounded-full bg-sand-300 px-5 text-sm font-semibold text-forest-900 hover:bg-sand-200"
                        >
                          Register now
                        </Link>
                      ) : (
                        <span className="inline-flex h-11 items-center justify-center rounded-full border border-sand-300/40 px-5 text-sm font-semibold text-sand-100">
                          {registrationLabel(event.reg_open_at, event.reg_close_at)}
                        </span>
                      )}
                      <Link
                        href="/events"
                        className="button-lift inline-flex h-11 items-center justify-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/10"
                      >
                        Browse all events
                      </Link>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <div className="sticky top-[72px] z-30 border-y border-sand-300 bg-sand-200 text-forest-900">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm font-semibold sm:px-6 md:px-8">
              <span className="uppercase tracking-[0.2em]">{eventTypeLabel(event.type)}</span>
              <span className="hidden h-1 w-1 rounded-full bg-forest-900/50 sm:block" />
              <span>{formatDate(event.start_at)}</span>
              <span className="hidden h-1 w-1 rounded-full bg-forest-900/50 sm:block" />
              <span>{registrationLabel(event.reg_open_at, event.reg_close_at)}</span>
              {minKesPrice != null ? (
                <>
                  <span className="hidden h-1 w-1 rounded-full bg-forest-900/50 sm:block" />
                  <span>From {formatMoney("KES", minKesPrice)}</span>
                </>
              ) : null}
              <Link href={state === "open" ? registerHref : detailsHref} className="ml-auto inline-flex items-center gap-2 uppercase tracking-[0.12em]">
                {state === "open" ? "Register" : "Details"} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <Section>
            <Reveal className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_340px]">
              <div className="space-y-12">
                <section className="space-y-5">
                  <div className="space-y-3">
                    <Eyebrow>{mood.courseTitle}</Eyebrow>
                    <h2 className="font-display text-h1 text-foreground md:text-display-lg">
                      {narrative.courseHeadline || "Built for shoreline conditions, not generic road miles."}
                    </h2>
                  </div>
                  <p className="max-w-3xl text-base leading-8 text-muted-foreground">{narrative.courseCopy || mood.courseCopy}</p>
                  {narrative.courseMedia?.url ? (
                    <ResponsiveMedia
                      src={narrative.courseMedia.url}
                      alt={narrative.courseMedia.altText || `${event.title} course media`}
                      mime={narrative.courseMedia.mime}
                      poster={narrative.courseMedia.posterUrl}
                      aspectRatio={narrative.courseMedia.aspectRatio || "16:9"}
                      className="overflow-hidden rounded-2xl border border-sand-200"
                      mediaClassName="h-full w-full"
                      fillMode={isNarrativeVideo(narrative.courseMedia) ? "contain" : "cover"}
                      controls={isNarrativeVideo(narrative.courseMedia)}
                      videoMode={isNarrativeVideo(narrative.courseMedia) ? "player" : "ambient"}
                      preload={isNarrativeVideo(narrative.courseMedia) ? "auto" : "metadata"}
                      playsInline
                    />
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    {chips.map((chip) => (
                      <div key={chip.label} className="rounded-full border border-sand-200 px-4 py-2 text-sm text-foreground">
                        <span className="font-semibold">{chip.label}:</span> {chip.value}
                      </div>
                    ))}
                  </div>
                  {event.map_url ? (
                    <div className="overflow-hidden border border-sand-200 bg-sand-50">
                      <iframe
                        src={event.map_url}
                        className="h-[420px] w-full"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title={`${event.title} route map`}
                      />
                    </div>
                  ) : (
                    <div className="border border-sand-200 bg-sand-50 p-8">
                      <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                        Route map will be published before race day once tide, access, and shoreline conditions are locked.
                      </p>
                    </div>
                  )}
                </section>

                <section className="space-y-5">
                  <div className="space-y-3">
                    <Eyebrow>Categories</Eyebrow>
                    <h2 className="font-display text-h1 text-foreground">Choose your place on the start line.</h2>
                  </div>
                  <div className="divide-y divide-sand-200 border-y border-sand-200">
                    {categories.length > 0 ? (
                      categories.map((category) => (
                        <div key={category.slug} className="grid gap-4 py-5 transition hover:bg-sand-50 md:grid-cols-[minmax(0,1fr)_160px_160px] md:items-center">
                          <div>
                            <h3 className="font-display text-h3 text-foreground">{category.name}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Select this category during registration.</p>
                          </div>
                          <p className="text-sm font-semibold text-foreground">{formatMoney("KES", category.price_kes_minor)}</p>
                          <div className="md:text-right">
                            <Link
                              href={state === "open" ? registerHref : `/events`}
                              className="link-underline text-sm font-semibold text-tide-600"
                            >
                              {state === "open" ? "Select" : "View events"}
                            </Link>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-sm text-muted-foreground">
                        Category pricing will appear here as soon as the event configuration is published.
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-5">
                  <div className="space-y-3">
                    <Eyebrow>What you get</Eyebrow>
                    <h2 className="font-display text-h1 text-foreground">Race essentials without the clutter.</h2>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    {inclusionsList.map((item) => (
                      <div key={item.title} className="space-y-2 border-t border-sand-200 pt-4">
                        <h3 className="font-display text-h3 text-foreground">{item.title}</h3>
                        <p className="text-sm leading-7 text-muted-foreground">{item.copy}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="space-y-8 lg:sticky lg:top-28 lg:h-max">
                <section className="border border-sand-200 bg-sand-50 p-6">
                  <Eyebrow>Register</Eyebrow>
                  <p className="mt-3 text-sm text-muted-foreground">{minKesPrice != null ? "Starting fee" : "Entry status"}</p>
                  <p className="mt-1 font-display text-h1 text-foreground">
                    {minKesPrice != null ? formatMoney("KES", minKesPrice) : registrationLabel(event.reg_open_at, event.reg_close_at)}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {state === "open"
                      ? "Registration is open and one tap away."
                      : "This event is not currently accepting registrations."}
                  </p>
                  <div className="mt-6 space-y-3">
                    {state === "open" ? (
                      <Link
                        href={registerHref}
                        className="button-lift inline-flex h-11 w-full items-center justify-center rounded-full bg-sand-300 px-5 text-sm font-semibold text-forest-900 hover:bg-sand-200"
                      >
                        Register now
                      </Link>
                    ) : (
                      <div className="rounded-full border border-sand-300/50 px-4 py-3 text-center text-sm font-semibold text-sand-700">
                        {registrationLabel(event.reg_open_at, event.reg_close_at)}
                      </div>
                    )}
                    <Link
                      href="/events"
                      className="button-lift inline-flex h-11 w-full items-center justify-center rounded-full border border-sand-300 px-5 text-sm font-semibold text-foreground hover:bg-sand-100"
                    >
                      Browse all events
                    </Link>
                  </div>
                  {event.results_published ? (
                    <Link href={`/results/${event.url_slug}`} className="link-underline mt-5 inline-flex text-sm font-semibold text-tide-600">
                      View published results
                    </Link>
                  ) : null}
                </section>

                {normalizedSponsors.length > 0 ? (
                  <section className="space-y-4 border-t border-sand-200 pt-6">
                    <Eyebrow>Partners</Eyebrow>
                    <div className="space-y-3">
                      {normalizedSponsors.map((sponsor) => (
                        <Link
                          key={sponsor.slug}
                          href={`/sponsors/${sponsor.url_slug}`}
                          className="link-underline block text-sm text-foreground"
                        >
                          {sponsor.name}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
              </aside>
            </Reveal>
          </Section>

          <Section tone="forest">
            <Reveal className="grid gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-center">
              <div className="space-y-4">
                <Eyebrow className="text-sand-300">{mood.causeTitle}</Eyebrow>
                <h2 className="font-display text-h1 text-white md:text-display-lg">
                  {narrative.causeHeadline || "A better event page should still point back to the coastline."}
                </h2>
              </div>
              <div className="space-y-5">
                <p className="text-base leading-8 text-sand-100/85">{narrative.causeCopy || mood.causeCopy}</p>
                  {narrative.causeMedia?.url ? (
                    <ResponsiveMedia
                      src={narrative.causeMedia.url}
                      alt={narrative.causeMedia.altText || `${event.title} cause media`}
                      mime={narrative.causeMedia.mime}
                      poster={narrative.causeMedia.posterUrl}
                      aspectRatio={narrative.causeMedia.aspectRatio || "4:3"}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                      mediaClassName="h-full w-full"
                      fillMode={isNarrativeVideo(narrative.causeMedia) ? "contain" : "cover"}
                      controls={isNarrativeVideo(narrative.causeMedia)}
                      videoMode={isNarrativeVideo(narrative.causeMedia) ? "player" : "ambient"}
                      preload={isNarrativeVideo(narrative.causeMedia) ? "auto" : "metadata"}
                      playsInline
                    />
                  ) : null}
              </div>
            </Reveal>
          </Section>

          <Section>
            <Reveal className="space-y-5">
              <div className="space-y-3">
                <Eyebrow>FAQ</Eyebrow>
                <h2 className="font-display text-h1 text-foreground">The practical questions, without card chrome.</h2>
              </div>
              <div className="divide-y divide-sand-200 border-y border-sand-200">
                {faq.map((item) => (
                  <details key={item.question} className="group py-5">
                    <summary className="cursor-pointer list-none pr-6 text-base font-semibold text-foreground marker:hidden">
                      {item.question}
                    </summary>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{item.answer}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </Section>
        </main>

        <MobileRegisterBar
          href={registerHref}
          label={event.title}
          price={minKesPrice != null ? `From ${formatMoney("KES", minKesPrice)}` : registrationLabel(event.reg_open_at, event.reg_close_at)}
          visible={state === "open"}
        />
      </>
    )
  } catch (err) {
    console.error("Failed to load event page:", err)
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="font-display text-h1 text-foreground">Event not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this event.</p>
        </div>
      </main>
    )
  }
}
