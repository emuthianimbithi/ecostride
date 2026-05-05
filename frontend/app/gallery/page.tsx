import Link from "next/link"
import { Eyebrow } from "../../components/eyebrow"
import { Reveal } from "../../components/reveal"
import { ResponsiveMedia, isVideoMedia } from "../../components/responsive-media"
import { Section } from "../../components/section"
import { serverGet } from "../../lib/api-server"

type Album = {
  slug: string
  title: string
  description: string
  url_slug: string
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
    mime?: string
    type?: string
  }>
}

export default async function Page() {
  let albums: Album[] = []
  try {
    albums = await serverGet<Album[]>("/public/gallery/albums", { next: { revalidate: 60 } })
  } catch {
    albums = []
  }

  const previews = await Promise.all(
    albums.map(async (album) => {
      const detail = await serverGet<AlbumDetailResponse>(`/public/gallery/albums/${album.url_slug}`, {
        next: { revalidate: 60 }
      }).catch(() => null)

      return {
        ...album,
        media: detail?.media?.slice(0, 4) ?? []
      }
    })
  )

  return (
    <main>
      <Section>
        <Reveal className="space-y-12">
          <div className="max-w-2xl space-y-3">
            <Eyebrow>Gallery</Eyebrow>
            <h1 className="font-display text-h1 text-foreground md:text-display-lg">Albums from race days, cleanup crews, and the coastline in motion.</h1>
          </div>

          <div className="grid gap-10 md:grid-cols-2">
            {previews.map((album) => (
              <Link key={album.slug} href={`/gallery/${album.url_slug}`} className="group block space-y-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand-100">
                  <div className="grid h-full grid-cols-2 grid-rows-2 gap-[1px] bg-sand-200">
                    {Array.from({ length: 4 }).map((_, index) => {
                      const item = album.media[index]
                      if (item?.url) {
                        const video = isVideoMedia(item.url, item.mime, item.type)
                        return (
                          <div key={`${item.url}-${index}`} className="relative min-h-0 min-w-0 overflow-hidden bg-sand-100">
                            <ResponsiveMedia
                              src={item.url}
                              alt={item.alt_text || album.title}
                              mime={item.mime}
                              type={item.type}
                              className="h-full rounded-none"
                              mediaClassName={video ? "h-full w-full" : "transition duration-500 group-hover:scale-[1.03]"}
                              fillMode="cover"
                              controls={false}
                              videoMode="ambient"
                              autoPlay={video}
                              muted={video}
                              loop={video}
                              playsInline
                            />
                          </div>
                        )
                      }

                      return <div key={`${album.slug}-${index}`} className="editorial-placeholder" />
                    })}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-forest-900/85 p-4 transition group-hover:bg-forest-900/92">
                    <h2 className="font-display text-h3 text-white">{album.title}</h2>
                  </div>
                </div>
                <p className="max-w-xl text-sm leading-7 text-muted-foreground">{album.description}</p>
              </Link>
            ))}

            {previews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No albums yet. The first one will appear here when media is published.</p>
            ) : null}
          </div>
        </Reveal>
      </Section>
    </main>
  )
}
