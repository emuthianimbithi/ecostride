"use client"

import { useEffect, useState } from "react"
import { apiGet } from "../../../lib/api-client"
import { formatDate, formatDuration } from "../../../lib/format"

type ResultRow = {
  BibNumber: number
  Name: string
  CategoryName: string
  Gender: string
  Age?: number
  FinishSeconds: number
  PositionOverall?: number
}

type Event = {
  Title: string
  Location: string
  StartAt: string
  ResultsPublished: boolean
}

export default function Page({ params }: { params: { eventSlug: string } }) {
  const [results, setResults] = useState<ResultRow[]>([])
  const [query, setQuery] = useState({ bib: "", name: "", category: "" })
  const [event, setEvent] = useState<Event | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaderboardGroup, setLeaderboardGroup] = useState("overall")
  const [leaderboardFilter, setLeaderboardFilter] = useState("")

  const loadResults = async () => {
    try {
      const data = await apiGet<ResultRow[]>(`/public/results/events/${params.eventSlug}`)
      setResults(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results")
    }
  }

  const loadEvent = async () => {
    try {
      const data = await apiGet<Event>(`/public/events/${params.eventSlug}`)
      setEvent(data)
    } catch {
      setEvent(null)
    }
  }

  const handleSearch = async () => {
    const paramsValue = new URLSearchParams()
    if (query.bib) paramsValue.set("bib", query.bib)
    if (query.name) paramsValue.set("name", query.name)
    if (query.category) paramsValue.set("category", query.category)
    try {
      const data = await apiGet<ResultRow[]>(`/public/results/events/${params.eventSlug}/search?${paramsValue}`)
      setResults(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    }
  }

  const loadLeaderboard = async () => {
    const paramsValue = new URLSearchParams()
    paramsValue.set("group", leaderboardGroup)
    if (leaderboardFilter) {
      paramsValue.set("filter", leaderboardFilter)
    }
    try {
      const data = await apiGet<ResultRow[]>(
        `/public/results/events/${params.eventSlug}/leaderboard?${paramsValue.toString()}`
      )
      setResults(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard")
    }
  }

  useEffect(() => {
    void loadResults()
    void loadEvent()
  }, [])

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {event?.Title || "Event Results"}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {event ? `${event.Location} • ${formatDate(event.StartAt)}` : "Search by bib, name, or category."}
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm md:grid-cols-5">
          <input
            value={query.bib}
            onChange={(e) => setQuery({ ...query, bib: e.target.value })}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Bib number"
          />
          <input
            value={query.name}
            onChange={(e) => setQuery({ ...query, name: e.target.value })}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Name"
          />
          <input
            value={query.category}
            onChange={(e) => setQuery({ ...query, category: e.target.value })}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Category"
          />
          <button
            onClick={handleSearch}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Search
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={leaderboardGroup}
            onChange={(e) => setLeaderboardGroup(e.target.value)}
            className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="overall">Overall leaderboard</option>
            <option value="category">By category</option>
            <option value="gender">By gender</option>
            <option value="agegroup">By age group</option>
          </select>
          <input
            value={leaderboardFilter}
            onChange={(e) => setLeaderboardFilter(e.target.value)}
            className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Filter (e.g. 10K, Female)"
          />
          <button
            onClick={loadLeaderboard}
            className="rounded-full border border-primary/30 px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary/50"
          >
            View leaderboard
          </button>
        </div>

        {error && (
          <p className="text-sm text-destructive">
            {error.toLowerCase().includes("not published")
              ? "Results are not published yet. Check back after race day."
              : error}
          </p>
        )}

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Bib</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Position</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={`${row.BibNumber}-${row.Name}`} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium text-foreground">{row.BibNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.Name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.CategoryName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDuration(row.FinishSeconds)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.PositionOverall ?? "-"}</td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No results found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
