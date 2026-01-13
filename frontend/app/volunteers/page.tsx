"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiGet, apiPost } from "../../lib/api-client"

const volunteerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  eventSlug: z.string().optional(),
  roles: z.array(z.string()).optional()
})

type VolunteerForm = z.infer<typeof volunteerSchema>

// snake_case matching backend API
type Event = {
  url_slug: string
  title: string
  start_at: string
}

export default function Page() {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const form = useForm<VolunteerForm>({ resolver: zodResolver(volunteerSchema) })

  useEffect(() => {
    apiGet<Event[]>("/public/events")
      .then(setEvents)
      .catch(() => setEvents([]))
  }, [])

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setStatus(null)
    try {
      await apiPost("/public/volunteers", {
        name: values.name,
        email: values.email,
        phone: values.phone,
        notes: values.notes,
        preferences: {
          event_slug: values.eventSlug,
          roles: values.roles ?? []
        }
      })
      setStatus("Thanks for signing up! We will reach out soon.")
      form.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit")
    }
  })

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Volunteer Signup</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Join upcoming cleanups, race day crews, and logistics teams.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4"
        >
          <input
            placeholder="Name"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            {...form.register("name")}
          />
          <input
            placeholder="Email"
            type="email"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            {...form.register("email")}
          />
          <input
            placeholder="Phone (optional)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            {...form.register("phone")}
          />
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            {...form.register("eventSlug")}
          >
            <option value="">Any event</option>
            {events.map((event, idx) => (
              <option key={`${event.url_slug}-${idx}`} value={event.url_slug}>
                {event.title} {event.start_at ? `(${new Date(event.start_at).toLocaleDateString()})` : ""}
              </option>
            ))}
          </select>
          <div className="space-y-2 text-sm text-foreground">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Areas of interest</p>
            {["Check-in", "Water points", "Route marshal", "Cleanup crew", "Media"].map((role) => (
              <label key={role} className="flex items-center gap-2">
                <input type="checkbox" value={role} {...form.register("roles")} />
                {role}
              </label>
            ))}
          </div>
          <textarea
            placeholder="Notes"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            rows={3}
            {...form.register("notes")}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {status && <p className="text-sm text-emerald-700">{status}</p>}
          <button
            type="submit"
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Submit
          </button>
        </form>
      </div>
    </main>
  )
}
