import Link from "next/link"
import { serverGet } from "../../../lib/api-server"
import { GalleryGrid, type GalleryItem } from "../../../components/gallery-grid"

type Album = {
  title: string
  description: string
  url_slug: string
}

type MediaItem = GalleryItem & {
  sort_order: number
  path: string
}

type AlbumResponse = {
  album: Album
  media: MediaItem[]
}

type PageProps = {
  params: Promise<{ albumSlug: string }>
}

export default async function Page({ params }: PageProps) {
  const { albumSlug } = await params

  try {
    const data = await serverGet<AlbumResponse>(`/public/gallery/albums/${albumSlug}`, {
      next: { revalidate: 60 },
      cache: "no-store"
    })

    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="space-y-2">
            <Link className="text-xs uppercase tracking-[0.2em] text-muted-foreground" href="/gallery">
              Back to gallery
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{data.album.title}</h1>
            <p className="text-sm text-muted-foreground md:text-base">{data.album.description}</p>
          </div>

          <GalleryGrid items={data.media} fallbackAlt={data.album.title} />
        </div>
      </main>
    )
  } catch (err) {
    console.error("Failed to load album:", err)
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
