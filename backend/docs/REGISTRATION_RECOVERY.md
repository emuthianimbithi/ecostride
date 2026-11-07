# Returning registration and payment recovery

The event registration page offers “Continue your registration” and opens it when signup returns the existing-registration conflict. The customer supplies their original email and requests a secure link. No registration identifier, participant details or match result is returned from that public lookup.

The requested email contains a 15-minute, single-use link to `/registration-recovery#token=...`. The fragment is read by the browser, not sent in HTTP URLs/referrers. Opening the page does not consume the link or initiate payment; the customer explicitly chooses Verify and continue. The page then clears the fragment. Refreshing after verification may require another email because the result is held only in page memory.

Verification returns a minimal summary and one of these actions:

| State | Action |
| --- | --- |
| Confirmed eligible paid/free entry | View the existing ticket |
| Pending/processing payment, including uncertain submission | View/resume that attempt; no new attempt is created |
| Unpaid entry without an attempt, or with only failed attempts | Customer chooses Continue payment, creating a new PesaPal attempt for the same registration |
| Cancelled/ineligible or otherwise unsupported entry | Contact support |

Settled and pending attempts outrank later failed attempts during lookup. The normal checkout target locks/idempotency rules still govern every payment request, including two recovered browsers acting at once. A network retry in the recovery page reuses its checkout key. Verification itself creates neither a registration nor a payment. A person whose original signup never saved can still register normally with the same email.

## Protections and delivery

Tokens contain 32 random bytes; the recovery table stores SHA-256 hashes, expiry and consumption time. Consumption is serialized under a row lock. Expired, used, forged tokens and tokens whose registration email changed cannot reveal an entry. The registration owns recovery records through a cascading foreign key.

Requested emails are queued transactionally with the hash record. The queue's bearer token is encrypted with AES-GCM using a domain-separated key derived from JWT_SECRET; only the worker decrypts it. The worker removes the encrypted token after acceptance/skip while it owns that job attempt. Resend uses the existing stable job idempotency key. Rotating JWT_SECRET can invalidate queued, unsent recovery emails; request a new link afterward. Do not expose queue payloads, the JWT secret or full recovery links.

Recovery requires configured Resend or SMTP and JWT_SECRET; console mode cannot send/log recovery links. Requests are limited to three per IP per minute, with database-enforced one email per registration per minute and five per hour. Match/no-match and cooldown responses share the same generic 202 message. Verification is IP-rate-limited; both request bodies are bounded to 4 KiB. A valid new link does not invalidate other unexpired links, but every link can be consumed only once.

## Deployment and verification

Run the existing migration command from the newly built image before deploying the frontend/API; it creates registration_recoveries. No new secrets are required beyond the existing JWT_SECRET and configured email delivery. Deploy both frontend and API, then use your own registered email to verify actual delivery and resume behavior. Tests do not send real recovery emails or charge a merchant account.

Backend tests cover generic lookup privacy, normalized email, cooldown, encrypted queue payload/hash storage, forged/expired/used tokens, concurrent single-use consumption, failed/pending/paid/review routing and no payment/registration creation during verification. Six Playwright registration/recovery scenarios passed against mocked API replies; TypeScript checking passed. Browser tests ran on an isolated port so another local app could not be reused accidentally:

```sh
PLAYWRIGHT_PORT=13009 npx playwright test e2e/registration-recovery.spec.ts e2e/registration-flow.spec.ts --workers=1
```

Playwright now requires explicit PLAYWRIGHT_REUSE_SERVER=true to reuse a running server. The database tests use a disposable PostgreSQL database because the test helper resets its schema.
