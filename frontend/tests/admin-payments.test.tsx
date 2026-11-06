import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import PaymentsPage from "../app/admin/payments/page"

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), permission: vi.fn(), toast: vi.fn() }))
vi.mock("../lib/api-client", () => ({ apiGet: mocks.get, apiPost: mocks.post }))
vi.mock("../components/auth-provider", () => ({ useAuth: () => ({ hasPermission: mocks.permission }) }))
vi.mock("../components/toast", () => ({ useToast: () => ({ toast: mocks.toast }) }))
const payment = { payment_id: "payment-1", status: "success", provider: "STRIPE", currency: "KES", amount_minor: 1500, provider_ref: "cs-1", created_at: "2026-11-05T10:00:00Z", payer_name: "Runner" }

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks() })

describe("payment recovery console", () => {
  it("shows real details and hides finance actions from read-only staff", async () => {
    mocks.permission.mockReturnValue(false)
    mocks.get.mockImplementation(async (path: string) => path === "/admin/payments" ? [payment] : { ...payment, requires_review: true, events: [{ type: "checkout.session.completed", received_at: payment.created_at, processed_at: payment.created_at }], delivery_jobs: [], receipt: null })
    render(<PaymentsPage />)
    await screen.findByText("Runner")
    expect(screen.queryByRole("button", { name: "Refund" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Resend receipt" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "View details" }))
    await screen.findByText("Needs finance review.")
    expect(mocks.get).toHaveBeenCalledWith("/admin/payments/payment-1")
    expect(screen.getByText(/checkout.session.completed/)).toBeTruthy()
  })

  it("queues a receipt with a reason and ignores cancelled prompts", async () => {
    mocks.permission.mockReturnValue(true)
    mocks.get.mockResolvedValue([payment])
    mocks.post.mockResolvedValue({ status: "queued" })
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null)
    render(<PaymentsPage />)
    const resend = await screen.findByRole("button", { name: "Resend receipt" })
    fireEvent.click(resend)
    expect(mocks.post).not.toHaveBeenCalled()
    prompt.mockReturnValue("Customer requested a copy")
    fireEvent.click(resend)
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/payments/payment-1/resend-receipt", { reason: "Customer requested a copy" }))
  })
  it("checks a tracked PesaPal payment with an audit reason", async () => {
    mocks.permission.mockReturnValue(true)
    const pesapal = { ...payment, provider: "PESAPAL", status: "pending" }
    const detail = { ...pesapal, requires_review: true, events: [], delivery_jobs: [], receipt: null, verification_attempts: 1, last_checked_at: null }
    mocks.get.mockImplementation(async (path: string) => path === "/admin/payments" ? [pesapal] : detail)
    mocks.post.mockResolvedValue({ status: "pending" })
    vi.spyOn(window, "prompt").mockReturnValue("Customer payment check")
    render(<PaymentsPage />)
    await screen.findByText("Runner")
    fireEvent.click(screen.getByRole("button", { name: "View details" }))
    fireEvent.click(await screen.findByRole("button", { name: "Check status with PesaPal" }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/payments/payment-1/verify", { reason: "Customer payment check" }))
  })

})
