"use client"

import Link from "next/link"

export default function Page() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Check-In</h1>
        <p className="text-sm text-slate-600">Check-in tools now live inside the Race Day workspace.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">
          Go to Race Day to select an event, assign bibs, and mark athletes as checked in.
        </p>
        <Link
          href="/admin/bibs"
          className="mt-4 inline-flex rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
        >
          Open Race Day
        </Link>
      </div>
    </main>
  )
}
