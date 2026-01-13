import { serverGet } from "../../../lib/api-server"

type Registration = {
  athlete_name: string
  email: string
  status: string
  slug: string
  event_title?: string
  event_slug?: string
  event_start_at?: string
  category_name?: string
  created_at?: string
}

type PageProps = {
  params: Promise<{ registrationId: string }>
}

export default async function Page({ params }: PageProps) {
  // Next.js 15+: params is a Promise, unwrap it
  const { registrationId } = await params

  try {
    const registration = await serverGet<Registration>(`/public/registrations/${registrationId}`, {
      next: { revalidate: 30 },
      cache: "no-store"
    })

    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Registration Confirmation
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Confirmation code: {registration.slug} • Status: {registration.status}
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Registration details</h2>
              <p className="text-sm text-muted-foreground">
                {registration.event_title || "Event"}{" "}
                {registration.event_start_at ? `• ${new Date(registration.event_start_at).toLocaleDateString()}` : ""}
              </p>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <p>Athlete: {registration.athlete_name}</p>
              <p>Email: {registration.email}</p>
              <p>Category: {registration.category_name ?? "General entry"}</p>
              <p>Registered: {registration.created_at ? new Date(registration.created_at).toLocaleDateString() : "-"}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              href={`/api/v1/public/registrations/${registration.slug}/confirmation.pdf`}
            >
              Download confirmation PDF
            </a>
            <a className="inline-flex text-sm font-semibold text-primary" href="/events">
              Browse other events
            </a>
          </div>
        </div>
      </main>
    )
  } catch (err) {
    console.error("Failed to load registration:", err)
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Confirmation not found</h1>
          <p className="text-sm text-muted-foreground">We could not load this registration.</p>
        </div>
      </main>
    )
  }
}
