import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SupportShop } from "../components/support-shop"
const mocks = vi.hoisted(() => ({ push: vi.fn(), get: vi.fn(), post: vi.fn(), save: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("../lib/api-client", () => ({ apiGet: mocks.get, apiPost: mocks.post }))
vi.mock("../lib/orders-db", () => ({ upsertOrder: mocks.save }))
const cap = { slug: "cap", name: "Coastal cap", type: "MERCH", active: true, price_kes_minor: 80000, stock_qty: 3 }
const support = { slug: "support", name: "Coastal support", type: "DONATION_TIER", active: true, price_kes_minor: 100000, allow_custom_amount: true }
beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "checkout-key" })
  mocks.save.mockResolvedValue(undefined)
  mocks.get.mockImplementation(async (path: string) => path.endsWith("/products") ? [cap, support] : { pesapal_enabled: true })
  mocks.post.mockImplementation(async (path: string) => path === "/public/shop/orders" ? { slug: "order-1", total_minor: 160000, currency: "KES" } : { payment_id: "payment-1" })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
function fillBuyer() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane Runner" } })
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } })
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "254700000001" } })
}
describe("support and shop", () => {
  it("shows merchandise and buys through a saved order and PesaPal attempt", async () => {
    mocks.post.mockImplementation(async (path: string) => path === "/public/shop/orders" ? { slug: "order-1", total_minor: 160000, currency: "KES" } : { payment_id: "payment-1", checkout_url: "https://pay.pesapal.com/iframe/checkout" })
    render(<SupportShop mode="shop" />)
    fireEvent.click(await screen.findByRole("button", { name: "Buy Coastal cap" }))
    expect(screen.queryByText("Coastal support")).toBeNull()
    fillBuyer()
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } })
    fireEvent.submit(screen.getByRole("button", { name: "Pay with PesaPal" }).closest("form")!)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/payment/payment-1/checkout"))
    expect(mocks.post).toHaveBeenCalledWith("/public/shop/orders", expect.objectContaining({ items: [expect.objectContaining({ product_slug: "cap", qty: 2 })] }), { headers: { "X-Idempotency-Key": "checkout-key" } })
    expect(mocks.post).toHaveBeenCalledWith("/public/payments/pesapal/checkout", { order_slug: "order-1", currency: "KES" }, { headers: { "X-Idempotency-Key": "pay:checkout-key" } })
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ amount_minor: 160000 }))
  })
  it("supports virtual participation with a custom contribution", async () => {
    render(<SupportShop mode="support" />)
    fireEvent.click(await screen.findByRole("button", { name: "Choose Coastal support" }))
    expect(screen.queryByText("Coastal cap")).toBeNull()
    expect(screen.getByText(/Virtual support does not include a race-day entry or bib/)).toBeTruthy()
    fillBuyer()
    fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "250" } })
    fireEvent.submit(screen.getByRole("button", { name: "Pay with PesaPal" }).closest("form")!)
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/public/shop/orders", expect.objectContaining({ items: [expect.objectContaining({ qty: 1, custom_amount_minor: 25000 })] }), expect.anything()))
    await screen.findByRole("link", { name: "View payment status" })
  })
  it("does not create an order while checkout is disabled", async () => {
    mocks.get.mockImplementation(async (path: string) => path.endsWith("/products") ? [cap] : { pesapal_enabled: false })
    render(<SupportShop mode="shop" />)
    fireEvent.click(await screen.findByRole("button", { name: "Buy Coastal cap" }))
    expect((screen.getByRole("button", { name: "Pay with PesaPal" }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.post).not.toHaveBeenCalled()
  })
})
