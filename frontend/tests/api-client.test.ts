import { describe, expect, it, vi } from "vitest"
import { apiFetch, ApiError } from "../lib/api-client"

describe("apiFetch", () => {
  it("throws ApiError with parsed contract", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://example.test/api/v1")

    const payload = {
      error: { code: "VALIDATION_ERROR", message: "Validation failed", details: [{ field: "Email", issue: "required" }] }
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 422, headers: { "Content-Type": "application/json" } })
    )
    global.fetch = fetchMock

    try {
      await apiFetch("/anything", { method: "POST", body: JSON.stringify({}) })
      throw new Error("expected apiFetch to throw")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.status).toBe(422)
      expect(apiErr.code).toBe("VALIDATION_ERROR")
      expect(apiErr.message).toBe("Validation failed")
    }
  })

  it("preserves snake_case keys in response", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://example.test/api/v1")

    const payload = {
      user_id: 123,
      first_name: "Test",
      settings: {
        theme_mode: "dark",
        notifications_enabled: true
      }
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })
    )
    global.fetch = fetchMock

    const response = await apiFetch<typeof payload>("/profile")

    // keys should remain snake_case
    expect(response).toHaveProperty("user_id", 123)
    expect(response).toHaveProperty("first_name", "Test")
    expect(response.settings).toHaveProperty("theme_mode", "dark")
    expect(response.settings).toHaveProperty("notifications_enabled", true)

    // verify no automagic camelCase conversion happened
    expect(response).not.toHaveProperty("userId")
    expect(response).not.toHaveProperty("firstName")
    expect(response.settings).not.toHaveProperty("themeMode")
  })
})
