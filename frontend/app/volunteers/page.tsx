"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiGet, apiPost } from "../../lib/api-client"
import { Eyebrow } from "../../components/eyebrow"

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
    <main className="px-6 py-12 md:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-8">
          <div className="space-y-3">
            <Eyebrow>Volunteers</Eyebrow>
            <h1 className="font-display text-h1 text-foreground md:text-display-lg">The event only feels premium when the operations crew is treated like part of the story.</h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground">
              Join cleanup shifts, check-in teams, route support, and photo crews for upcoming EcoStride weekends.
            </p>
          </div>

          <div className="editorial-placeholder relative min-h-[420px] overflow-hidden">
            <div className="grain-overlay" />
            <div className="absolute inset-x-0 bottom-0 bg-forest-900/78 p-6 text-white">
              <p className="font-display text-2xl">A volunteer holding the line matters as much as a runner crossing it.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {["Check-in", "Route support", "Cleanup crew"].map((item) => (
              <div key={item} className="space-y-2 border-t border-sand-200 pt-4">
                <h2 className="font-display text-h3 text-foreground">{item}</h2>
                <p className="text-sm leading-7 text-muted-foreground">Short, clear roles for people who want to help without chasing logistics.</p>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 border border-sand-200 bg-sand-50 p-6 lg:self-start"
        >
          <div className="space-y-2">
            <Eyebrow>Application</Eyebrow>
            <p className="text-sm leading-7 text-muted-foreground">Tell the team where you can help and which event you care about most.</p>
          </div>
          <input
            placeholder="Name"
            className="w-full rounded-full border border-sand-300 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
            {...form.register("name")}
          />
          <input
            placeholder="Email"
            type="email"
            className="w-full rounded-full border border-sand-300 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
            {...form.register("email")}
          />
          <input
            placeholder="Phone (optional)"
            className="w-full rounded-full border border-sand-300 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
            {...form.register("phone")}
          />
          <select
            className="w-full rounded-full border border-sand-300 bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
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
            <p className="text-xs uppercase tracking-[0.24em] text-tide-600">Areas of interest</p>
            {["Check-in", "Water points", "Route marshal", "Cleanup crew", "Media"].map((role) => (
              <label key={role} className="flex items-center gap-2">
                <input type="checkbox" value={role} {...form.register("roles")} />
                {role}
              </label>
            ))}
          </div>
          <textarea
            placeholder="Notes"
            className="w-full rounded-[1.25rem] border border-sand-300 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
            rows={4}
            {...form.register("notes")}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {status && <p className="text-sm text-emerald-700">{status}</p>}
          <button
            type="submit"
            className="button-lift rounded-full bg-sand-300 px-5 py-3 text-sm font-semibold text-forest-900 transition hover:bg-sand-200"
          >
            Apply to volunteer
          </button>
        </form>
      </div>
    </main>
  )
}
