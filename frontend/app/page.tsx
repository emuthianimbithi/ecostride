import Image from "next/image"
import Link from "next/link"
import { serverGet } from "../lib/api-server"
import { formatDate, registrationWindowLabel, registrationWindowStatus } from "../lib/format"
import { normalizeSponsor } from "../lib/normalize-sponsor"

// API response types (snake_case)
type EventResponse = {
    slug: string
    url_slug: string
    title: string
    type: string
    location: string
    start_at: string
    status: string
    reg_open_at?: string | null
    reg_close_at?: string | null
    results_published?: boolean
}

type PostResponse = {
    slug: string
    url_slug: string
    title: string
    excerpt: string
    published_at: string
}

type AlbumResponse = {
    Slug: string
    Title: string
    URLSlug: string
    Description: string
}

// Internal types (PascalCase for consistency with existing code)
type Event = {
    Slug: string
    URLSlug: string
    Title: string
    Type: string
    Location: string
    StartAt: string
    Status: string
    RegOpenAt?: string | null
    RegCloseAt?: string | null
    ResultsPublished?: boolean
}

type Post = {
    Slug: string
    URLSlug: string
    Title: string
    Excerpt: string
    PublishedAt: string
}

type Album = {
    Slug: string
    Title: string
    URLSlug: string
    Description: string
}

// Mapper functions
function mapEvent(event: EventResponse): Event {
    return {
        Slug: event.slug,
        URLSlug: event.url_slug,
        Title: event.title,
        Type: event.type,
        Location: event.location,
        StartAt: event.start_at,
        Status: event.status,
        RegOpenAt: event.reg_open_at,
        RegCloseAt: event.reg_close_at,
        ResultsPublished: event.results_published
    }
}

function mapPost(post: PostResponse): Post {
    return {
        Slug: post.slug,
        URLSlug: post.url_slug,
        Title: post.title,
        Excerpt: post.excerpt,
        PublishedAt: post.published_at
    }
}

function mapAlbum(album: AlbumResponse): Album {
    return {
        Slug: album.Slug,
        Title: album.Title,
        URLSlug: album.URLSlug,
        Description: album.Description
    }
}

export default async function HomePage() {
    const [eventsResponse, postsResponse, sponsors, albumsResponse] = await Promise.all([
        serverGet<EventResponse[]>("/public/events", { next: { revalidate: 60 } }).catch(() => []),
        serverGet<PostResponse[]>("/public/posts", { next: { revalidate: 60 } }).catch(() => []),
        serverGet<any[]>("/public/sponsors?placement=HOME_STRIP", { next: { revalidate: 60 } }).catch(() => []),
        serverGet<AlbumResponse[]>("/public/gallery/albums", { next: { revalidate: 60 } }).catch(() => [])
    ])

    // Map API responses to internal types
    const events = eventsResponse.map(mapEvent)
    const posts = postsResponse.map(mapPost)
    const albums = albumsResponse.map(mapAlbum)
    const normalizedSponsors = sponsors.map(normalizeSponsor)

    const upcoming = [...events]
        .filter((event) => event.StartAt)
        .sort((a, b) => new Date(a.StartAt).getTime() - new Date(b.StartAt).getTime())

    const nextEvent = upcoming[0]
    const featuredEvents = upcoming.slice(0, 3)
    console.log("Events:", featuredEvents)
    const latestPosts = posts.slice(0, 3)
    console.log("Posts:", latestPosts)
    const featuredAlbums = albums.slice(0, 3)
    console.log("Albums:", albums)

    return (
        <main className="px-4 pb-16 sm:px-6 md:px-8">
            <section className="mx-auto mt-6 grid max-w-6xl gap-10 rounded-[32px] bg-card/80 p-8 shadow-[0_35px_70px_-50px_rgba(15,60,50,0.35)] backdrop-blur md:p-12">
                <div className="flex flex-col gap-4">
          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            EcoStride Association • Malindi
          </span>
                    <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                        Run, learn, and protect the coast - one community event at a time.
                    </h1>
                    <p className="max-w-2xl text-base text-muted-foreground">
                        EcoStride brings together marathons, seminars, and beach cleanups with modern registration,
                        seamless payments, and transparent results.
                    </p>
                    <div className="flex flex-wrap gap-4 pt-2">
                        <Link className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground" href="/events">
                            Explore events
                        </Link>
                        <Link
                            className="rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground"
                            href="/support"
                        >
                            Support a cause
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <h3 className="text-lg font-semibold text-foreground">Next event</h3>
                        <p className="text-sm text-muted-foreground">{nextEvent?.Title || "Stay tuned for updates"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {nextEvent ? `${formatDate(nextEvent.StartAt)} • ${nextEvent.Location}` : "New events arriving soon"}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <h3 className="text-lg font-semibold text-foreground">Live results</h3>
                        <p className="text-sm text-muted-foreground">
                            {events.find((event) => event.ResultsPublished)?.Title || "Results publish after race day"}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">Search bibs and rankings online</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <h3 className="text-lg font-semibold text-foreground">Volunteer with us</h3>
                        <p className="text-sm text-muted-foreground">Beach cleanups, water points, and logistics support</p>
                        <p className="mt-2 text-xs text-muted-foreground">Sign up to be part of the crew</p>
                    </div>
                </div>
            </section>

            <section className="mx-auto mt-12 max-w-6xl space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold text-foreground">Upcoming events</h2>
                        <p className="text-sm text-muted-foreground">Register for marathons, seminars, and cleanups.</p>
                    </div>
                    <Link className="text-sm font-semibold text-foreground" href="/events">
                        View all events
                    </Link>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {featuredEvents.map((event) => {
                        const regStatus = registrationWindowStatus(event.RegOpenAt, event.RegCloseAt)
                        return (
                            <Link
                                key={event.Slug}
                                href={`/events/${event.URLSlug}`}
                                className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-[2px] hover:border-primary/40"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{event.Type}</span>
                                    <span
                                        className={`text-xs font-semibold ${regStatus === "open" ? "text-emerald-600" : regStatus === "closed" ? "text-rose-600" : "text-amber-600"
                                        }`}
                                    >
                    {registrationWindowLabel(event.RegOpenAt, event.RegCloseAt)}
                  </span>
                                </div>
                                <h3 className="mt-4 text-lg font-semibold text-foreground group-hover:text-primary">{event.Title}</h3>
                                <p className="mt-1 text-sm text-muted-foreground">{event.Location}</p>
                                <p className="mt-3 text-xs uppercase text-muted-foreground">{formatDate(event.StartAt)}</p>
                            </Link>
                        )
                    })}
                    {featuredEvents.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
                            No events scheduled yet. Check back soon or volunteer in the meantime.
                        </div>
                    )}
                </div>
            </section>

            <section className="mx-auto mt-12 max-w-6xl rounded-3xl bg-primary text-primary-foreground">
                <div className="grid gap-8 p-8 md:grid-cols-[1.2fr_1fr] md:p-10">
                    <div>
                        <h2 className="text-2xl font-semibold">Support coastal impact</h2>
                        <p className="mt-2 text-sm text-primary-foreground/80">
                            Every donation funds race scholarships, community cleanups, and youth sports clinics.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <Link
                                className="rounded-full bg-primary-foreground px-5 py-2 text-sm font-semibold text-primary"
                                href="/support"
                            >
                                Donate or shop
                            </Link>
                            <Link
                                className="rounded-full border border-primary-foreground/40 px-5 py-2 text-sm font-semibold"
                                href="/volunteers"
                            >
                                Volunteer
                            </Link>
                        </div>
                    </div>
                    <div className="rounded-2xl bg-primary-foreground/10 p-5">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">
                            Why it matters
                        </h3>
                        <ul className="mt-4 space-y-2 text-sm text-primary-foreground/80">
                            <li>• Cleanups protect marine life and tourism.</li>
                            <li>• Events create safe spaces for youth athletes.</li>
                            <li>• Partnerships grow local business visibility.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="mx-auto mt-12 max-w-6xl space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold text-foreground">Sponsors & partners</h2>
                        <p className="text-sm text-muted-foreground">The organizations that fuel EcoStride experiences.</p>
                    </div>
                    <Link className="text-sm font-semibold text-foreground" href="/sponsors">
                        Meet all sponsors
                    </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {normalizedSponsors.map((sponsor) => (
                        <Link
                            key={sponsor.slug}
                            href={`/sponsors/${sponsor.url_slug}`}
                            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                        >
                            {sponsor.logo.url ? (
                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Image
                      src={sponsor.logo.url}
                      alt={sponsor.logo.alt || sponsor.name}
                      width={64}
                      height={64}
                      className="h-8 w-8 object-contain"
                  />
                </span>
                            ) : (
                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-xs font-semibold text-foreground">
                  {sponsor.name.slice(0, 2).toUpperCase()}
                </span>
                            )}
                            <span className="font-medium text-foreground">{sponsor.name}</span>
                        </Link>
                    ))}
                    {normalizedSponsors.length === 0 && (
                        <div className="text-sm text-muted-foreground">Sponsor highlights will appear here soon.</div>
                    )}
                </div>
            </section>

            <section className="mx-auto mt-12 max-w-6xl space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold text-foreground">Latest stories</h2>
                        <p className="text-sm text-muted-foreground">Training tips, recaps, and community highlights.</p>
                    </div>
                    <Link className="text-sm font-semibold text-foreground" href="/blog">
                        Read the blog
                    </Link>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {latestPosts.map((post) => (
                        <Link
                            key={post.Slug}
                            href={`/blog/${post.URLSlug}`}
                            className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-[2px] hover:border-primary/40"
                        >
                            <h3 className="text-lg font-semibold text-foreground">{post.Title}</h3>
                            <p className="mt-2 text-sm text-muted-foreground">{post.Excerpt || "Read more..."}</p>
                            <span className="mt-3 inline-flex text-xs uppercase text-muted-foreground">{formatDate(post.PublishedAt)}</span>
                        </Link>
                    ))}
                    {latestPosts.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
                            Stories are coming soon.
                        </div>
                    )}
                </div>
            </section>

            <section className="mx-auto mt-12 max-w-6xl space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold text-foreground">Gallery highlights</h2>
                        <p className="text-sm text-muted-foreground">Moments from the coast and the course.</p>
                    </div>
                    <Link className="text-sm font-semibold text-foreground" href="/gallery">
                        View gallery
                    </Link>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    {featuredAlbums.map((album) => (
                        <Link
                            key={album.Slug}
                            href={`/gallery/${album.URLSlug}`}
                            className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-[2px] hover:border-primary/40"
                        >
                            <h3 className="text-lg font-semibold text-foreground">{album.Title}</h3>
                            <p className="mt-2 text-sm text-muted-foreground">{album.Description}</p>
                        </Link>
                    ))}
                    {featuredAlbums.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
                            New album highlights are on the way.
                        </div>
                    )}
                </div>
            </section>
        </main>
    )
}