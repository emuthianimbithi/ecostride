"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet, apiPost, apiPut } from "../../../lib/api-client"
import { normalizeProduct, type NormalizedProduct } from "../../../lib/normalize-product"
import { toastApiError } from "../../../lib/toast-api-error"
import { useToast } from "../../../components/toast"
import { IconAction } from "../../../components/icon-action"
import {
  BadgeDollarSign,
  CheckCircle2,
  ClipboardList,
  Globe,
  Image as ImageIcon,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Tag,
  XCircle
} from "lucide-react"

type Product = {
  slug: string
  name: string
  type: string
  active: boolean
  price_kes_minor?: number
  price_usd_minor?: number
  price_eur_minor?: number
  image_url?: string | null
}

type OrderItem = {
  product_name: string
  qty: number
  unit_price_minor: number
  line_total_minor: number
  custom_details: string
}

type Order = {
  slug: string
  buyer_name: string
  email: string
  phone: string
  currency: string
  total_minor: number
  status: string
  created_at: string
  payment_slug?: string | null
  payment_status?: string | null
  payment_method?: string | null
  items: OrderItem[]
}

type ProductFormErrors = Partial<{
  type: string
  name: string
  slug: string
  prices: string
  stockQty: string
}>

const isSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)

export default function ShopPage() {
  const { toast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)

  const [form, setForm] = useState({
    type: "DONATION_TIER",
    name: "",
    slug: "",
    description: "",
    priceKES: "",
    priceUSD: "",
    priceEUR: "",
    allowCustomAmount: false,
    stockQty: "",
    active: true
  })
  const [formErrors, setFormErrors] = useState<ProductFormErrors>({})

  const [filters, setFilters] = useState({
    query: "",
    type: "all",
    active: "all" as "all" | "active" | "inactive"
  })

  useEffect(() => {
    void loadProducts()
    void loadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProducts = async () => {
    try {
      const data = await apiGet<any[]>("/admin/products")
      setProducts(
        (data ?? []).map((p) => {
          const n: NormalizedProduct = normalizeProduct(p)
          return {
            slug: n.slug,
            name: n.name,
            type: n.type,
            active: n.active,
            price_kes_minor: n.price_kes_minor,
            price_usd_minor: n.price_usd_minor,
            price_eur_minor: n.price_eur_minor,
            image_url: n.image_url ?? null
          }
        })
      )
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load products")
    }
  }

  const loadOrders = async () => {
    try {
      const data = await apiGet<Order[]>("/admin/orders")
      setOrders(data ?? [])
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load orders")
    }
  }

  const formatMinor = useMemo(
    () => (value?: number) => {
      if (value === undefined || value === null) return "-"
      return (value / 100).toFixed(2)
    },
    []
  )

  const toMinor = (value: string) => {
    if (!value) return undefined
    const parsed = Number(value)
    if (Number.isNaN(parsed)) return undefined
    if (!Number.isFinite(parsed)) return undefined
    return Math.round(parsed * 100)
  }

  const validateProductForm = () => {
    const next: ProductFormErrors = {}

    if (!form.type) next.type = "Type is required."
    if (!form.name.trim()) next.name = "Name is required."
    if (!form.slug.trim()) next.slug = "Slug is required."
    if (form.slug && !isSlug(form.slug.trim())) {
      next.slug = "Slug must be lowercase letters/numbers with hyphens (e.g. 'gold-sponsor')."
    }

    const kes = toMinor(form.priceKES)
    const usd = toMinor(form.priceUSD)
    const eur = toMinor(form.priceEUR)

    const anyPrice = kes != null || usd != null || eur != null
    if (!anyPrice && !form.allowCustomAmount) {
      next.prices = "Provide at least one price, or enable 'Allow custom amount'."
    }

    if (form.stockQty) {
      const qty = Number(form.stockQty)
      if (Number.isNaN(qty) || !Number.isFinite(qty)) {
        next.stockQty = "Stock qty must be a number."
      } else if (!Number.isInteger(qty) || qty < 0) {
        next.stockQty = "Stock qty must be a non-negative whole number."
      }
    }

    setFormErrors(next)
    return Object.keys(next).length === 0
  }

  const resetForm = () => {
    setForm({
      type: "DONATION_TIER",
      name: "",
      slug: "",
      description: "",
      priceKES: "",
      priceUSD: "",
      priceEUR: "",
      allowCustomAmount: false,
      stockQty: "",
      active: true
    })
    setEditingSlug(null)
    setFormErrors({})
  }

  const startCreate = () => {
    if (showForm) {
      setShowForm(false)
      resetForm()
      return
    }
    setShowForm(true)
    resetForm()
  }

  const startEdit = (p: Product) => {
    setShowForm(true)
    setEditingSlug(p.slug)
    setFormErrors({})
    setStatus(null)
    setError(null)
    setForm({
      type: p.type,
      name: p.name,
      slug: p.slug,
      description: "", // not in Product list payload; keep blank unless you fetch detail
      priceKES: p.price_kes_minor != null ? (p.price_kes_minor / 100).toFixed(2) : "",
      priceUSD: p.price_usd_minor != null ? (p.price_usd_minor / 100).toFixed(2) : "",
      priceEUR: p.price_eur_minor != null ? (p.price_eur_minor / 100).toFixed(2) : "",
      allowCustomAmount: false, // unknown from list payload; keep false unless you fetch detail
      stockQty: "", // unknown from list payload; keep blank unless you fetch detail
      active: p.active
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSave = async () => {
    setError(null)
    setStatus(null)

    if (!validateProductForm()) {
      toast({ title: "Validation error", description: "Please fix the highlighted fields.", variant: "destructive" })
      return
    }

    const payload = {
      type: form.type,
      name: form.name.trim(),
      url_slug: form.slug.trim(),
      description: form.description,
      price_kes_minor: toMinor(form.priceKES),
      price_usd_minor: toMinor(form.priceUSD),
      price_eur_minor: toMinor(form.priceEUR),
      allow_custom_amount: form.allowCustomAmount,
      stock_qty: form.stockQty ? Number(form.stockQty) : undefined,
      active: form.active
    }

    try {
      if (editingSlug) {
        await apiPut(`/admin/products/${editingSlug}`, payload)
        setStatus("Product updated")
      } else {
        await apiPost("/admin/products", payload)
        setStatus("Product created")
      }

      setShowForm(false)
      resetForm()
      await loadProducts()
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to save product")
    }
  }

  const filteredProducts = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return products.filter((p) => {
      if (filters.type !== "all" && p.type !== filters.type) return false
      if (filters.active === "active" && !p.active) return false
      if (filters.active === "inactive" && p.active) return false
      if (!q) return true
      const hay = `${p.name} ${p.slug} ${p.type}`.toLowerCase()
      return hay.includes(q)
    })
  }, [products, filters])

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest">Shop</h1>
          <p className="text-sm text-slate-600">Manage donation tiers and merchandise.</p>
        </div>
        <button
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Close" : "New product"}
        </button>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {editingSlug ? "Edit Product" : "New Product"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">Set prices, availability, and optional stock limits.</p>
            </div>
            {editingSlug ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <Tag className="h-4 w-4" />
                Editing
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Name</label>
              <div className="relative">
                <ShoppingBag className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={form.name}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value })
                    if (e.target.value.trim()) setFormErrors((p) => ({ ...p, name: "" }))
                  }}
                  className={`w-full rounded-xl border py-2 pl-9 pr-3 text-sm ${
    formErrors.name ? "border-rose-300" : "border-slate-200"
}`}
                  placeholder="Product name"
                />
              </div>
              {formErrors.name ? <p className="text-xs text-rose-600">{formErrors.name}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Slug</label>
              <div className="relative">
                <Tag className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setForm({ ...form, slug: e.target.value })
                    setFormErrors((p) => ({ ...p, slug: "" }))
                  }}
                  className={`w-full rounded-xl border py-2 pl-9 pr-3 text-sm ${
    formErrors.slug ? "border-rose-300" : "border-slate-200"
}`}
                  placeholder="e.g. bronze-donation"
                  disabled={Boolean(editingSlug)} // safer if slug is the identifier; remove if your API supports changing it
                />
              </div>
              {formErrors.slug ? <p className="text-xs text-rose-600">{formErrors.slug}</p> : null}
              {editingSlug ? (
                <p className="text-[11px] text-slate-500">Slug is locked while editing (used as identifier).</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Type</label>
              <select
                value={form.type}
                onChange={(e) => {
                  setForm({ ...form, type: e.target.value })
                  if (e.target.value) setFormErrors((p) => ({ ...p, type: "" }))
                }}
                className={`w-full rounded-xl border px-3 py-2 text-sm ${
    formErrors.type ? "border-rose-300" : "border-slate-200"
}`}
              >
                <option value="DONATION_TIER">Donation tier</option>
                <option value="MERCH">Merch</option>
              </select>
              {formErrors.type ? <p className="text-xs text-rose-600">{formErrors.type}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Stock qty (optional)</label>
              <div className="relative">
                <Package className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={form.stockQty}
                  onChange={(e) => {
                    setForm({ ...form, stockQty: e.target.value })
                    setFormErrors((p) => ({ ...p, stockQty: "" }))
                  }}
                  className={`w-full rounded-xl border py-2 pl-9 pr-3 text-sm ${
    formErrors.stockQty ? "border-rose-300" : "border-slate-200"
}`}
                  placeholder="e.g. 100"
                />
              </div>
              {formErrors.stockQty ? <p className="text-xs text-rose-600">{formErrors.stockQty}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Price (KES)</label>
              <div className="relative">
                <BadgeDollarSign className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={form.priceKES}
                  onChange={(e) => {
                    setForm({ ...form, priceKES: e.target.value })
                    setFormErrors((p) => ({ ...p, prices: "" }))
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
                  placeholder="e.g. 1500.00"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Price (USD)</label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={form.priceUSD}
                  onChange={(e) => {
                    setForm({ ...form, priceUSD: e.target.value })
                    setFormErrors((p) => ({ ...p, prices: "" }))
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
                  placeholder="e.g. 25.00"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Price (EUR)</label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={form.priceEUR}
                  onChange={(e) => {
                    setForm({ ...form, priceEUR: e.target.value })
                    setFormErrors((p) => ({ ...p, prices: "" }))
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
                  placeholder="e.g. 22.00"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.allowCustomAmount}
                onChange={(e) => {
                  setForm({ ...form, allowCustomAmount: e.target.checked })
                  setFormErrors((p) => ({ ...p, prices: "" }))
                }}
              />
              Allow custom amount
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Active
            </div>
          </div>

          {formErrors.prices ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {formErrors.prices}
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              rows={3}
              placeholder="Description"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              {editingSlug ? "Update product" : "Create product"}
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                resetForm()
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Products header controls */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={filters.query}
            onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
            className="w-72 rounded-full border border-slate-200 py-2 pl-9 pr-4 text-sm"
            placeholder="Search products..."
          />
        </div>
        <select
          value={filters.type}
          onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700"
        >
          <option value="all">All types</option>
          <option value="DONATION_TIER">Donation tier</option>
          <option value="MERCH">Merch</option>
        </select>
        <select
          value={filters.active}
          onChange={(e) => setFilters((p) => ({ ...p, active: e.target.value as any }))}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Prices (KES / USD / EUR)</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.slug} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-10 w-10 rounded-xl object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">{product.name}</div>
                      <div className="text-xs text-slate-500">{product.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{product.type}</td>
                <td className="px-4 py-3">
                  {product.active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      <XCircle className="h-4 w-4" />
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatMinor(product.price_kes_minor)} / {formatMinor(product.price_usd_minor)} /{" "}
                  {formatMinor(product.price_eur_minor)}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex items-center gap-2">
                    <IconAction label="Edit" onClick={() => startEdit(product)}>
                      <Tag className="h-4 w-4" />
                    </IconAction>
                  </div>
                </td>
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Orders</h2>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            <ClipboardList className="h-4 w-4" />
            {orders.length} total
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Buyer</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.slug} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{order.buyer_name}</div>
                    <div className="text-xs text-slate-500">{order.email}</div>
                    <div className="text-xs text-slate-500">{order.phone}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {order.items?.length ? (
                      <div className="space-y-1">
                        {order.items.map((item, index) => (
                          <div key={`${item.product_name}-${index}`}>
                            {item.product_name} <span className="text-slate-400">×</span>
                            {item.qty}
                          </div>
                        ))}
                      </div>
                    ) : (
                      "No items"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {(order.total_minor / 100).toFixed(2)} {order.currency}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {order.payment_method ? (
                      <div>
                        <div className="font-semibold text-slate-800">{order.payment_method}</div>
                        <div className="text-slate-500">{order.payment_status ?? "unknown"}</div>
                      </div>
                    ) : (
                      "Not paid"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{order.status}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString() : "-"}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}