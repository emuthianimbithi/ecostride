"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ArrowRight, HeartHandshake, Shirt } from "lucide-react"
import { apiGet, apiPost } from "../lib/api-client"
import { normalizeProduct, type NormalizedProduct } from "../lib/normalize-product"
import { upsertOrder } from "../lib/orders-db"
import { formatMoney } from "../lib/format"
import { Eyebrow } from "./eyebrow"
import { ResponsiveMedia } from "./responsive-media"

export function SupportShop({ mode }: { mode: "support" | "shop" }) {
  const router = useRouter()
  const [products, setProducts] = useState<NormalizedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [enabled, setEnabled] = useState(false)
  const [selected, setSelected] = useState<NormalizedProduct | null>(null)
  const [qty, setQty] = useState("1")
  const [amount, setAmount] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [pendingPayment, setPendingPayment] = useState<string | null>(null)
  const submitting = useRef(false)
  const attempt = useRef<{ fingerprint: string; key: string; order?: { slug: string; total_minor: number; currency: string } } | null>(null)

  const load = async () => {
    setLoading(true)
    setLoadError("")
    try {
      const data = await apiGet<unknown[]>("/public/shop/products")
      setProducts(data.map(normalizeProduct).filter(p => p.active && (mode === "shop" ? p.type.toUpperCase() === "MERCH" : p.type.toUpperCase() !== "MERCH")))
    } catch { setLoadError("We couldn’t load the available items. Please try again.") }
    finally { setLoading(false) }
  }
  useEffect(() => {
    void load()
    apiGet<{ pesapal_enabled: boolean }>("/public/payments/providers").then(data => setEnabled(data.pesapal_enabled)).catch(() => setEnabled(false))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (selected) document.getElementById("shop-checkout")?.scrollIntoView?.({ behavior: "smooth", block: "start" }) }, [selected])

  const choose = (product: NormalizedProduct) => {
    setSelected(product); setQty("1"); setAmount(product.price_kes_minor ? (product.price_kes_minor / 100).toFixed(2) : "")
    setError(""); setPendingPayment(null); attempt.current = null
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !enabled || submitting.current || pendingPayment) return
    const quantity = mode === "shop" ? Number(qty) : 1
    const customMinor = selected.allow_custom_amount && /^\d+(?:\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : undefined
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 || (selected.stock_qty != null && quantity > selected.stock_qty)) { setError("Choose an available quantity between 1 and 100."); return }
    if (selected.allow_custom_amount && (!customMinor || !Number.isSafeInteger(customMinor))) { setError("Enter a positive amount in KES, with up to two decimal places."); return }
    const body = { buyer_name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), currency: "KES", items: [{ product_slug: selected.slug, qty: quantity, ...(customMinor ? { custom_amount_minor: customMinor } : {}), meta: { fulfillment: mode === "shop" ? "race_day_pickup" : "virtual_support" } }] }
    const fingerprint = JSON.stringify(body)
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
    const current = attempt.current!
    submitting.current = true; setBusy(true); setError("")
    try {
      if (!current.order) {
        current.order = await apiPost<{ slug: string; total_minor: number; currency: string }>("/public/shop/orders", body, { headers: { "X-Idempotency-Key": current.key } })
        await upsertOrder({ slug: current.order.slug, name: body.buyer_name, email: body.email, amount_minor: current.order.total_minor, currency: current.order.currency, status: "pending", title: selected.name }).catch(() => undefined)
      }
      const payment = await apiPost<{ payment_id: string; checkout_url?: string }>("/public/payments/pesapal/checkout", { order_slug: current.order.slug, currency: "KES" }, { headers: { "X-Idempotency-Key": `pay:${current.key}` } })
      if (payment.checkout_url) router.push(`/payment/${payment.payment_id}/checkout`)
      else { setPendingPayment(payment.payment_id); setError("Your payment is awaiting confirmation. Open its status page before trying again.") }
    } catch (err) { setError(err instanceof Error ? err.message : "Checkout failed. Please try again.") }
    finally { submitting.current = false; setBusy(false) }
  }

  const unitMinor = selected?.allow_custom_amount ? Math.round(Number(amount) * 100) : selected?.price_kes_minor
  const totalMinor = unitMinor == null ? null : unitMinor * (mode === "shop" ? Number(qty) : 1)
  const field = "mt-2 w-full rounded-xl border border-sand-300 bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-forest-500"
  return <main className="mx-auto max-w-6xl space-y-12 px-4 py-14 sm:px-6 md:px-8 md:py-20">
    <header className="max-w-3xl space-y-4">
      <Eyebrow>{mode === "shop" ? "The EcoStride shop" : "Support us"}</Eyebrow>
      <h1 className="font-display text-h1 text-forest-900 md:text-display-lg">{mode === "shop" ? "Wear your support." : "Take part, wherever you are."}</h1>
      <p className="text-base leading-8 text-muted-foreground">{mode === "shop" ? "Find EcoStride merchandise, choose your quantity, and pay securely. Bring your paid order reference or receipt for race-day collection." : "Support EcoStride’s coastal work through virtual participation. Choose a contribution below, or visit the shop for merchandise."}</p>
      <Link className="inline-flex items-center gap-2 font-semibold text-tide-700" href={mode === "shop" ? "/support" : "/shop"}>{mode === "shop" ? "Support us from anywhere" : "Browse merchandise"}<ArrowRight className="h-4 w-4" /></Link>
    </header>
    <section id={mode === "shop" ? "merchandise" : "virtual-participation"} className="space-y-6" aria-label={mode === "shop" ? "Merchandise" : "Virtual participation"}>
      <h2 className="font-display text-h2">{mode === "shop" ? "Find your next favourite." : "Virtual participation"}</h2>
      {mode === "support" && <p className="text-muted-foreground">Your contribution supports EcoStride. For a race-day entry and bib, <Link href="/events" className="underline">register for an event</Link>.</p>}
      {loading && <p role="status">Loading available items…</p>}
      {loadError && <div role="alert" className="rounded-xl border border-sand-300 p-5"><p>{loadError}</p><button className="mt-3 underline" onClick={() => void load()}>Try again</button></div>}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map(product => {
          const soldOut = product.stock_qty != null && product.stock_qty <= 0
          const priced = (product.price_kes_minor ?? 0) > 0 || product.allow_custom_amount
          return <article key={product.slug} id={`product-${product.slug}`} className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
            {product.image_url ? <ResponsiveMedia src={product.image_url} alt={product.image_alt || product.name} className="aspect-square" fillMode="cover" /> : <div className="flex aspect-[4/3] items-center justify-center bg-sand-100 text-forest-700">{mode === "shop" ? <Shirt className="h-20 w-20" aria-hidden="true" /> : <HeartHandshake className="h-20 w-20" aria-hidden="true" />}</div>}
            <div className="space-y-3 p-6"><h3 className="font-display text-2xl">{product.name}</h3><p className="text-sm leading-6 text-muted-foreground">{product.description}</p>
              <p className="font-semibold">{product.allow_custom_amount ? "Choose your amount" : product.price_kes_minor ? formatMoney("KES", product.price_kes_minor) : "Price to be confirmed"}</p>
              <button type="button" disabled={soldOut || !priced || busy} onClick={() => choose(product)} className="w-full rounded-full bg-forest-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{soldOut ? "Sold out" : mode === "shop" ? `Buy ${product.name}` : `Choose ${product.name}`}</button>
            </div>
          </article>
        })}
      </div>
      {!loading && !loadError && products.length === 0 && <p className="rounded-2xl border border-dashed border-sand-300 p-8 text-muted-foreground">{mode === "shop" ? "Merchandise will appear here when it is available." : "Support options will appear here when they are available."} <Link href="/contact" className="underline">Contact EcoStride</Link> for more information.</p>}
    </section>
    {selected && <section id="shop-checkout" className="scroll-mt-24 rounded-2xl border border-sand-200 bg-sand-50 p-6 md:p-8" aria-label="Checkout">
      <h2 className="font-display text-h2">{selected.name}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{mode === "shop" ? "Pay now. Keep your receipt for collection." : "Support from anywhere. Your receipt will be sent to your email."}</p>
      <p className="mt-4 font-semibold">Total: {totalMinor != null && Number.isSafeInteger(totalMinor) && totalMinor > 0 ? formatMoney("KES", totalMinor) : "Choose an amount"}</p>
      <form onSubmit={submit} className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="text-sm font-medium">Full name<input className={field} required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="text-sm font-medium">Email<input className={field} required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="text-sm font-medium">Phone<input className={field} required type="tel" pattern="\+?[0-9]{9,15}" title="Use 9 to 15 digits, optionally starting with +" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        {mode === "shop" && <label className="text-sm font-medium">Quantity<input className={field} required type="number" min="1" max={Math.min(selected.stock_qty ?? 100, 100)} step="1" value={qty} onChange={e => setQty(e.target.value)} /></label>}
        {selected.allow_custom_amount && <label className="text-sm font-medium">Amount (KES)<input className={field} required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>}
        <div className="space-y-3 md:col-span-2">
          {!enabled && <p role="status">Online checkout is not open yet. You can browse now or <Link href="/contact" className="underline">contact us</Link> for help.</p>}
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {pendingPayment && <Link className="block font-semibold underline" href={`/payment/${pendingPayment}`}>View payment status</Link>}
          <button type="submit" disabled={!enabled || busy || !!pendingPayment} className="rounded-full bg-forest-900 px-7 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Opening checkout…" : "Pay with PesaPal"}</button>
          <p className="text-xs leading-5 text-muted-foreground">Payments are in KES. Unpaid checkout reservations expire after 30 minutes. {mode === "shop" ? "Race entry is booked separately." : "Virtual support does not include a race-day entry or bib."}</p>
        </div>
      </form>
    </section>}
  </main>
}
