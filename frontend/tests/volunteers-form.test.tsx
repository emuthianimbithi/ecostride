import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import VolunteersPage from "../app/volunteers/page"

describe("Volunteer signup", () => {
  it("blocks submission when required fields are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://example.test/api/v1")

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo) => {
      const url = String(input)
      if (url.endsWith("/public/events")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }))
      }
      return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
    })
    // @ts-expect-error test override
    global.fetch = fetchMock

    const user = userEvent.setup()
    render(<VolunteersPage />)
    const submitButton = screen.getByRole("button", { name: /submit/i })
    fireEvent.submit(submitButton.closest("form")!)

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/public/volunteers"), expect.anything())
  })

  it("submits valid volunteer details", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://example.test/api/v1")

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/public/events")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }))
      }
      if (url.endsWith("/public/volunteers")) {
        return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
      }
      return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
    })
    // @ts-expect-error test override
    global.fetch = fetchMock

    const user = userEvent.setup()
    render(<VolunteersPage />)

    await user.type(screen.getByPlaceholderText("Name"), "Amina")
    await user.type(screen.getByPlaceholderText("Email"), "amina@example.com")
    await user.type(screen.getByPlaceholderText("Phone (optional)"), "254700000004")
    await user.click(screen.getByLabelText("Check-in"))
    const submitButton = screen.getByRole("button", { name: /submit/i })
    fireEvent.submit(submitButton.closest("form")!)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://example.test/api/v1/public/volunteers",
        expect.objectContaining({ method: "POST" })
      )
    })
  })
})
