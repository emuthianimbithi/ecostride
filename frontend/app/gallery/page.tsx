import Link from "next/link"
import { serverGet } from "../../lib/api-server"

type Album = {
  slug: string
  title: string
  description: string
  url_slug: string
}

export default async function Page() {
  let albums: Album[] = []
  try {
    albums = await serverGet<Album[]>("/public/gallery/albums", { next: { revalidate: 60 } })
  } catch {
    albums = []
  }

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Gallery</h1>
          <p className="text-sm text-muted-foreground md:text-base">Highlights from past events.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {albums.map((album) => (
            <Link
              key={album.slug}
              href={`/gallery/${album.url_slug}`}
              className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <h2 className="text-xl font-semibold text-foreground">{album.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{album.description}</p>
            </Link>
          ))}
          {albums.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No albums yet.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
