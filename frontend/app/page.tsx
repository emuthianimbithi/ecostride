import Link from "next/link"
import { ArrowRight, Clock3 } from "lucide-react"
import { EditorialCard } from "../components/editorial-card"
import { Eyebrow } from "../components/eyebrow"
import { MalindiHero } from "../components/malindi-hero"
import { MalindiImpact } from "../components/malindi-impact"
import { Reveal } from "../components/reveal"
import { ResponsiveMedia, isVideoMedia } from "../components/responsive-media"
import { Section } from "../components/section"
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
  name?: string
  title?: string
  logo_url?: string | null
}

function formatEventCountdown(startAt?: string | null) {
  if (!startAt) return "Date to be announced"
  const startDate = new Date(startAt)
  const diffMs = startDate.getTime() - Date.now()
  if (Number.isNaN(startDate.getTime())) return "Date to be announced"
  if (diffMs <= 0) return "Now live"

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return `${days} days, ${hours} hrs`
}

function monthDivider(dateString?: string | null) {
  if (!dateString) return "SOON"
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "SOON"
  return date
    .toLocaleDateString("en-US", { month: "short", year: "numeric" })
    .toUpperCase()
    .replace(" ", " ")
}

function eventCauseTag(eventType: string) {
  const kind = eventType.toUpperCase()
  if (kind.includes("CLEANUP")) return "Restore the coast"
  if (kind.includes("MARATHON")) return "Race the tide"
  if (kind.includes("SEMINAR")) return "Run with the community"
  return "Coastal action"
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
  const featuredPost = posts[0]
  const secondaryPosts = posts.slice(1, 3)
  const featuredAlbums = albums.slice(0, 3)
  const featuredPostVideo = featuredPost?.featured_image_url ? isVideoMedia(featuredPost.featured_image_url) : false

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

  return (
    <main>
      <MalindiHero primaryLabel="Join the movement" />

      <MalindiImpact />

      <div className="sticky top-[72px] z-30 border-y border-sand-300 bg-sand-200 text-forest-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm font-semibold sm:px-6 md:px-8">
          <span className="uppercase tracking-[0.2em]">Next event</span>
          <span className="hidden h-1 w-1 rounded-full bg-forest-900/50 sm:block" />
          <span>{featuredEvent?.title ?? "Sabaki Estuary Wet-Sand Marathon"}</span>
          <span className="hidden h-1 w-1 rounded-full bg-forest-900/50 sm:block" />
          <span>{featuredEvent?.location ?? "Malindi, Kenya"}</span>
          <span className="hidden h-1 w-1 rounded-full bg-forest-900/50 sm:block" />
          <span>{formatEventCountdown(featuredEvent?.start_at)}</span>
          <Link
            href={featuredEvent ? `/register/${featuredEvent.url_slug}` : "/events"}
            className="ml-auto inline-flex items-center gap-2 uppercase tracking-[0.12em]"
          >
            Register <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <Section tone="sand" className="relative overflow-hidden">
        <div className="grain-overlay" />
        <Reveal className="relative space-y-10">
          <div className="flex items-end justify-between gap-4">
            <div className="max-w-2xl space-y-3">
              <Eyebrow>Upcoming events</Eyebrow>
              <h2 className="font-display text-h1 text-foreground md:text-display-lg">From estuary accountability to a global start line.</h2>
            </div>
            <Link href="/events" className="link-underline hidden text-sm font-semibold text-tide-600 md:inline-flex">
              View all events
            </Link>
          </div>
          <div className="space-y-10">
            {upcomingEvents.slice(0, 4).map((event, index) => (
              <article
                key={event.slug}
                className="grid gap-6 border-b border-sand-200 pb-10 last:border-b-0 last:pb-0 md:grid-cols-[160px_minmax(0,1fr)]"
              >
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-tide-600">{monthDivider(event.start_at)} ↘</p>
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-sand-100">
                    <ResponsiveMedia
                      src="/coastal-course.svg"
                      alt="Generic EcoStride shoreline course illustration"
                      className="h-full"
                      fillMode="cover"
                    />
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                  <div className="max-w-2xl space-y-3">
                    <Eyebrow>{event.type.replaceAll("_", " ")}</Eyebrow>
                    <h3 className="font-display text-h2 text-foreground">{event.title}</h3>
                    <p className="text-sm text-muted-foreground">{formatDate(event.start_at)} • {event.location}</p>
                    <p className="text-sm leading-7 text-muted-foreground">{eventCauseTag(event.type)}</p>
                  </div>
                  <div className="space-y-3 md:min-w-52">
                    <div className="inline-flex items-center gap-2 text-sm text-foreground">
                      <Clock3 className="h-4 w-4 text-sand-600" />
                      <span>{formatEventCountdown(event.start_at)}</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/events/${event.url_slug}`}
                        className="link-underline inline-flex text-sm font-semibold text-tide-600"
                      >
                        Event details
                      </Link>
                      <Link
                        href={`/register/${event.url_slug}`}
                        className="button-lift inline-flex h-11 items-center justify-center rounded-full bg-forest-700 px-5 text-sm font-semibold text-white hover:bg-forest-600"
                      >
                        Register now
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events yet. Drop your email and we&apos;ll tell you first.</p>
            ) : null}
          </div>
        </Reveal>
      </Section>

      <Section>
        <Reveal className="space-y-10">
          <div className="max-w-3xl space-y-3">
            <Eyebrow>Investors Forum 2026</Eyebrow>
            <h2 className="font-display text-h1 text-foreground md:text-display-lg">The finish line is not the Marine Park. The finish line is the Circular Economy Hub.</h2>
            <p className="text-base leading-8 text-muted-foreground">
              PWAM&apos;s investor agenda and EcoStride&apos;s event platform now point to the same outcome: turning Malindi&apos;s plastic crisis into infrastructure, compliance pathways, and locally anchored green growth.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Manufacturers",
                copy: "A visible compliance pathway for Extended Producer Responsibility and material recovery."
              },
              {
                title: "Tourism & Trade",
                copy: "A cleaner coastline, stronger destination story, and a more credible sustainability proposition."
              },
              {
                title: "Finance & Impact",
                copy: "A practical green asset story tied to circular infrastructure, enterprise growth, and measurable environmental outcomes."
              }
            ].map((item) => (
              <div key={item.title} className="space-y-3 border-t border-sand-200 pt-4">
                <Eyebrow>{item.title}</Eyebrow>
                <h3 className="font-display text-h3 text-foreground">{item.title}</h3>
                <p className="text-sm leading-7 text-muted-foreground">{item.copy}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      <Section>
        <Reveal className="space-y-10">
          <div className="flex items-end justify-between gap-4">
            <div className="max-w-2xl space-y-3">
              <Eyebrow>Stories</Eyebrow>
              <h2 className="font-display text-h1 text-foreground md:text-display-lg">Field notes, race mornings, and the work after the medal.</h2>
            </div>
            <Link href="/blog" className="link-underline hidden text-sm font-semibold text-tide-600 md:inline-flex">
              Read all stories
            </Link>
          </div>

          {featuredPost ? (
            <article className="group grid gap-6 md:grid-cols-[1.3fr_minmax(0,1fr)]">
              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-sand-100">
                {featuredPost.featured_image_url ? (
                  <ResponsiveMedia
                    src={featuredPost.featured_image_url}
                    alt={featuredPost.title}
                    className="h-full"
                    mediaClassName={!featuredPostVideo ? "transition duration-500 group-hover:scale-[1.03]" : "h-full w-full"}
                    fillMode={featuredPostVideo ? "contain" : "cover"}
                    controls={featuredPostVideo}
                    videoMode={featuredPostVideo ? "player" : "ambient"}
                    preload={featuredPostVideo ? "auto" : "metadata"}
                  />
                ) : (
                  <ResponsiveMedia
                    src="/coastal-race.svg"
                    alt="Generic EcoStride shoreline story illustration"
                    className="h-full"
                    mediaClassName="transition duration-500 group-hover:scale-[1.03]"
                    fillMode="cover"
                  />
                )}
              </div>
              <div className="flex flex-col justify-center space-y-4">
                <Eyebrow>{(featuredPost.published_at || featuredPost.updated_at) ? formatDate(featuredPost.published_at || featuredPost.updated_at) : "Field note"}</Eyebrow>
                <Link href={`/blog/${featuredPost.url_slug}`} className="group block">
                  <h3 className="font-display text-h1 text-foreground transition-colors group-hover:text-forest-700">{featuredPost.title}</h3>
                </Link>
                <p className="max-w-xl text-base leading-8 text-muted-foreground">
                  {featuredPost.excerpt || "A closer look at the runners, the route, and the restoration work each race makes possible."}
                </p>
                <div>
                  <Link href={`/blog/${featuredPost.url_slug}`} className="link-underline text-sm font-semibold text-tide-600">
                    Read story
                  </Link>
                </div>
              </div>
            </article>
          ) : null}

          <div className="grid gap-8 md:grid-cols-2">
            {secondaryPosts.map((post) => (
              <EditorialCard
                key={post.slug}
                href={`/blog/${post.url_slug}`}
                imageUrl={post.featured_image_url}
                imageAlt={post.title}
                eyebrow={(post.published_at || post.updated_at) ? formatDate(post.published_at || post.updated_at) : "Story"}
                title={post.title}
                meta={post.excerpt || "Read more from the EcoStride coastline journal."}
              />
            ))}
          </div>
        </Reveal>
      </Section>

      <Section tone="forest">
        <Reveal className="space-y-8">
          <div className="max-w-2xl space-y-3">
            <Eyebrow className="text-sand-300">Gallery</Eyebrow>
            <h2 className="font-display text-h1 text-white md:text-display-lg">Proof of pace, place, and people.</h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {albumPreviews.map((album) => (
              <EditorialCard
                key={album.urlSlug}
                href={`/gallery/${album.urlSlug}`}
                imageUrl={album.imageUrl}
                imageAlt={album.imageAlt}
                eyebrow="Gallery album"
                title={album.title}
                meta="Open album"
                className="[&_h3]:text-white [&_.text-muted-foreground]:text-white/70 [&_p]:text-white/70 [&_[class*='text-tide-600']]:text-sand-300"
              />
            ))}
          </div>
        </Reveal>
      </Section>

      {sponsors.length > 0 ? (
        <section className="border-t border-sand-200 bg-sand-100 py-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 sm:px-6 md:px-8">
            <Eyebrow className="text-sand-700">Sponsors</Eyebrow>
            {sponsors.map((sponsor) => (
              <span key={sponsor.slug} className="text-sm font-medium text-sand-700">
                {sponsor.name || sponsor.title || sponsor.slug}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
