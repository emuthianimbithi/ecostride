import { expect, test } from "@playwright/test"

test("import results -> publish -> public results visible", async ({ page }) => {
  const eventSlug = "event-results-123"

  await page.addInitScript(() => {
    localStorage.setItem("access_token", "access-token")
    localStorage.setItem("refresh_token", "refresh-token")
  })

  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        slug: "user-1",
        name: "Admin",
        email: "admin@example.com",
        roles: ["SuperAdmin"],
        permissions: ["results.import", "results.publish"]
      }
    })
  )
  await page.route(`**/api/v1/admin/events/${eventSlug}/results/import`, (route) =>
    route.fulfill({ json: { imported: 2, failed: 0 } })
  )
  await page.route(`**/api/v1/admin/events/${eventSlug}/results/publish`, (route) =>
    route.fulfill({ json: { status: "published" } })
  )
  await page.route("**/api/v1/public/results/events/malindi", (route) =>
    route.fulfill({
      json: [
        {
          BibNumber: 101,
          Name: "Runner One",
          CategoryName: "10K",
          Gender: "F",
          FinishSeconds: 3600,
          PositionOverall: 1
        }
      ]
    })
  )

  await page.goto("/admin/results")
  await page.getByPlaceholder("event uuid").fill(eventSlug)

  await page.setInputFiles("input[type=\"file\"]", {
    name: "results.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("bib_number,name,finish_seconds\n101,Runner One,3600\n")
  })

  await page.getByRole("button", { name: "Import results" }).click()
  await expect(page.getByText(/Imported 2 rows/)).toBeVisible()

  await page.getByRole("button", { name: "Publish" }).click()
  await expect(page.getByText("Results published")).toBeVisible()

  await page.goto("/results/malindi")
  await expect(page.getByText("Runner One")).toBeVisible()
})
