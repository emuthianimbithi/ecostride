import Link from "next/link"
import { CopyLinkButton } from "../../../components/copy-link-button"
import { Eyebrow } from "../../../components/eyebrow"
import { GalleryGrid, type GalleryItem } from "../../../components/gallery-grid"
import { Reveal } from "../../../components/reveal"
import { Section } from "../../../components/section"
import { serverGet } from "../../../lib/api-server"

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
      <main>
        <Section>
          <Reveal className="space-y-10">
            <div className="mx-auto max-w-5xl space-y-4">
              <Link className="link-underline text-xs uppercase tracking-[0.24em] text-tide-600" href="/gallery">
                Back to gallery
              </Link>
              <Eyebrow>Gallery album</Eyebrow>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-3xl space-y-3">
                  <h1 className="font-display text-h1 text-foreground md:text-display-lg">{data.album.title}</h1>
                  <p className="text-base leading-8 text-muted-foreground">{data.album.description}</p>
                </div>
                <CopyLinkButton value={`/gallery/${data.album.url_slug}`} />
              </div>
            </div>

            <div className="mx-auto max-w-6xl space-y-4">
              <p className="text-xs tracking-[0.16em] text-muted-foreground">LIGHTBOX: ← → Esc</p>
              <GalleryGrid items={data.media} fallbackAlt={data.album.title} />
            </div>
          </Reveal>
        </Section>
      </main>
    )
  } catch (err) {
    console.error("Failed to load album:", err)
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="font-display text-h1 text-foreground">Album not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this gallery album.</p>
        </div>
      </main>
    )
  }
}
