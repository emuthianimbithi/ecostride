import { BlogHero } from "../../../components/blog-hero"
import { CMSBlocks } from "../../../components/cms-blocks"
import { Eyebrow } from "../../../components/eyebrow"
import { Reveal } from "../../../components/reveal"
import { Section } from "../../../components/section"
import { formatDate } from "../../../lib/format"
import { serverGet } from "../../../lib/api-server"

type Post = {
  title: string
  content: unknown
  excerpt: string
  published_at?: string | null
  updated_at?: string | null
  featured_image_url?: string
  hero_style?: any
  hero_show_title?: boolean
}

type PageProps = {
  params: Promise<{ slug: string }>
}

function publishedLabel(post: Post) {
  return formatDate(post.published_at || post.updated_at)
}

export default async function Page({ params }: PageProps) {
  try {
    const { slug } = await params
    const post = await serverGet<Post>(`/public/posts/${slug}`, { next: { revalidate: 60 }, cache: "no-store" })
    const content = post.content
    const body =
      typeof content === "string"
        ? content
        : typeof content === "object" && content !== null
          ? (() => {
              const record = content as Record<string, unknown>
              if (typeof record.body === "string") return record.body
              if (typeof record.text === "string") return record.text
              return ""
            })()
          : ""

    return (
      <main>
        <Section>
          <Reveal className="space-y-10">
            <div className="mx-auto max-w-3xl space-y-3">
              <Eyebrow>{publishedLabel(post)}</Eyebrow>
              {!post.featured_image_url ? (
                <>
                  <h1 className="font-display text-h1 text-foreground md:text-display-lg">{post.title}</h1>
                  {post.excerpt ? <p className="text-lg leading-relaxed text-muted-foreground">{post.excerpt}</p> : null}
                </>
              ) : null}
            </div>

            {post.featured_image_url ? (
              <BlogHero
                imageUrl={post.featured_image_url}
                title={post.title}
                excerpt={post.excerpt}
                showTitle={post.hero_show_title ?? true}
                heroStyle={post.hero_style ?? null}
              />
            ) : null}

            <article className="mx-auto max-w-prose space-y-6 text-lg leading-relaxed text-foreground/85">
              {Array.isArray(content) ? (
                <CMSBlocks blocks={content as any} />
              ) : body ? (
                <div className="whitespace-pre-wrap">{body}</div>
              ) : (
                <div className="text-sm text-muted-foreground">No content yet.</div>
              )}
            </article>
          </Reveal>
        </Section>
      </main>
    )
  } catch {
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="font-display text-h1 text-foreground">Post not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this post.</p>
        </div>
      </main>
    )
  }
}
