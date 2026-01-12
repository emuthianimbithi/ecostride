import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

const eventSlug = "malindi"

async function mockEventData(page: Page) {
  await page.route("**/api/v1/public/events/malindi", (route) =>
    route.fulfill({
      json: { Title: "Malindi Marathon", Description: "Coastal race day." }
    })
  )
  await page.route("**/api/v1/public/events/malindi/categories", (route) =>
    route.fulfill({
      json: [{ Slug: "cat-10k", Name: "10K", PriceKESMinor: 1500 }]
    })
  )
  await page.route("**/api/v1/public/events/malindi/waiver/current", (route) =>
    route.fulfill({
      json: { Title: "Waiver", Content: "Standard waiver terms." }
    })
  )
}

async function completeRegistrationSteps(page: Page) {
  await page.getByLabel("10K").check()
  await page.getByRole("button", { name: "Continue" }).click()

  await page.getByPlaceholder("Athlete name").fill("Jane Runner")
  await page.getByPlaceholder("Email").fill("jane@example.com")
  await page.getByPlaceholder("Phone").fill("254700000005")
  await page.getByRole("button", { name: "Continue" }).click()

  await page.getByRole("button", { name: "Continue" }).click()

  await page.getByLabel("I accept the waiver terms").check()
  await page.getByRole("button", { name: "Continue" }).click()
}

test("registration -> Stripe checkout -> payment status", async ({ page }) => {
  await mockEventData(page)

  await page.route("**/api/v1/public/registrations", (route) =>
    route.fulfill({ status: 201, json: { Slug: "reg-123" } })
  )
  await page.route("**/api/v1/public/payments/stripe/checkout", (route) =>
    route.fulfill({
      json: { checkout_url: "http://localhost:3000/payment/stripe-test" }
    })
  )
  await page.route("**/api/v1/public/payments/stripe-test/status", (route) =>
    route.fulfill({
      json: {
        payment_id: "stripe-test",
        status: "success",
        provider: "STRIPE",
        currency: "KES",
        amount: 1500,
        registration_slug: "reg-123"
      }
    })
  )

  await page.goto(`/register/${eventSlug}`)
  await completeRegistrationSteps(page)

  await page.getByLabel("Stripe Checkout").check()
  await page.getByRole("button", { name: "Submit & Pay" }).click()

  await page.waitForURL("**/payment/stripe-test")
  await expect(page.getByText("Payment Status")).toBeVisible()
  await expect(page.getByRole("link", { name: "View confirmation" })).toBeVisible()
})

test("registration -> M-Pesa -> payment status", async ({ page }) => {
  await mockEventData(page)

  await page.route("**/api/v1/public/registrations", (route) =>
    route.fulfill({ status: 201, json: { Slug: "reg-mpesa" } })
  )
  await page.route("**/api/v1/public/payments/mpesa/stk", (route) =>
    route.fulfill({
      json: {
        payment_id: "mpesa-test",
        status: "pending",
        checkout_request_id: "checkout-1",
        customer_message: "STK sent"
      }
    })
  )
  await page.route("**/api/v1/public/payments/mpesa-test/status", (route) =>
    route.fulfill({
      json: {
        payment_id: "mpesa-test",
        status: "success",
        provider: "MPESA",
        currency: "KES",
        amount: 1500,
        registration_slug: "reg-mpesa"
      }
    })
  )

  await page.goto(`/register/${eventSlug}`)
  await completeRegistrationSteps(page)

  await page.getByLabel("M-Pesa STK").check()
  await page.getByPlaceholder("M-Pesa phone").fill("254700000006")
  await page.getByRole("button", { name: "Submit & Pay" }).click()

  await page.waitForURL("**/payment/mpesa-test")
  await expect(page.getByText("Payment Status")).toBeVisible()
  await expect(page.getByRole("link", { name: "View confirmation" })).toBeVisible()
})
