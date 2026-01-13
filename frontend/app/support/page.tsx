"use client"

import { useEffect, useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiGet, apiPost } from "../../lib/api-client"
import { formatMoney } from "../../lib/format"
import { useToast } from "../../components/toast"
import { toastApiError } from "../../lib/toast-api-error"
import { normalizeProduct, type NormalizedProduct } from "../../lib/normalize-product"

const checkoutSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  currency: z.enum(["KES", "USD", "EUR"]),
  paymentMethod: z.enum(["stripe", "mpesa"]),
  customAmount: z.string().optional(),
  qty: z.string().optional(),
  mpesaPhone: z.string().optional()
})

type CheckoutForm = z.infer<typeof checkoutSchema>

export default function Page() {
  const [products, setProducts] = useState<NormalizedProduct[]>([])
  const [selected, setSelected] = useState<NormalizedProduct | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      currency: "KES",
      paymentMethod: "stripe",
      qty: "1"
    }
  })

  useEffect(() => {
    apiGet<any[]>("/public/shop/products")
      .then((data) => {
        const normalized = (data ?? []).map(normalizeProduct)
        setProducts(normalized)
        if (normalized.length > 0) {
          setSelected(normalized[0])
        }
      })
      .catch(() => setProducts([]))
  }, [])

  const onSubmit = form.handleSubmit(async (values) => {
    if (!selected) {
      setError("Select a product")
      return
    }

    setError(null)
    setStatus("Creating order...")

    try {
      const qty = Number(values.qty || "1")
      const customAmount = values.customAmount ? Number(values.customAmount) : undefined
      const customAmountMinor = customAmount ? Math.round(customAmount * 100) : undefined

      const order = await apiPost<{ slug: string }>("/public/shop/orders", {
        buyer_name: values.name,
        email: values.email,
        phone: values.phone,
        currency: values.currency,
        items: [
          {
            product_slug: selected.slug,
            qty,
            custom_amount_minor: selected.allow_custom_amount ? customAmountMinor : undefined
          }
        ]
      })

      if (values.paymentMethod === "stripe") {
        setStatus("Redirecting to Stripe...")
        const data = await apiPost<{ checkout_url: string }>(
          `/public/shop/orders/${order.slug}/pay/stripe`,
          {},
          { headers: { "X-Idempotency-Key": crypto.randomUUID() } }
        )
        window.location.href = data.checkout_url
        return
      }

      const mpesaPhone = values.mpesaPhone || values.phone
      if (values.currency !== "KES") {
        throw new Error("M-Pesa only supports KES")
      }

      setStatus("Triggering M-Pesa STK...")
      const payment = await apiPost<{ payment_id: string }>(
        `/public/shop/orders/${order.slug}/pay/mpesa`,
        { phone: mpesaPhone },
        { headers: { "X-Idempotency-Key": crypto.randomUUID() } }
      )
      window.location.href = `/payment/${payment.payment_id}`
    } catch (err) {
      toastApiError(toast, err)
      setStatus(null)
      setError(err instanceof Error ? err.message : "Checkout failed")
    }

  })

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Fundraising Shop</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Support EcoStride with donations or limited-run merch.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Products</h2>
            <div className="grid gap-3">
              {products.map((product) => (
                <button
                  key={product.slug}
                  onClick={() => setSelected(product)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition hover:border-primary/30 ${selected?.slug === product.slug
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border/60 bg-background text-muted-foreground"
                    }`}
                >
                  <div className="font-semibold text-foreground">{product.name}</div>
                  <div className="text-xs text-muted-foreground">{product.description}</div>
                    {[
                        product.price_kes_minor != null ? formatMoney("KES", product.price_kes_minor) : null,
                        product.price_usd_minor != null ? formatMoney("USD", product.price_usd_minor) : null,
                        product.price_eur_minor != null ? formatMoney("EUR", product.price_eur_minor) : null,
                    ].filter(Boolean).length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                            {[
                                product.price_kes_minor != null ? formatMoney("KES", product.price_kes_minor) : null,
                                product.price_usd_minor != null ? formatMoney("USD", product.price_usd_minor) : null,
                                product.price_eur_minor != null ? formatMoney("EUR", product.price_eur_minor) : null,
                            ]
                                .filter(Boolean)
                                .join(" • ")}
                        </div>
                    )}

                </button>
              ))}
              {products.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No products yet.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Checkout</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              {selected && (
                <div className="rounded-xl border border-border/60 bg-muted px-4 py-3 text-sm text-muted-foreground">
                  Supporting: <span className="font-semibold text-foreground">{selected.name}</span>
                </div>
              )}
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
                placeholder="Phone"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("phone")}
              />
              {selected?.allow_custom_amount && (
                <input
                  placeholder="Custom amount"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  {...form.register("customAmount")}
                />
              )}
              <input
                placeholder="Quantity"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("qty")}
              />
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...form.register("currency")}
              >
                <option value="KES">KES</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              <div className="grid gap-2 text-sm text-foreground">
                <label className="flex items-center gap-2">
                  <input type="radio" value="stripe" {...form.register("paymentMethod")} />
                  Stripe Checkout
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" value="mpesa" {...form.register("paymentMethod")} />
                  M-Pesa STK
                </label>
              </div>
              {form.watch("paymentMethod") === "mpesa" && (
                <input
                  placeholder="M-Pesa phone"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  {...form.register("mpesaPhone")}
                />
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {status && <p className="text-sm text-muted-foreground">{status}</p>}
              <button
                type="submit"
                className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Checkout
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}
