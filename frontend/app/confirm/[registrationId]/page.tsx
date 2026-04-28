import Link from "next/link"
import { serverGet } from "../../../lib/api-server"
import { AutoPrint } from "../../../components/auto-print"
import { RegistrationUpsertClient } from "../../../components/registration-upsert-client"

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
    searchParams?: Promise<{ print?: string }>
}

function formatDateSafe(value?: string) {
    if (!value) return ""
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString()
}

function estimateImpactMeters(categoryName?: string) {
    const name = String(categoryName ?? "").toUpperCase()
    if (name.includes("42")) return 35
    if (name.includes("21")) return 24
    if (name.includes("10")) return 14
    if (name.includes("5")) return 9
    return 12
}

export default async function Page({ params, searchParams }: PageProps) {
    const { registrationId } = await params
    const sp = (await searchParams) ?? {}
    const printMode = String(sp.print ?? "") === "1"

    try {
        const registration = await serverGet<Registration>(`/public/registrations/${registrationId}`, {
            next: { revalidate: 30 },
            cache: "no-store"
        })

        const eventDate = registration.event_start_at ? formatDateSafe(registration.event_start_at) : ""
        const registeredDate = registration.created_at ? formatDateSafe(registration.created_at) : ""
        const fundedMeters = estimateImpactMeters(registration.category_name)

        const ticket = (
            <section
                id="ticket"
                className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm print:shadow-none print:border-black/20"
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">EcoStride Association</p>
                        <h2 className="text-xl font-semibold text-foreground">Registration Ticket</h2>
                        <p className="text-sm text-muted-foreground">
                            {(registration.event_title || "Event") + (eventDate ? ` • ${eventDate}` : "")}
                        </p>
                    </div>

                    <div className="rounded-xl border border-border bg-background px-4 py-2 text-right print:border-black/20">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Code</p>
                        <p className="text-lg font-semibold text-foreground">{registration.slug}</p>
                    </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Athlete</p>
                        <p className="text-foreground">{registration.athlete_name}</p>
                    </div>

                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Email</p>
                        <p className="text-foreground">{registration.email}</p>
                    </div>

                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Category</p>
                        <p className="text-foreground">{registration.category_name ?? "General entry"}</p>
                    </div>

                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Registered</p>
                        <p className="text-foreground">{registeredDate || "-"}</p>
                    </div>
                </div>

                <div className="mt-6 rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground print:border-black/20">
                    <p className="font-semibold text-foreground">What to bring</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li>Confirmation code (printed or on your phone)</li>
                        <li>Your ID</li>
                        <li>Reusable water bottle</li>
                    </ul>
                    <p className="mt-4 text-xs text-muted-foreground">
                        If you need help, contact EcoStride support. Keep this confirmation for event day check-in.
                    </p>
                </div>
            </section>
        )

        // ✅ Print mode = ONLY the ticket + auto-print
        if (printMode) {
            return (
                <main className="px-6 py-8">
                    <AutoPrint enabled />
                    {ticket}

                    <style>{`
            @media print {
              /* Print ONLY the ticket section */
              body * { visibility: hidden !important; }
              #ticket, #ticket * { visibility: visible !important; }
              #ticket { position: absolute !important; left: 0; top: 0; width: 100% !important; }

              /* Remove margins for cleaner PDF */
              @page { margin: 12mm; }
            }
          `}</style>
                </main>
            )
        }

        // Normal mode: show ticket + actions
        return (
            <main className="px-6 py-12 md:py-16">
                <div className="mx-auto max-w-4xl space-y-8">
                    <RegistrationUpsertClient
                        registration={{
                            slug: registration.slug,
                            email: registration.email,
                            athlete_name: registration.athlete_name,
                            event_title: registration.event_title,
                            event_slug: registration.event_slug,
                            event_start_at: registration.event_start_at,
                            category_name: registration.category_name,
                            status: registration.status,
                            created_at: registration.created_at
                        }}
                    />
                    <div className="space-y-2">
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                            Registration Confirmation
                        </h1>
                        <p className="text-sm text-muted-foreground md:text-base">
                            Confirmation code: <span className="font-semibold text-foreground">{registration.slug}</span> • Status:{" "}
                            {registration.status}
                        </p>
                    </div>

                    <section className="rounded-2xl border border-forest-200 bg-gradient-to-br from-forest-50 via-sand-50 to-tide-50 p-6">
                        <p className="text-xs uppercase tracking-[0.2em] text-forest-700">Impact Card</p>
                        <h2 className="mt-2 font-display text-h2 text-text-strong">
                            You just funded ~{fundedMeters} meters of shoreline action.
                        </h2>
                        <p className="mt-2 text-sm text-foreground/85">
                            Share this card with your crew and invite them to run for estuaries.
                        </p>
                    </section>

                    {ticket}

                    <div className="flex flex-wrap gap-3">
                        {/* Auto “download” custom PDF by printing only the ticket */}
                        <a
                            className="inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                            href={`/confirm/${registration.slug}?print=1`}
                        >
                            Download EcoStride PDF
                        </a>

                        {/* Optional: your backend PDF */}
                        <a
                            className="inline-flex rounded-full border border-border bg-background px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
                            href={`/api/v1/public/registrations/${registration.slug}/confirmation.pdf`}
                        >
                            Download backend PDF
                        </a>

                        <Link className="inline-flex text-sm font-semibold text-primary" href="/events">
                            Browse other events
                        </Link>
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
