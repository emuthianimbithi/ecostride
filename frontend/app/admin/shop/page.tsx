"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet, apiPost } from "../../../lib/api-client"
import { normalizeProduct, type NormalizedProduct } from "../../../lib/normalize-product"
import { toastApiError } from "../../../lib/toast-api-error"
import { useToast } from "../../../components/toast"

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

export default function ShopPage() {
    const { toast } = useToast()
    const [products, setProducts] = useState<Product[]>([])
    const [orders, setOrders] = useState<Order[]>([])
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
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

    useEffect(() => {
        loadProducts()
        loadOrders()
    }, [])

    const loadProducts = async () => {
        try {
            const data = await apiGet<any[]>("/admin/products")
            setProducts((data ?? []).map((p) => {
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
            }))
        } catch (err) {
            toastApiError(toast, err)
            setError(err instanceof Error ? err.message : "Failed to load products")
        }
    }

    const loadOrders = async () => {
        try {
            const data = await apiGet<Order[]>("/admin/orders")
            setOrders(data)
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
        return Math.round(parsed * 100)
    }

    const handleCreate = async () => {
        setError(null)
        setStatus(null)
        if (!form.name || !form.slug) {
            setError("Name and slug are required.")
            return
        }

        try {
            await apiPost("/admin/products", {
                type: form.type,
                name: form.name,
                slug: form.slug,
                description: form.description,
                price_kes_minor: toMinor(form.priceKES),
                price_usd_minor: toMinor(form.priceUSD),
                price_eur_minor: toMinor(form.priceEUR),
                allow_custom_amount: form.allowCustomAmount,
                stock_qty: form.stockQty ? Number(form.stockQty) : undefined,
                active: form.active
            })
            setStatus("Product created")
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
            setShowForm(false)
            await loadProducts()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create product")
        }
    }

    return (
        <main className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-forest">Shop</h1>
                    <p className="text-sm text-slate-600">Manage donation tiers and merchandise.</p>
                </div>
                <button
                    onClick={() => setShowForm((prev) => !prev)}
                    className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
                >
                    {showForm ? "Close" : "New product"}
                </button>
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
            {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

            {showForm && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-slate-800">New Product</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                        <input
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Product name"
                        />
                        <input
                            value={form.slug}
                            onChange={(e) => setForm({ ...form, slug: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Product slug"
                        />
                        <select
                            value={form.type}
                            onChange={(e) => setForm({ ...form, type: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        >
                            <option value="DONATION_TIER">Donation tier</option>
                            <option value="MERCH">Merch</option>
                        </select>
                        <input
                            value={form.stockQty}
                            onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Stock qty (optional)"
                        />
                        <input
                            value={form.priceKES}
                            onChange={(e) => setForm({ ...form, priceKES: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Price KES"
                        />
                        <input
                            value={form.priceUSD}
                            onChange={(e) => setForm({ ...form, priceUSD: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Price USD"
                        />
                        <input
                            value={form.priceEUR}
                            onChange={(e) => setForm({ ...form, priceEUR: e.target.value })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Price EUR"
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                                type="checkbox"
                                checked={form.allowCustomAmount}
                                onChange={(e) => setForm({ ...form, allowCustomAmount: e.target.checked })}
                            />
                            Allow custom amount
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                                type="checkbox"
                                checked={form.active}
                                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                            />
                            Active
                        </label>
                    </div>
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Description"
                    />
                    <button
                        onClick={handleCreate}
                        className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
                    >
                        Create product
                    </button>
                </section>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Active</th>
                            <th className="px-4 py-3">Prices</th>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map((product) => (
                            <tr key={product.slug} className="border-t border-slate-100">
                                <td className="px-4 py-3 font-medium text-slate-800">{product.name}</td>
                                <td className="px-4 py-3 text-slate-600">{product.type}</td>
                                <td className="px-4 py-3 text-slate-600">{product.active ? "Yes" : "No"}</td>
                                <td className="px-4 py-3 text-slate-600">
                                    {formatMinor(product.price_kes_minor)} / {formatMinor(product.price_usd_minor)} / {formatMinor(product.price_eur_minor)}
                                </td>
                            </tr>
                        ))}
                        {products.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                                    No products yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-800">Orders</h2>
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
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-600">
                                        {order.items?.length ? (
                                            <div className="space-y-1">
                                                {order.items.map((item, index) => (
                                                    <div key={`${item.product_name}-${index}`}>
                                                        {item.product_name} x{item.qty}
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
                                        {order.payment_method ? `${order.payment_method} • ${order.payment_status}` : "Not paid"}
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