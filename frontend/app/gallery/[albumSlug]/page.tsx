import Image from "next/image"
import Link from "next/link"
import { serverGet } from "../../../lib/api-server"

type Album = {
  Title: string
  Description: string
  URLSlug: string
}

type MediaItem = {
  sort_order: number
  url: string
  path: string
  mime: string
  alt_text: string
  type: string
}

type AlbumResponse = {
  album: Album
  media: MediaItem[]
}

export default async function Page({ params }: { params: { albumSlug: string } }) {
  try {
    const data = await serverGet<AlbumResponse>(`/public/gallery/albums/${params.albumSlug}`, {
      next: { revalidate: 60 }
    })

    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="space-y-2">
            <Link className="text-xs uppercase tracking-[0.2em] text-muted-foreground" href="/gallery">
              Back to gallery
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{data.album.Title}</h1>
            <p className="text-sm text-muted-foreground md:text-base">{data.album.Description}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.media.map((item, index) => (
              <div key={`${item.url}-${index}`} className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                {item.url ? (
                  <Image
                    src={item.url}
                    alt={item.alt_text || data.album.Title}
                    width={800}
                    height={600}
                    className="h-56 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
                    Media unavailable
                  </div>
                )}
                {item.alt_text && <p className="mt-2 text-xs text-muted-foreground">{item.alt_text}</p>}
              </div>
            ))}
            {data.media.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
                No photos uploaded yet.
              </div>
            )}
          </div>
        </div>
      </main>
    )
  } catch {
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Album not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this gallery album.</p>
        </div>
      </main>
    )
  }
}
