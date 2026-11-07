import { expect, test } from "@playwright/test"

test("email verification is explicit, then a failed payment can be retried on the same entry",async({page})=>{
 let verification=0,checkouts=0,signups=0
 await page.route("**/api/v1/public/registrations",route=>{signups++;return route.fulfill({status:500,json:{}})})
 await page.route("**/api/v1/public/registrations/recover/verify",route=>{verification++;expect(route.request().postDataJSON()).toEqual({token:"a".repeat(64)});return route.fulfill({json:{registration_slug:"entry-existing",event_title:"Estuary Marathon",athlete_name:"Jane Runner",next_action:"retry_payment"}})})
 await page.route("**/api/v1/public/payments/pesapal/checkout",route=>{checkouts++;expect(route.request().postDataJSON()).toEqual({registration_slug:"entry-existing",currency:"KES"});expect(route.request().headers()["x-idempotency-key"]).toBeTruthy();return route.fulfill({json:{payment_id:"retry-payment",checkout_url:"https://pay.pesapal.com/iframe/test"}})})
 await page.route("**/api/v1/public/payments/retry-payment/status",route=>route.fulfill({json:{payment_id:"retry-payment",status:"pending",provider:"PESAPAL",currency:"KES",amount_minor:10000}}))
 await page.goto("/registration-recovery#token="+"a".repeat(64))
 await expect(page.getByRole("button",{name:"Verify and continue"})).toBeVisible()
 expect(verification).toBe(0);expect(checkouts).toBe(0)
 await page.getByRole("button",{name:"Verify and continue"}).click()
 await expect(page.getByText("Jane Runner")).toBeVisible()
 expect(verification).toBe(1);expect(checkouts).toBe(0)
 await expect(page).toHaveURL(/registration-recovery$/)
 await page.getByRole("button",{name:"Continue payment"}).click()
 await page.waitForURL("**/payment/retry-payment/checkout")
 expect(checkouts).toBe(1);expect(signups).toBe(0)
})

for(const action of ["view_payment","view_ticket"]){
 test(`verified ${action} does not start another payment`,async({page})=>{
  let checkouts=0
  await page.route("**/api/v1/public/registrations/recover/verify",route=>route.fulfill({json:{registration_slug:"entry-existing",event_title:"Estuary Marathon",athlete_name:"Jane Runner",next_action:action,payment_id:"pending-existing"}}))
  await page.route("**/api/v1/public/payments/pesapal/checkout",route=>{checkouts++;return route.fulfill({status:500,json:{}})})
  await page.goto("/registration-recovery#token="+"b".repeat(64))
  await page.getByRole("button",{name:"Verify and continue"}).click()
  await expect(page.getByRole("link",{name:action==="view_payment"?"View existing payment":"View your race ticket"})).toHaveAttribute("href",action==="view_payment"?"/payment/pending-existing/checkout":"/confirm/entry-existing")
  await expect(page.getByRole("button",{name:"Continue payment"})).toHaveCount(0)
  expect(checkouts).toBe(0)
 })
}
