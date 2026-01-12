import { expect, test } from "@playwright/test"

test("admin login -> auto-assign bibs -> export start list", async ({ page }) => {
  const eventSlug = "event-uuid-123"

  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      json: { access_token: "access-token", refresh_token: "refresh-token" }
    })
  )
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        slug: "user-1",
        name: "Admin",
        email: "admin@example.com",
        roles: ["SuperAdmin"],
        permissions: ["bib.assign.manual"]
      }
    })
  )
  await page.route(`**/api/v1/admin/events/${eventSlug}/bibs/auto-assign`, (route) =>
    route.fulfill({ json: { assigned: 5 } })
  )
  await page.route(`**/api/v1/admin/events/${eventSlug}/start-list/export?format=csv`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/csv",
      body: "bib_number,athlete_name\n100,Runner One\n"
    })
  )

  await page.goto("/admin/login")
  await page.getByLabel("Email").fill("admin@example.com")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()

  await page.waitForURL("**/admin/dashboard")

  await page.goto("/admin/bibs")
  await page.getByPlaceholder("event uuid").fill(eventSlug)
  await page.getByRole("button", { name: "Auto-assign bibs" }).click()
  await expect(page.getByText("Auto-assigned 5 bibs")).toBeVisible()

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export CSV" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("start-list.csv")
})
