"use client"

import { useEffect, useMemo, useState, use } from "react"
import { useRouter, useParams } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiGet, apiPost } from "../../../lib/api-client"
import { formatDate, registrationWindowStatus } from "../../../lib/format"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"

// ---- snake_case Types ----

type EventCategory = {
  slug: string
  name: string
  price_kes_minor: number
  price_usd_minor?: number
  price_eur_minor?: number
}

type EventDetails = {
  title: string
  description: string
  status: string
  reg_open_at?: string | null
  reg_close_at?: string | null
  start_at?: string | null
}

type Waiver = {
  title: string
  content: string
}

type EventFormField = {
  slug: string
  key: string
  label: string
  type: string
  required: boolean
  options?: unknown
  order: number
}

const registrationSchema = z.object({
  categorySlug: z.string().optional(),
  athleteName: z.string().min(2, "Name required"),
  email: z.string().email(),
  phone: z.string().min(9),
  dob: z.string().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  residence: z.string().optional(),
  tshirtSize: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  medicalDeclaration: z.string().optional(),
  experience: z.string().optional(),
  extras: z.string().optional(),
  waiverAccepted: z.boolean().refine((value) => value, "Waiver acceptance required"),
  paymentMethod: z.enum(["stripe", "mpesa"]).optional(),
  currency: z.enum(["KES", "USD", "EUR"]).optional(),
  mpesaPhone: z.string().optional()
})

type RegistrationForm = z.infer<typeof registrationSchema>

const steps = ["Category", "Athlete", "Extras", "Waiver", "Payment"]

export default function Page() {
  // Use useParams for Client Component dynamic routes
  const params = useParams()
  const eventSlug = params.eventSlug as string

  const router = useRouter()
  const { toast } = useToast()
  const [event, setEvent] = useState<EventDetails | null>(null)
  const [categories, setCategories] = useState<EventCategory[]>([])
  const [waiver, setWaiver] = useState<Waiver | null>(null)
  const [formFields, setFormFields] = useState<EventFormField[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean | number>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      categorySlug: "",
      athleteName: "",
      email: "",
      phone: "",
      currency: "KES",
      paymentMethod: "stripe",
      waiverAccepted: false
    }
  })

  const stepFields = useMemo(
    () => [
      ["categorySlug"],
      [
        "athleteName",
        "email",
        "phone",
        "dob",
        "gender",
        "nationality",
        "residence",
        "tshirtSize",
        "emergencyName",
        "emergencyPhone"
      ],
      ["medicalDeclaration", "experience", "extras"],
      ["waiverAccepted"],
      ["paymentMethod", "currency", "mpesaPhone"]
    ],
    []
  )

  useEffect(() => {
    if (!eventSlug) return

    apiGet<EventDetails>(`/public/events/${eventSlug}`)
      .then(setEvent)
      .catch(() => setEvent(null))

    apiGet<EventCategory[]>(`/public/events/${eventSlug}/categories`)
      .then(setCategories)
      .catch(() => setCategories([]))

    apiGet<Waiver>(`/public/events/${eventSlug}/waiver/current`)
      .then(setWaiver)
      .catch(() => setWaiver(null))

    apiGet<EventFormField[]>(`/public/events/${eventSlug}/form-fields`)
      .then((data) => setFormFields([...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))))
      .catch(() => setFormFields([]))
  }, [eventSlug])

  const nextStep = async () => {
    setError(null)
    if (event && registrationWindowStatus(event.reg_open_at, event.reg_close_at) === "closed") {
      setError("Registration is closed for this event.")
      toast({ title: "Registration closed", description: "Registration is closed for this event.", variant: "destructive" })
      return
    }
    if (step === 2 && formFields.length > 0) {
      const errors: Record<string, string> = {}
      formFields.forEach((field) => {
        if (!field.required) return
        const value = fieldValues[field.key]
        if (field.type === "checkbox") {
          if (value !== true) {
            errors[field.key] = "This field is required."
          }
          return
        }
        if (value === undefined || value === null || String(value).trim() === "") {
          errors[field.key] = "This field is required."
        }
      })
      setFieldErrors(errors)
      if (Object.keys(errors).length > 0) {
        toast({ title: "Validation Error", description: "Please complete the required fields.", variant: "destructive" })
        return
      }
    }
    const fields = stepFields[step]
    if (fields) {
      if (step === 0 && categories.length > 0 && !form.getValues("categorySlug")) {
        form.setError("categorySlug", { type: "manual", message: "Select a category" })
        toast({ title: "Validation Error", description: "Select a category to continue.", variant: "destructive" })
        return
      }
      const valid = await form.trigger(fields as (keyof RegistrationForm)[])
      if (!valid) {
        toast({ title: "Validation Error", description: "Please fix the highlighted fields.", variant: "destructive" })
        return
      }
    }
    setStep((prev) => Math.min(prev + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const prevStep = () => {
    setStep((prev) => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const getCategoryPrice = (currency: string, category?: EventCategory | null) => {
    if (!category) return 0
    if (currency === "USD" && category.price_usd_minor) return category.price_usd_minor
    if (currency === "EUR" && category.price_eur_minor) return category.price_eur_minor
    return category.price_kes_minor
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setStatus("Creating registration...")

    try {
      const chosenCategory = categories.find((category) => category.slug === values.categorySlug)
      const currency = values.currency ?? "KES"
      const priceMinor = getCategoryPrice(currency, chosenCategory)
      const requiresPayment = priceMinor > 0
      const extrasPayload: Record<string, unknown> = {}
      if (values.extras) {
        extrasPayload.notes = values.extras
      }
      if (Object.keys(fieldValues).length > 0) {
        extrasPayload.form_fields = fieldValues
      }

      // Backend expects snake_case payload
      const registration = await apiPost<{Slug: string}>("/public/registrations", {
        event_slug: eventSlug,
        category_slug: values.categorySlug || undefined,
        athlete_name: values.athleteName,
        email: values.email,
        phone: values.phone,
        dob: values.dob ? new Date(values.dob).toISOString() : undefined,
        gender: values.gender,
        nationality: values.nationality,
        residence: values.residence,
        tshirt_size: values.tshirtSize,
        emergency_name: values.emergencyName,
        emergency_phone: values.emergencyPhone,
        medical_declaration: values.medicalDeclaration,
        experience: values.experience,
        extras: extrasPayload
      })

        console.log('registration', registration);

      localStorage.setItem("registration_slug", registration.Slug)

      if (!requiresPayment) {
        setStatus(null)
        router.push(`/confirm/${registration.Slug}`)
        return
      }

      if (values.paymentMethod === "stripe") {
        setStatus("Redirecting to Stripe...")
        const data = await apiPost<{ checkout_url: string }>(
          "/public/payments/stripe/checkout",
          { registration_slug: registration.Slug, currency },
          { headers: { "X-Idempotency-Key": crypto.randomUUID() } }
        )
        window.location.href = data.checkout_url
        return
      }

      const mpesaPhone = values.mpesaPhone || values.phone
      if (currency !== "KES") {
        throw new Error("M-Pesa only supports KES")
      }

      setStatus("Triggering M-Pesa STK...")
      const payment = await apiPost<{ payment_id: string }>(
        "/public/payments/mpesa/stk",
        { registration_slug: registration.Slug, phone: mpesaPhone },
        { headers: { "X-Idempotency-Key": crypto.randomUUID() } }
      )
      router.push(`/payment/${payment.payment_id}`)
    } catch (err) {
      toastApiError(toast, err)
      setStatus(null)
      setError(err instanceof Error ? err.message : "Registration failed")
    }
  })

  if (!event) {
    if (error) {
      return (
        <main className="px-6 py-12 md:py-16">
          <div className="mx-auto max-w-4xl space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Event not found</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </main>
      )
    }
    return (
      <main className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-4">
          <p className="text-sm text-muted-foreground">Loading event...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Register</h1>
          <p className="text-sm text-muted-foreground md:text-base">{event.title}</p>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {registrationWindowStatus(event.reg_open_at, event.reg_close_at) === "closed"
              ? "Registration closed"
              : `Event date ${formatDate(event.start_at)}`}
          </p>
        </div>

        {registrationWindowStatus(event.reg_open_at, event.reg_close_at) === "closed" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Registration is closed. Explore other upcoming events instead.
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {steps.map((label, index) => (
            <span key={label} className={index === step ? "text-primary font-semibold" : ""}>
              {label}
            </span>
          ))}
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-6 rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
        >
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Select category</h2>
              <div className="grid gap-3">
                {categories.map((category) => (
                  <label
                    key={category.slug}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background p-3 text-sm text-foreground"
                  >
                    <input type="radio" value={category.slug} {...form.register("categorySlug")} />
                    <span>
                      {category.name} • KES {(category.price_kes_minor / 100).toFixed(2)}
                    </span>
                  </label>
                ))}
                {categories.length === 0 && (
                  <p className="text-sm text-muted-foreground">This event has open registration without categories.</p>
                )}
                {form.formState.errors.categorySlug && (
                  <p className="text-sm text-destructive">{form.formState.errors.categorySlug.message}</p>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <input
                placeholder="Athlete name"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("athleteName")}
              />
              <input
                placeholder="Email"
                type="email"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("email")}
              />
              <input
                placeholder="Phone"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("phone")}
              />
              <input
                placeholder="Date of birth"
                type="date"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("dob")}
              />
              <input
                placeholder="Gender"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("gender")}
              />
              <input
                placeholder="Nationality"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("nationality")}
              />
              <input
                placeholder="Residence"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("residence")}
              />
              <input
                placeholder="T-shirt size"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("tshirtSize")}
              />
              <input
                placeholder="Emergency contact name"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("emergencyName")}
              />
              <input
                placeholder="Emergency contact phone"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("emergencyPhone")}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {formFields.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Event questions
                  </h3>
                  <div className="grid gap-4">
                    {formFields.map((field) => {
                      const requiredMark = field.required ? "*" : ""
                      const value = fieldValues[field.key]
                      const options = Array.isArray(field.options) ? field.options : []
                      const normalizedOptions = options
                        .map((option) => {
                          if (typeof option === "string") return { value: option, label: option }
                          if (option && typeof option === "object") {
                            const record = option as Record<string, unknown>
                            const label = String(record.label ?? record.value ?? "")
                            const val = String(record.value ?? record.label ?? "")
                            return { value: val, label }
                          }
                          return null
                        })
                        .filter(Boolean) as Array<{ value: string; label: string }>

                      if (field.type === "checkbox") {
                        return (
                          <label key={field.slug} className="flex items-center gap-3 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={value === true}
                              onChange={(e) =>
                                setFieldValues((prev) => ({ ...prev, [field.key]: e.target.checked }))
                              }
                            />
                            <span>
                              {field.label} {requiredMark}
                            </span>
                          </label>
                        )
                      }

                      if (field.type === "select") {
                        return (
                          <label key={field.slug} className="space-y-2 text-sm text-foreground">
                            <span>
                              {field.label} {requiredMark}
                            </span>
                            <select
                              value={typeof value === "string" ? value : ""}
                              onChange={(e) => {
                                setFieldErrors((prev) => ({ ...prev, [field.key]: "" }))
                                setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }}
                              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="">Select an option</option>
                              {normalizedOptions.map((option, idx) => (
                                <option key={`${option.value}_${idx}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {fieldErrors[field.key] && (
                              <p className="text-sm text-destructive">{fieldErrors[field.key]}</p>
                            )}
                          </label>
                        )
                      }

                      return (
                        <label key={field.slug} className="space-y-2 text-sm text-foreground">
                          <span>
                            {field.label} {requiredMark}
                          </span>
                          <input
                            type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                            value={value === undefined ? "" : String(value)}
                            onChange={(e) => {
                              setFieldErrors((prev) => ({ ...prev, [field.key]: "" }))
                              setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          {fieldErrors[field.key] && (
                            <p className="text-sm text-destructive">{fieldErrors[field.key]}</p>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
              <textarea
                placeholder="Medical declaration"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
                {...form.register("medicalDeclaration")}
              />
              <textarea
                placeholder="Experience / notes"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
                {...form.register("experience")}
              />
              <textarea
                placeholder="Extras"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
                {...form.register("extras")}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{waiver?.title || "Waiver"}</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{waiver?.content}</p>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" {...form.register("waiverAccepted")} />
                I accept the waiver terms
              </label>
              {form.formState.errors.waiverAccepted && (
                <p className="text-sm text-destructive">{form.formState.errors.waiverAccepted.message}</p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {(() => {
                const selectedCategory = categories.find((category) => category.slug === form.watch("categorySlug"))
                const currency = form.watch("currency") || "KES"
                const priceMinor =
                  currency === "USD"
                    ? selectedCategory?.price_usd_minor ?? 0
                    : currency === "EUR"
                      ? selectedCategory?.price_eur_minor ?? 0
                      : selectedCategory?.price_kes_minor ?? 0
                const isFree = categories.length === 0 || priceMinor === 0

                if (isFree) {
                  return (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      This event has free registration. Submit to confirm your spot.
                    </div>
                  )
                }

                return (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="radio" value="stripe" {...form.register("paymentMethod")} />
                        Stripe Checkout
                      </label>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="radio" value="mpesa" {...form.register("paymentMethod")} />
                        M-Pesa STK
                      </label>
                    </div>
                    <select
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      {...form.register("currency")}
                    >
                      <option value="KES">KES</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                    {form.watch("paymentMethod") === "mpesa" && (
                      <input
                        placeholder="M-Pesa phone"
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        {...form.register("mpesaPhone")}
                      />
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {status && <p className="text-sm text-muted-foreground">{status}</p>}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prevStep}
              className="rounded-full border border-border px-4 py-2 text-sm text-foreground transition hover:border-primary/40"
              disabled={step === 0}
            >
              Back
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                disabled={!!event && registrationWindowStatus(event.reg_open_at, event.reg_close_at) === "closed"}
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                disabled={!!event && registrationWindowStatus(event.reg_open_at, event.reg_close_at) === "closed"}
              >
                Submit registration
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
