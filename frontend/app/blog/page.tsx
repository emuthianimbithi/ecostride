import Link from "next/link"
import { serverGet } from "../../lib/api-server"

type Post = {
  slug: string
    url_slug: string
    title: string
    excerpt: string
    updated_at: string
}

export default async function Page() {
  let posts: Post[] = []
  try {
    posts = await serverGet<Post[]>("/public/posts", { next: { revalidate: 60 } })
  } catch {
    posts = []
  }

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Blog</h1>
          <p className="text-sm text-muted-foreground md:text-base">Latest EcoStride stories and updates.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.url_slug}`}
              className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <h2 className="text-xl font-semibold text-foreground">{post.url_slug}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{post.excerpt || "Read more..."}</p>
              <span className="mt-3 inline-flex text-xs uppercase tracking-[0.2em] text-muted-foreground/80">
                {post.updated_at ? new Date(post.updated_at).toLocaleDateString() : "Draft"}
              </span>
            </Link>
          ))}
        </div>
        {posts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No posts yet.
          </div>
        )}
      </div>
    </main>
  )
}
