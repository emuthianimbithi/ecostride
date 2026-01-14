"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiGet, apiPost } from "../../../lib/api-client"
import { formatDate, registrationWindowStatus } from "../../../lib/format"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { upsertRegistration } from "../../../lib/registrations-db"

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

type RegistrationResponse = {
    slug: string
    athlete_name?: string
    email?: string
    status?: string
    event_title?: string
    event_slug?: string
    event_start_at?: string
    category_name?: string
    created_at?: string
}

const registrationSchema = z
    .object({
        categorySlug: z.string().optional(),
        athleteName: z.string().min(2, "Name required"),
        email: z.string().email("Enter a valid email"),
        phone: z.string().min(9, "Enter a valid phone number"),
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
    .superRefine((vals, ctx) => {
        if (vals.paymentMethod === "mpesa") {
            const phone = (vals.mpesaPhone || "").trim()
            if (!phone) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["mpesaPhone"],
                    message: "M-Pesa phone is required"
                })
            }
        }
    })

type RegistrationForm = z.infer<typeof registrationSchema>

const steps = ["Category", "Athlete", "Extras", "Waiver", "Payment"]

const baseField =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
const errorField = "border-destructive focus:ring-destructive/20"
const errorText = "text-xs text-destructive mt-1"

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ")
}

export default function Page() {
    const params = useParams()
    const eventSlug = (params.eventSlug as string) ?? ""

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

    // ✅ Do NOT preload from localStorage; create is driven by click
    const [registrationSlug, setRegistrationSlug] = useState<string>("")
    const creatingRef = useRef(false)

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
        },
        mode: "onTouched"
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

        // new route => clear per-page slug
        setRegistrationSlug("")
        setError(null)
        setStatus(null)

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

    const getCategoryPrice = (currency: string, category?: EventCategory | null) => {
        if (!category) return 0
        if (currency === "USD" && category.price_usd_minor) return category.price_usd_minor
        if (currency === "EUR" && category.price_eur_minor) return category.price_eur_minor
        return category.price_kes_minor
    }

    const nextStep = async () => {
        setError(null)

        if (event && registrationWindowStatus(event.reg_open_at, event.reg_close_at) === "closed") {
            setError("Registration is closed for this event.")
            toast({
                title: "Registration closed",
                description: "Registration is closed for this event.",
                variant: "destructive"
            })
            return
        }

        // Step 2 dynamic fields validation
        if (step === 2 && formFields.length > 0) {
            const errors: Record<string, string> = {}
            formFields.forEach((field) => {
                if (!field.required) return
                const value = fieldValues[field.key]
                if (field.type === "checkbox") {
                    if (value !== true) errors[field.key] = "This field is required."
                    return
                }
                if (value === undefined || value === null || String(value).trim() === "") {
                    errors[field.key] = "This field is required."
                }
            })
            setFieldErrors(errors)
            if (Object.keys(errors).length > 0) {
                toast({
                    title: "Validation Error",
                    description: "Please complete the required fields.",
                    variant: "destructive"
                })
                return
            }
        }

        // Step 0: category selection
        if (step === 0 && categories.length > 0 && !form.getValues("categorySlug")) {
            form.setError("categorySlug", { type: "manual", message: "Select a category" })
            toast({
                title: "Validation Error",
                description: "Select a category to continue.",
                variant: "destructive"
            })
            return
        }

        const fields = stepFields[step]
        if (fields) {
            const valid = await form.trigger(fields as (keyof RegistrationForm)[], { shouldFocus: true })
            if (!valid) {
                toast({
                    title: "Validation Error",
                    description: "Please fix the highlighted fields.",
                    variant: "destructive"
                })
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

    const createAndPay = form.handleSubmit(async (values) => {
        setError(null)

        if (creatingRef.current) return
        creatingRef.current = true

        try {
            const currency = values.currency ?? "KES"

            const chosenCategory = categories.find((c) => c.slug === values.categorySlug)
            const priceMinor = getCategoryPrice(currency, chosenCategory)
            const isPayable = priceMinor > 0

            // Validate payment inputs only if payable
            if (isPayable) {
                if (!values.paymentMethod) {
                    form.setError("paymentMethod", { type: "manual", message: "Select a payment method" })
                    setStatus(null)
                    return
                }
                if (values.paymentMethod === "mpesa" && currency !== "KES") {
                    form.setError("currency", { type: "manual", message: "M-Pesa only supports KES" })
                    setStatus(null)
                    return
                }
                if (values.paymentMethod === "mpesa" && !String(values.mpesaPhone || values.phone || "").trim()) {
                    form.setError("mpesaPhone", { type: "manual", message: "M-Pesa phone is required" })
                    setStatus(null)
                    return
                }
            }

            setStatus("Creating registration...")

            const extrasPayload: Record<string, unknown> = {}
            if (values.extras) extrasPayload.notes = values.extras
            if (Object.keys(fieldValues).length > 0) extrasPayload.form_fields = fieldValues

            // ✅ ALWAYS call backend create. Backend returns 201 (new) or 200 (existing).
            const registration = await apiPost<RegistrationResponse>("/public/registrations", {
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

            const regSlug = String(registration?.slug ?? "")
            if (!regSlug) throw new Error("Registration response missing slug")

            const regStatus = String(registration?.status ?? "").toLowerCase()

            await upsertRegistration({
                slug: regSlug,
                email: String(registration?.email ?? values.email ?? ""),
                athlete_name: String(registration?.athlete_name ?? values.athleteName ?? ""),
                event_slug: String(registration?.event_slug ?? eventSlug ?? ""),
                event_title: registration?.event_title ? String(registration.event_title) : undefined,
                event_start_at: registration?.event_start_at ? String(registration.event_start_at) : undefined,
                category_name: registration?.category_name ? String(registration.category_name) : undefined,
                status: String(registration?.status ?? (isPayable ? "pending_payment" : "confirmed")),
                created_at: registration?.created_at ? String(registration.created_at) : undefined
            })

            // ✅ If confirmed (free OR already completed), do not pay
            if (regStatus === "confirmed") {
                setStatus(null)
                router.push(`/confirm/${regSlug}`)
                return
            }

            // Safety: if not payable, go confirm anyway
            if (!isPayable) {
                setStatus(null)
                router.push(`/confirm/${regSlug}`)
                return
            }

            // ✅ Otherwise payable + not confirmed => pay
            if (values.paymentMethod === "stripe") {
                setStatus("Redirecting to Stripe...")
                const data = await apiPost<{ checkout_url: string }>(
                    "/public/payments/stripe/checkout",
                    { registration_slug: regSlug, currency },
                    { headers: { "X-Idempotency-Key": crypto.randomUUID() } }
                )
                window.location.href = data.checkout_url
                return
            }

            setStatus("Triggering M-Pesa STK...")
            const mpesaPhone = String(values.mpesaPhone || values.phone || "").trim()
            const payment = await apiPost<{ payment_id: string }>(
                "/public/payments/mpesa/stk",
                { registration_slug: regSlug, phone: mpesaPhone },
                { headers: { "X-Idempotency-Key": crypto.randomUUID() } }
            )
            router.push(`/payment/${payment.payment_id}`)
        } catch (err) {
            toastApiError(toast, err)
            setStatus(null)
            setError(err instanceof Error ? err.message : "Registration failed")
        } finally {
            creatingRef.current = false
        }
    })

    const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === "Enter") e.preventDefault()
    }

    if (!event) {
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

                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                    {steps.map((label, index) => (
                        <span key={label} className={index === step ? "text-primary font-semibold" : ""}>
              {label}
            </span>
                    ))}
                </div>

                <form
                    onKeyDown={onFormKeyDown}
                    onSubmit={(e) => e.preventDefault()}
                    className="space-y-6 rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
                >
                    {/* STEP 0 */}
                    {step === 0 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold text-foreground">Select category</h2>
                            <div
                                className={cx(
                                    "grid gap-3",
                                    form.formState.errors.categorySlug && "rounded-xl border border-destructive/50 p-3"
                                )}
                            >
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
                                {form.formState.errors.categorySlug && (
                                    <p className={errorText}>{form.formState.errors.categorySlug.message}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 1 */}
                    {step === 1 && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                                <input
                                    placeholder="Athlete name"
                                    className={cx(baseField, form.formState.errors.athleteName && errorField)}
                                    {...form.register("athleteName")}
                                />
                                {form.formState.errors.athleteName && (
                                    <p className={errorText}>{form.formState.errors.athleteName.message}</p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <input
                                    placeholder="Email"
                                    type="email"
                                    className={cx(baseField, form.formState.errors.email && errorField)}
                                    {...form.register("email")}
                                />
                                {form.formState.errors.email && <p className={errorText}>{form.formState.errors.email.message}</p>}
                            </div>

                            <div className="space-y-1">
                                <input
                                    placeholder="Phone"
                                    className={cx(baseField, form.formState.errors.phone && errorField)}
                                    {...form.register("phone")}
                                />
                                {form.formState.errors.phone && <p className={errorText}>{form.formState.errors.phone.message}</p>}
                            </div>

                            <input placeholder="Date of birth" type="date" className={baseField} {...form.register("dob")} />
                            <input placeholder="Gender" className={baseField} {...form.register("gender")} />
                            <input placeholder="Nationality" className={baseField} {...form.register("nationality")} />
                            <input placeholder="Residence" className={baseField} {...form.register("residence")} />
                            <input placeholder="T-shirt size" className={baseField} {...form.register("tshirtSize")} />
                            <input placeholder="Emergency contact name" className={baseField} {...form.register("emergencyName")} />
                            <input placeholder="Emergency contact phone" className={baseField} {...form.register("emergencyPhone")} />
                        </div>
                    )}

                    {/* STEP 2 */}
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

                                            const hasErr = !!fieldErrors[field.key]

                                            if (field.type === "checkbox") {
                                                return (
                                                    <div key={field.slug} className="space-y-1">
                                                        <label className={cx("flex items-center gap-3 text-sm", hasErr && "text-destructive")}>
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
                                                        {hasErr && <p className={errorText}>{fieldErrors[field.key]}</p>}
                                                    </div>
                                                )
                                            }

                                            if (field.type === "select") {
                                                return (
                                                    <label key={field.slug} className="space-y-2 text-sm">
                            <span>
                              {field.label} {requiredMark}
                            </span>
                                                        <select
                                                            value={typeof value === "string" ? value : ""}
                                                            onChange={(e) => {
                                                                setFieldErrors((prev) => ({ ...prev, [field.key]: "" }))
                                                                setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                                                            }}
                                                            className={cx(baseField, hasErr && errorField)}
                                                        >
                                                            <option value="">Select an option</option>
                                                            {normalizedOptions.map((option, idx) => (
                                                                <option key={`${option.value}_${idx}`} value={option.value}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {hasErr && <p className={errorText}>{fieldErrors[field.key]}</p>}
                                                    </label>
                                                )
                                            }

                                            return (
                                                <label key={field.slug} className="space-y-2 text-sm">
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
                                                        className={cx(baseField, hasErr && errorField)}
                                                    />
                                                    {hasErr && <p className={errorText}>{fieldErrors[field.key]}</p>}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <textarea placeholder="Medical declaration" className={baseField} rows={3} {...form.register("medicalDeclaration")} />
                            <textarea placeholder="Experience / notes" className={baseField} rows={3} {...form.register("experience")} />
                            <textarea placeholder="Extras" className={baseField} rows={3} {...form.register("extras")} />
                        </div>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold text-foreground">{waiver?.title || "Waiver"}</h2>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{waiver?.content}</p>

                            <label className={cx("flex items-center gap-2 text-sm", form.formState.errors.waiverAccepted && "text-destructive")}>
                                <input type="checkbox" {...form.register("waiverAccepted")} />
                                I accept the waiver terms
                            </label>
                            {form.formState.errors.waiverAccepted && <p className={errorText}>{form.formState.errors.waiverAccepted.message}</p>}
                        </div>
                    )}

                    {/* STEP 4 */}
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
                                        <div className="space-y-2">
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <label className={cx("flex items-center gap-2 text-sm", form.formState.errors.paymentMethod && "text-destructive")}>
                                                    <input type="radio" value="stripe" {...form.register("paymentMethod")} />
                                                    Stripe Checkout
                                                </label>
                                                <label className={cx("flex items-center gap-2 text-sm", form.formState.errors.paymentMethod && "text-destructive")}>
                                                    <input type="radio" value="mpesa" {...form.register("paymentMethod")} />
                                                    M-Pesa STK
                                                </label>
                                            </div>
                                            {form.formState.errors.paymentMethod && <p className={errorText}>{form.formState.errors.paymentMethod.message}</p>}
                                        </div>

                                        <div className="space-y-1">
                                            <select className={cx(baseField, form.formState.errors.currency && errorField)} {...form.register("currency")}>
                                                <option value="KES">KES</option>
                                                <option value="USD">USD</option>
                                                <option value="EUR">EUR</option>
                                            </select>
                                            {form.formState.errors.currency && <p className={errorText}>{form.formState.errors.currency.message}</p>}
                                        </div>

                                        {form.watch("paymentMethod") === "mpesa" && (
                                            <div className="space-y-1">
                                                <input
                                                    placeholder="M-Pesa phone"
                                                    className={cx(baseField, form.formState.errors.mpesaPhone && errorField)}
                                                    {...form.register("mpesaPhone")}
                                                />
                                                {form.formState.errors.mpesaPhone && <p className={errorText}>{form.formState.errors.mpesaPhone.message}</p>}
                                            </div>
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
                            className="rounded-full border border-border px-4 py-2 text-sm text-foreground transition hover:border-primary/40 disabled:opacity-50"
                            disabled={step === 0}
                        >
                            Back
                        </button>

                        {step < steps.length - 1 ? (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                                disabled={event && registrationWindowStatus(event.reg_open_at, event.reg_close_at) === "closed"}
                            >
                                Continue
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={createAndPay}
                                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                                disabled={event && registrationWindowStatus(event.reg_open_at, event.reg_close_at) === "closed"}
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
