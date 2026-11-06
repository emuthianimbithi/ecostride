import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import BibsPage from "../app/admin/bibs/page"

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), permission: vi.fn(), toast: vi.fn() }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("../lib/api-client", () => ({ apiGet: mocks.get, apiPost: mocks.post, apiFetchResponse: vi.fn() }))
vi.mock("../components/auth-provider", () => ({ useAuth: () => ({ hasPermission: mocks.permission }) }))
vi.mock("../components/toast", () => ({ useToast: () => ({ toast: mocks.toast }) }))
const event = { slug: "race-1", url_slug: "race", title: "Race", start_at: "2026-12-01T07:00:00Z", location: "Malindi", type: "MARATHON" }
const entry = { slug: "entry-1", athlete_name: "Runner", status: "pending_payment", category_name: "10K", eligible: false }
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("race desk permissions", () => {
  it("uses limited lookup and hides bib controls from check-in staff", async () => {
    mocks.permission.mockImplementation((permission: string) => permission === "checkin.access")
    mocks.get.mockImplementation(async (path: string) => path === "/admin/race-day/events" ? [event] : [entry])
    render(<BibsPage />)
    await screen.findByRole("option", { name: /Race \(/ })
    fireEvent.change(screen.getByRole("combobox"), { target: { value: event.slug } })
    await screen.findByText("Runner")
    expect(mocks.get).toHaveBeenCalledWith("/admin/race-day/events/race-1/entries?search=")
    expect(screen.queryByRole("button", { name: "Auto-assign bibs" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Assign bib" })).toBeNull()
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Mark bib collected" })).toBeDisabled()
    expect(mocks.get.mock.calls.every(([path]) => !path.startsWith("/admin/registrations"))).toBe(true)
  })

  it("searches on the server and records an eligible check-in", async () => {
    mocks.permission.mockImplementation((permission: string) => permission === "checkin.access")
    mocks.get.mockImplementation(async (path: string) => path === "/admin/race-day/events" ? [event] : [{ ...entry, eligible: true, status: "confirmed" }])
    mocks.post.mockResolvedValue({})
    render(<BibsPage />)
    await screen.findByRole("option", { name: /Race \(/ })
    fireEvent.change(screen.getByRole("combobox"), { target: { value: event.slug } })
    await screen.findByText("Runner")
    fireEvent.change(screen.getByPlaceholderText("Search by name, reference, category, or bib"), { target: { value: "entry-1" } })
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/admin/race-day/events/race-1/entries?search=entry-1"))
    fireEvent.click(await screen.findByRole("button", { name: "Check in" }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/checkin/entry-1", { checked_in: true }))
  })
})
