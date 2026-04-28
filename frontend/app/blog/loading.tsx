export default function Loading() {
  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </div>
    </main>
  )
}
