import Image from "next/image"
import Link from "next/link"
import { EditorialCard } from "../../components/editorial-card"
import { Eyebrow } from "../../components/eyebrow"
import { Reveal } from "../../components/reveal"
import { Section } from "../../components/section"
import { formatDate } from "../../lib/format"
import { serverGet } from "../../lib/api-server"

type Post = {
  slug: string
  url_slug: string
  title: string
  excerpt: string
  updated_at?: string | null
  published_at?: string | null
  featured_image_url?: string | null
}

function postDate(post: Post) {
  return formatDate(post.published_at || post.updated_at)
}

export default async function Page() {
  let posts: Post[] = []
  try {
    posts = await serverGet<Post[]>("/public/posts", { next: { revalidate: 60 }, cache: "no-store" })
  } catch {
    posts = []
  }

  const featuredPost = posts[0]
  const remainingPosts = posts.slice(1)

  return (
    <main>
      <Section>
        <Reveal className="space-y-12">
          <div className="max-w-2xl space-y-3">
            <Eyebrow>Stories</Eyebrow>
            <h1 className="font-display text-h1 text-foreground md:text-display-lg">Field notes from race mornings and the work after the finish line.</h1>
          </div>

          {featuredPost ? (
            <Link href={`/blog/${featuredPost.url_slug}`} className="group grid gap-6 md:grid-cols-[1.35fr_minmax(0,1fr)]">
              <div className="relative aspect-[16/8] overflow-hidden bg-sand-100">
                {featuredPost.featured_image_url ? (
                  <Image
                    src={featuredPost.featured_image_url}
                    alt={featuredPost.title}
                    fill
                    className="editorial-image object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="editorial-placeholder h-full w-full" />
                )}
              </div>
              <div className="flex flex-col justify-center space-y-4">
                <Eyebrow>{postDate(featuredPost)}</Eyebrow>
                <h2 className="font-display text-h1 text-foreground transition-colors group-hover:text-forest-700">
                  {featuredPost.title}
                </h2>
                <p className="max-w-xl text-base leading-8 text-muted-foreground">
                  {featuredPost.excerpt || "Long-form stories from the shoreline, the race route, and the cleanup work attached to every event."}
                </p>
              </div>
            </Link>
          ) : null}

          {remainingPosts.length > 0 ? (
            <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
              {remainingPosts.map((post) => (
                <EditorialCard
                  key={post.slug}
                  href={`/blog/${post.url_slug}`}
                  imageUrl={post.featured_image_url}
                  imageAlt={post.title}
                  eyebrow={postDate(post)}
                  title={post.title}
                  meta={post.excerpt || "Read more from the EcoStride journal."}
                />
              ))}
            </div>
          ) : null}

          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stories yet. The next race weekend will change that.</p>
          ) : null}
        </Reveal>
      </Section>
    </main>
  )
}
