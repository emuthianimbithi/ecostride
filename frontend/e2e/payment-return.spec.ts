import { expect, test } from "@playwright/test"

for (const result of ["success", "failed"]) {
  test(`hosted checkout shows ${result} on our site without provider return`, async ({ page }) => {
    let status = "pending"
    await page.route("https://pay.pesapal.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test hosted payment form</h1>" }))
    await page.route("**/api/v1/public/payments/payment-test/status", route => route.fulfill({ json: {
      payment_id: "payment-test", status, provider: "PESAPAL", currency: "KES", amount_minor: 80000,
      payer_name: "Jane Buyer", description: "Coastal Cap × 1", order_slug: "order-test",
      checkout_url: status === "pending" ? "https://pay.pesapal.com/iframe/test" : "",
      receipt_url: status === "success" ? "/api/v1/public/payments/payment-test/receipt.pdf" : ""
    } }))
    await page.goto("/payment/payment-test/checkout")
    await expect(page.getByRole("heading", { name: "Complete your payment" })).toBeVisible()
    await expect(page.getByText("Coastal Cap × 1")).toBeVisible()
    await expect(page.frameLocator('iframe[title="PesaPal secure payment"]').getByRole("heading", { name: "Test hosted payment form" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Download receipt" })).toHaveCount(0)
    status = result
    await expect(page.getByRole("heading", { name: result === "success" ? "Thank you. Your payment is confirmed." : "Your payment was not completed." })).toBeVisible({ timeout: 12000 })
    await expect(page.locator("iframe")).toHaveCount(0)
    await expect(page).toHaveURL(/\/payment\/payment-test\/checkout$/)
    if (result === "success") await expect(page.getByRole("link", { name: "Download receipt" })).toHaveAttribute("href", "/api/v1/public/payments/payment-test/receipt.pdf")
    else await expect(page.getByRole("link", { name: "Download receipt" })).toHaveCount(0)
    await expect(page.getByRole("link", { name: "View order" })).toHaveAttribute("href", "/orders/order-test")
  })
}
