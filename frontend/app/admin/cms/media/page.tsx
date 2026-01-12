"use client"

import Link from "next/link"

export default function Page() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Media Library</h1>
        <p className="text-sm text-slate-600">
          Media is now managed inside Blog & Media so you can attach images to posts in one place.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">
          Go to Blog & Media to upload images or reuse existing assets in posts.
        </p>
        <Link
          href="/admin/cms/posts"
          className="mt-4 inline-flex rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
        >
          Open Blog & Media
        </Link>
      </div>
    </main>
  )
}
