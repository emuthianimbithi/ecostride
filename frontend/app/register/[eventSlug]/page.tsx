"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiGet, apiPost } from "../../../lib/api-client"
import { formatDate, registrationWindowStatus } from "../../../lib/format"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"

type EventCategory = {
  Slug: string
  Name: string
  PriceKESMinor: number
  PriceUSDMinor?: number
  PriceEURMinor?: number
}

type EventDetails = {
  Title: string
  Description: string
  Status: string
  RegOpenAt?: string | null
  RegCloseAt?: string | null
  StartAt?: string | null
}

type Waiver = {
  Title: string
  Content: string
}

type EventFormField = {
  Slug: string
  Key: string
  Label: string
  Type: string
  Required: boolean
  Options?: unknown
  Order: number
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

export default function Page({ params }: { params: { eventSlug: string } }) {
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
      ["athleteName", "email", "phone"],
      ["extras"],
      ["waiverAccepted"],
      ["paymentMethod", "currency", "mpesaPhone"]
    ],
    []
  )

  useEffect(() => {
    apiGet<EventDetails>(`/public/events/${params.eventSlug}`)
      .then(setEvent)
      .catch(() => setEvent(null))

    apiGet<EventCategory[]>(`/public/events/${params.eventSlug}/categories`)
      .then(setCategories)
      .catch(() => setCategories([]))

    apiGet<Waiver>(`/public/events/${params.eventSlug}/waiver/current`)
      .then(setWaiver)
      .catch(() => setWaiver(null))

    apiGet<EventFormField[]>(`/public/events/${params.eventSlug}/form-fields`)
      .then((data) => setFormFields([...data].sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0))))
      .catch(() => setFormFields([]))
  }, [params.eventSlug])

  const nextStep = async () => {
    setError(null)
    if (event && registrationWindowStatus(event.RegOpenAt, event.RegCloseAt) === "closed") {
      setError("Registration is closed for this event.")
      toast({ title: "Registration closed", description: "Registration is closed for this event.", variant: "destructive" })
      return
    }
    if (step === 2 && formFields.length > 0) {
      const errors: Record<string, string> = {}
      formFields.forEach((field) => {
        if (!field.Required) return
        const value = fieldValues[field.Key]
        if (field.Type === "checkbox") {
          if (value !== true) {
            errors[field.Key] = "This field is required."
          }
          return
        }
        if (value === undefined || value === null || String(value).trim() === "") {
          errors[field.Key] = "This field is required."
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
  }

  const prevStep = () => setStep((prev) => Math.max(prev - 1, 0))

  const getCategoryPrice = (currency: string, category?: EventCategory | null) => {
    if (!category) return 0
    if (currency === "USD" && category.PriceUSDMinor) return category.PriceUSDMinor
    if (currency === "EUR" && category.PriceEURMinor) return category.PriceEURMinor
    return category.PriceKESMinor
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setStatus("Creating registration...")

    try {
      const chosenCategory = categories.find((category) => category.Slug === values.categorySlug)
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

      const registration = await apiPost<{ Slug: string }>("/public/registrations", {
        event_slug: params.eventSlug,
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

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Register</h1>
          <p className="text-sm text-muted-foreground md:text-base">{event?.Title || "Loading event..."}</p>
          {event && (
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {registrationWindowStatus(event.RegOpenAt, event.RegCloseAt) === "closed"
                ? "Registration closed"
                : `Event date ${formatDate(event.StartAt)}`}
            </p>
          )}
        </div>

        {event && registrationWindowStatus(event.RegOpenAt, event.RegCloseAt) === "closed" && (
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
                    key={category.Slug}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background p-3 text-sm text-foreground"
                  >
                    <input type="radio" value={category.Slug} {...form.register("categorySlug")} />
                    <span>
                      {category.Name} • KES {(category.PriceKESMinor / 100).toFixed(2)}
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
                      const requiredMark = field.Required ? "*" : ""
                      const value = fieldValues[field.Key]
                      const options = Array.isArray(field.Options) ? field.Options : []
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

                      if (field.Type === "checkbox") {
                        return (
                          <label key={field.Slug} className="flex items-center gap-3 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={value === true}
                              onChange={(e) =>
                                setFieldValues((prev) => ({ ...prev, [field.Key]: e.target.checked }))
                              }
                            />
                            <span>
                              {field.Label} {requiredMark}
                            </span>
                          </label>
                        )
                      }

                      if (field.Type === "select") {
                        return (
                          <label key={field.Slug} className="space-y-2 text-sm text-foreground">
                            <span>
                              {field.Label} {requiredMark}
                            </span>
                            <select
                              value={typeof value === "string" ? value : ""}
                              onChange={(e) => {
                                setFieldErrors((prev) => ({ ...prev, [field.Key]: "" }))
                                setFieldValues((prev) => ({ ...prev, [field.Key]: e.target.value }))
                              }}
                              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="">Select an option</option>
                              {normalizedOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {fieldErrors[field.Key] && (
                              <p className="text-sm text-destructive">{fieldErrors[field.Key]}</p>
                            )}
                          </label>
                        )
                      }

                      return (
                        <label key={field.Slug} className="space-y-2 text-sm text-foreground">
                          <span>
                            {field.Label} {requiredMark}
                          </span>
                          <input
                            type={field.Type === "number" ? "number" : field.Type === "date" ? "date" : "text"}
                            value={value === undefined ? "" : String(value)}
                            onChange={(e) => {
                              setFieldErrors((prev) => ({ ...prev, [field.Key]: "" }))
                              setFieldValues((prev) => ({ ...prev, [field.Key]: e.target.value }))
                            }}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          {fieldErrors[field.Key] && (
                            <p className="text-sm text-destructive">{fieldErrors[field.Key]}</p>
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
              <h2 className="text-lg font-semibold text-foreground">{waiver?.Title || "Waiver"}</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{waiver?.Content}</p>
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
                const selectedCategory = categories.find((category) => category.Slug === form.watch("categorySlug"))
                const currency = form.watch("currency") || "KES"
                const priceMinor =
                  currency === "USD"
                    ? selectedCategory?.PriceUSDMinor ?? 0
                    : currency === "EUR"
                      ? selectedCategory?.PriceEURMinor ?? 0
                      : selectedCategory?.PriceKESMinor ?? 0
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
                disabled={!!event && registrationWindowStatus(event.RegOpenAt, event.RegCloseAt) === "closed"}
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                disabled={!!event && registrationWindowStatus(event.RegOpenAt, event.RegCloseAt) === "closed"}
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
