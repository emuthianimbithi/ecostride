import { CMSBlocks } from "../../../components/cms-blocks"
import { BlogHero } from "../../../components/blog-hero"
import { serverGet } from "../../../lib/api-server"

type Post = {
  title: string
  content: unknown
  excerpt: string
  published_at: string
  featured_image_url?: string
  hero_style?: any
  hero_show_title?: boolean
}

type PageProps = {
    params: Promise<{ slug: string }>
}

export default async function Page({ params }: PageProps) {
  try {
      const { slug } = await params
      console.log("Fetching post with slug:", slug);
    const post = await serverGet<Post>(`/public/posts/${slug}`, { next: { revalidate: 60 }, cache : "no-store" })
      console.log("Fetched post:", post);
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
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-5xl space-y-10">
          {post.featured_image_url ? (
            <BlogHero
              imageUrl={post.featured_image_url}
              title={post.title}
              excerpt={post.excerpt}
              showTitle={post.hero_show_title ?? true}
              heroStyle={post.hero_style ?? null}
            />
          ) : (
            <div className="mx-auto max-w-3xl space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{post.title}</h1>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {post.published_at ? new Date(post.published_at).toLocaleDateString() : "Draft"}
              </p>
            </div>
          )}

          <div className="mx-auto max-w-3xl">
            {!post.featured_image_url ? (post.excerpt ? <p className="text-sm text-muted-foreground md:text-base">{post.excerpt}</p> : null) : null}
          </div>

          <article className="mx-auto max-w-3xl space-y-4 text-[15px] leading-relaxed text-foreground/80">
            {Array.isArray(content) ? (
              <CMSBlocks blocks={content as any} />
            ) : body ? (
              <div className="whitespace-pre-wrap">{body}</div>
            ) : (
              <div className="text-sm text-muted-foreground">No content yet.</div>
            )}
          </article>
        </div>
      </main>
    )
  } catch(error) {
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Post not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this post.</p>
        </div>
      </main>
    )
  }
}
