import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

async function mockEventData(page: Page, enabled = true) {
  await page.route("**/api/v1/public/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/payments/providers")) return route.fulfill({ json: { pesapal_enabled: enabled } })
    if (path.endsWith("/events/malindi")) return route.fulfill({ json: { title: "Malindi Marathon", description: "Coastal race day.", status: "published" } })
    if (path.endsWith("/categories")) return route.fulfill({ json: [{ slug: "cat-10k", name: "10K", price_kes_minor: 150000 }] })
    if (path.endsWith("/waiver/current")) return route.fulfill({ json: { slug: "waiver-1", title: "Waiver", content: "Standard waiver terms." } })
    if (path.endsWith("/form-fields")) return route.fulfill({ json: [] })
    return route.fulfill({ status: 404, json: {} })
  })
}

async function completeRegistrationSteps(page: Page) {
  await page.getByRole("radio", { name: /10K/ }).check()
  await page.getByRole("button", { name: "Continue" }).click()
  await page.getByLabel("Athlete name", { exact: true }).fill("Jane Runner")
  await page.getByLabel("Email", { exact: true }).fill("jane@example.com")
  await page.getByLabel("Phone", { exact: true }).fill("254700000005")
  await page.getByRole("button", { name: "Continue" }).click()
  await page.getByRole("button", { name: "Continue" }).click()
  await page.getByLabel("I accept the waiver terms").check()
  await page.getByRole("button", { name: "Continue" }).click()
}

test("registration offers only PesaPal and sends accepted waiver and KES checkout", async ({ page }) => {
  await mockEventData(page)
  await page.route("**/api/v1/public/registrations", route => {
    expect(route.request().postDataJSON()).toMatchObject({ waiver_accepted: true, waiver_slug: "waiver-1" })
    return route.fulfill({ status: 201, json: { slug: "reg-123", status: "pending_payment" } })
  })
  await page.route("**/api/v1/public/payments/pesapal/checkout", route => {
    expect(route.request().postDataJSON()).toEqual({ registration_slug: "reg-123", currency: "KES" })
    expect(route.request().headers()["x-idempotency-key"]).toBeTruthy()
    return route.fulfill({ json: { payment_id: "pesapal-test", checkout_url: "/payment/pesapal-test" } })
  })
  await page.route("**/api/v1/public/payments/pesapal-test/status", route => route.fulfill({ json: { payment_id: "pesapal-test", status: "pending", provider: "PESAPAL", currency: "KES", amount_minor: 150000, registration_slug: "reg-123" } }))
  await page.goto("/register/malindi")
  await completeRegistrationSteps(page)
  await expect(page.getByRole("radio", { name: /PesaPal/ })).toBeChecked()
  await expect(page.getByRole("radio")).toHaveCount(1)
  await expect(page.getByText("Stripe", { exact: true })).toHaveCount(0)
  await expect(page.getByText("M-Pesa", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Submit registration" }).click()
  await page.waitForURL("**/payment/pesapal-test")
})

test("disabled PesaPal prevents creating an unpaid registration with a legacy fallback", async ({ page }) => {
  await mockEventData(page, false)
  let registrations = 0
  await page.route("**/api/v1/public/registrations", route => { registrations++; return route.fulfill({ status: 500, json: {} }) })
  await page.goto("/register/malindi")
  await completeRegistrationSteps(page)
  await expect(page.getByRole("radio")).toHaveCount(0)
  await expect(page.getByText("Online payments are temporarily unavailable. Please try again later.")).toBeVisible()
  await page.getByRole("button", { name: "Submit registration" }).click()
  await expect(page).toHaveURL(/register\/malindi/)
  expect(registrations).toBe(0)
})
