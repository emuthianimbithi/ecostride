import { serverGet } from "../../../lib/api-server"

type Registration = {
  AthleteName: string
  Email: string
  Status: string
  Slug: string
  EventTitle?: string
  EventSlug?: string
  EventStartAt?: string
  CategoryName?: string
  CreatedAt?: string
}

export default async function Page({ params }: { params: { registrationId: string } }) {
  try {
    const registration = await serverGet<Registration>(`/public/registrations/${params.registrationId}`, {
      next: { revalidate: 30 }
    })

    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Registration Confirmation
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Confirmation code: {registration.Slug} • Status: {registration.Status}
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Registration details</h2>
              <p className="text-sm text-muted-foreground">
                {registration.EventTitle || "Event"}{" "}
                {registration.EventStartAt ? `• ${new Date(registration.EventStartAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <p>Athlete: {registration.AthleteName}</p>
              <p>Email: {registration.Email}</p>
              <p>Category: {registration.CategoryName ?? "General entry"}</p>
              <p>Registered: {registration.CreatedAt ? new Date(registration.CreatedAt).toLocaleDateString() : "-"}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              href={`/api/v1/public/registrations/${registration.Slug}/confirmation.pdf`}
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
  } catch {
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
