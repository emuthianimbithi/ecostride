export default function Loading() {
  return (
    <main className="space-y-4">
      <div className="h-8 w-44 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    </main>
  )
}
