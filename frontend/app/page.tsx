import Image from "next/image"
import Link from "next/link"
import { Badge } from "../components/ui/badge"
import { Card, CardContent } from "../components/ui/card"
import { formatDate } from "../lib/format"
import { serverGet } from "../lib/api-server"

type EventApi = {
  slug: string
  url_slug: string
  title: string
  type: string
  location: string
  start_at: string
  reg_open_at?: string | null
  reg_close_at?: string | null
}

type PostApi = {
  slug: string
  url_slug: string
  title: string
  excerpt: string
  updated_at?: string | null
  published_at?: string | null
  featured_image_url?: string | null
}

type AlbumApi = {
  slug: string
  url_slug: string
  title: string
  description: string
}

type AlbumDetailResponse = {
  album: {
    title: string
    description: string
    url_slug: string
  }
  media: Array<{
    url: string
    alt_text?: string
  }>
}

type SponsorApi = {
  slug: string
}

function registrationCountdown(closeAt?: string | null) {
  if (!closeAt) {
    return "Registration window available"
  }
  const closeDate = new Date(closeAt)
  const now = new Date()
  const diffMs = closeDate.getTime() - now.getTime()

  if (Number.isNaN(closeDate.getTime())) {
    return "Registration window available"
  }
  if (diffMs <= 0) {
    return "Registration closed"
  }

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (days > 0) {
    return `Registration closes in ${days}d ${hours}h`
  }
  return `Registration closes in ${Math.max(hours, 1)}h`
}

function eventCauseTag(eventType: string) {
  const kind = eventType.toUpperCase()
  if (kind.includes("CLEANUP")) {
    return "Plastic-free coast"
  }
  if (kind.includes("MARATHON")) {
    return "Mangrove restoration"
  }
  if (kind.includes("SEMINAR")) {
    return "Citizen science"
  }
  return "Estuary action"
}

function WaveDivider() {
  return (
    <div aria-hidden className="pointer-events-none relative -mt-2 h-10 overflow-hidden text-tide-200">
      <svg viewBox="0 0 1440 80" className="h-full w-full fill-current" preserveAspectRatio="none">
        <path d="M0,32L60,42.7C120,53,240,75,360,69.3C480,64,600,32,720,26.7C840,21,960,43,1080,53.3C1200,64,1320,64,1380,64L1440,64L1440,80L1380,80C1320,80,1200,80,1080,80C960,80,840,80,720,80C600,80,480,80,360,80C240,80,120,80,60,80L0,80Z" />
      </svg>
    </div>
  )
}

function PillarIcon({ kind }: { kind: "wave" | "mangrove" | "science" }) {
  if (kind === "wave") {
    return (
      <svg viewBox="0 0 48 48" className="h-7 w-7 text-tide-700" aria-hidden>
        <path d="M4 28c4 0 4-8 8-8s4 8 8 8 4-8 8-8 4 8 8 8 4-8 8-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === "mangrove") {
    return (
      <svg viewBox="0 0 48 48" className="h-7 w-7 text-forest-700" aria-hidden>
        <path d="M24 40V21M14 27c0-6 4-10 10-10s10 4 10 10M20 40l-6-8M28 40l6-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" className="h-7 w-7 text-sun-700" aria-hidden>
      <circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M24 8v5M24 35v5M8 24h5M35 24h5M13.5 13.5l3.5 3.5M31 31l3.5 3.5M34.5 13.5L31 17M17 31l-3.5 3.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export default async function HomePage() {
  const [events, posts, albums, sponsors] = await Promise.all([
    serverGet<EventApi[]>("/public/events", { next: { revalidate: 60 } }).catch(() => []),
    serverGet<PostApi[]>("/public/posts", { next: { revalidate: 60 } }).catch(() => []),
    serverGet<AlbumApi[]>("/public/gallery/albums", { next: { revalidate: 60 } }).catch(() => []),
    serverGet<SponsorApi[]>("/public/sponsors?placement=HOME_STRIP", { next: { revalidate: 60 } }).catch(() => [])
  ])

  const upcomingEvents = [...events]
    .filter((event) => event.start_at)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())

  const featuredEvent = upcomingEvents[0]
  const featuredPosts = posts.slice(0, 3)
  const featuredAlbums = albums.slice(0, 3)

  const albumPreviews = await Promise.all(
    featuredAlbums.map(async (album) => {
      const detail = await serverGet<AlbumDetailResponse>(`/public/gallery/albums/${album.url_slug}`, {
        next: { revalidate: 60 }
      }).catch(() => null)
      return {
        title: album.title,
        urlSlug: album.url_slug,
        imageUrl: detail?.media?.[0]?.url ?? null,
        imageAlt: detail?.media?.[0]?.alt_text ?? album.title
      }
    })
  )

  const impactStats = [
    { label: "Community races", value: String(upcomingEvents.length) },
    { label: "Story updates", value: String(posts.length) },
    { label: "Active partners", value: String(sponsors.length) }
  ]

  return (
    <main className="pb-16">
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-20">
          <video autoPlay muted loop playsInline poster="/hero-placeholder.svg" className="h-full w-full object-cover">
            <source src="/hero-loop.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-br from-forest-900/80 via-tide-900/75 to-sun-900/45" />
        </div>
        <div className="mx-auto flex min-h-[68vh] max-w-6xl flex-col justify-center px-4 py-24 sm:px-6 md:px-8">
          <p className="text-caption uppercase tracking-[0.24em] text-sand-100">Run where the river meets the sea</p>
          <h1 className="mt-4 max-w-3xl font-display text-display-lg text-white md:text-display-xl">
            Lace up. Show up. Push back the tide one stride at a time.
          </h1>
          <p className="mt-5 max-w-2xl text-body text-sand-100/90">
            EcoStride is a marathon series for people who refuse to watch estuaries die quietly. Every bib funds mangrove planting, plastic recovery, and citizen-science along the coastlines we love.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/events"
              className="inline-flex h-11 items-center justify-center rounded-full bg-sun-500 px-6 text-sm font-semibold text-sun-900 transition hover:bg-sun-400"
            >
              Find a race
            </Link>
            <Link
              href="/support"
              className="inline-flex h-11 items-center justify-center rounded-full border border-sand-100/60 bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Why estuaries?
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-10 grid max-w-6xl gap-4 px-4 sm:grid-cols-3 sm:px-6 md:px-8">
        {impactStats.map((stat) => (
          <Card key={stat.label} className="motion-safe-reveal border-sand-200 bg-surface/95 backdrop-blur">
            <CardContent className="p-5">
              <p className="text-caption uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</p>
              <p className="mt-2 font-display text-h1 text-text-strong">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <WaveDivider />

      <section className="mx-auto mt-8 max-w-6xl px-4 sm:px-6 md:px-8">
        <div className="mb-6">
          <h2 className="font-display text-h1 text-foreground">Three pillars. One coastline.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-tide-200">
            <CardContent className="space-y-3 p-6">
              <PillarIcon kind="wave" />
              <h3 className="text-h3 font-semibold text-foreground">Plastic-free coast</h3>
              <p className="text-body text-muted-foreground">Cleanup teams and race-day waste controls that keep estuary channels clear.</p>
            </CardContent>
          </Card>
          <Card className="border-forest-200">
            <CardContent className="space-y-3 p-6">
              <PillarIcon kind="mangrove" />
              <h3 className="text-h3 font-semibold text-foreground">Mangrove restoration</h3>
              <p className="text-body text-muted-foreground">Every bib contributes to local planting and shoreline protection activity.</p>
            </CardContent>
          </Card>
          <Card className="border-sun-200">
            <CardContent className="space-y-3 p-6">
              <PillarIcon kind="science" />
              <h3 className="text-h3 font-semibold text-foreground">Citizen science</h3>
              <p className="text-body text-muted-foreground">Runners, schools, and residents gather field observations for estuary health.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-6xl px-4 sm:px-6 md:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-h1 text-foreground">Featured race</h2>
          <Link href="/events" className="text-sm font-semibold text-primary hover:text-primary/80">
            View all events
          </Link>
        </div>
        <Card className="overflow-hidden border-tide-200">
          <CardContent className="grid gap-6 p-6 md:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              <Badge variant="outline" className="border-tide-300 bg-tide-50 text-tide-700">
                {featuredEvent ? featuredEvent.type.replaceAll("_", " ") : "Upcoming event"}
              </Badge>
              <h3 className="font-display text-h2 text-foreground">
                {featuredEvent ? featuredEvent.title : "Next estuary run coming soon"}
              </h3>
              <p className="text-body text-muted-foreground">
                {featuredEvent
                  ? `${formatDate(featuredEvent.start_at)} • ${featuredEvent.location}`
                  : "New race slots will open shortly. Keep your team ready."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{featuredEvent ? eventCauseTag(featuredEvent.type) : "Estuary action"}</Badge>
                <Badge variant="warning">{featuredEvent ? registrationCountdown(featuredEvent.reg_close_at) : "Registration opens soon"}</Badge>
              </div>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-tide-100 via-sand-50 to-forest-100 p-5">
              <p className="text-caption uppercase tracking-[0.2em] text-muted-foreground">Ready to run?</p>
              <p className="mt-2 text-body text-foreground">
                Register for the next shoreline event and directly fund conservation work.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={featuredEvent ? `/register/${featuredEvent.url_slug}` : "/events"}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Register now
                </Link>
                <Link
                  href={featuredEvent ? `/events/${featuredEvent.url_slug}` : "/events"}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
                >
                  View details
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <WaveDivider />

      <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6 md:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-h1 text-foreground">From the shoreline</h2>
          <Link href="/gallery" className="text-sm font-semibold text-primary hover:text-primary/80">
            Open gallery
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {albumPreviews.map((album) => (
            <Link key={album.urlSlug} href={`/gallery/${album.urlSlug}`} className="group overflow-hidden rounded-2xl border border-border bg-card">
              <div className="relative h-52 w-full bg-muted">
                {album.imageUrl ? (
                  <Image src={album.imageUrl} alt={album.imageAlt} fill className="object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{album.title}</div>
                )}
              </div>
              <div className="p-4">
                <p className="text-body font-semibold text-foreground">{album.title}</p>
              </div>
            </Link>
          ))}
          {albumPreviews.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-6 text-body text-muted-foreground">
              Gallery previews will appear here when albums are published.
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-6xl px-4 sm:px-6 md:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-h1 text-foreground">Latest field notes</h2>
          <Link href="/blog" className="text-sm font-semibold text-primary hover:text-primary/80">
            Read blog
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featuredPosts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.url_slug}`} className="rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-tide-300">
              <p className="text-caption uppercase tracking-[0.2em] text-muted-foreground">
                {(post.published_at || post.updated_at) ? formatDate(post.published_at || post.updated_at) : "Draft"}
              </p>
              <h3 className="mt-2 text-h4 font-semibold text-foreground">{post.title}</h3>
              <p className="mt-2 text-body text-muted-foreground">{post.excerpt || "Read more about our estuary conservation work."}</p>
            </Link>
          ))}
          {featuredPosts.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-6 text-body text-muted-foreground">
              Blog stories will appear here once published.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
