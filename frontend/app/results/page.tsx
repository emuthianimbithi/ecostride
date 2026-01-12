import Link from "next/link"
import { serverGet } from "../../lib/api-server"
import { formatDate } from "../../lib/format"

type Event = {
  Slug: string
  URLSlug: string
  Title: string
  ResultsPublished: boolean
  StartAt: string
  Type: string
  Location: string
}

export default async function Page() {
  let events: Event[] = []
  try {
    events = await serverGet<Event[]>("/public/events", { next: { revalidate: 60 } })
  } catch {
    events = []
  }

  const published = events.filter((event) => event.ResultsPublished)

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Results</h1>
          <p className="text-sm text-muted-foreground md:text-base">Search results and rankings by event.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {published.map((event) => (
            <Link
              key={event.Slug}
              href={`/results/${event.URLSlug}`}
              className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-foreground">{event.Title}</h2>
                  <p className="text-sm text-muted-foreground">{event.Location}</p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {event.Type.replace("_", " ")}
                </span>
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-muted-foreground/80">
                {formatDate(event.StartAt)}
              </p>
            </Link>
          ))}
        </div>
        {published.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No results published yet.
          </div>
        )}
      </div>
    </main>
  )
}
