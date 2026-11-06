# PesaPal checkout and recovery

The implementation is disabled by default. It supports hosted checkout for KES registration and order payments. The registration form offers PesaPal only when the backend advertises it. Shop callers can use the common PesaPal checkout endpoint with order_slug; the shop and support storefronts use this endpoint.

## Merchant setup and deployment

1. Obtain sandbox merchant credentials. Register a publicly reachable HTTPS IPN endpoint at `https://YOUR_API/api/v1/webhooks/pesapal`, using GET or POST as appropriate, and save its notification ID. Registration is an environment setup operation; the API does not register a new endpoint for every checkout. Use the provider's registration form or API in [RegisterIPNURL](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/registeripnurl).
2. Set `PESAPAL_ENABLED=true`, `PESAPAL_ENVIRONMENT=sandbox`, `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, and `PESAPAL_NOTIFICATION_ID` in deployment secrets/configuration. Set `BASE_URL` to the external API origin and `PESAPAL_RETURN_URL` to the frontend payment status path, such as `https://YOUR_SITE/payment`. Never put merchant credentials in public frontend variables. Enabled startup rejects missing/invalid configuration. HTTP URLs are allowed only for localhost sandbox development; actual provider delivery needs public HTTPS.
3. Run the existing migration command before deploying the API; it adds last_checked_at, next_check_at and verification_attempts to payments. Deploy the frontend and API together. Grant `payment.verify` to authorized finance staff through reviewed role management (Finance, OrgAdmin, SuperAdmin seed defaults); refresh tokens after granting it. No live grants or merchant settings were changed during implementation.
4. Validate real sandbox checkout, IPN delivery/retry, browser return, customer receipt, cancellation, rejection, reversals and settlement records. Confirm enabled payment methods with the merchant account. The fixture does not establish merchant capability or settlement behavior.
5. Use separate live credentials and live IPN registration, HTTPS origins, and `PESAPAL_ENVIRONMENT=live` when launching. Keep sandbox and live deployment data separate. Saved attempts also carry their environment; verification rejects attempts from another environment. A controlled live payment and return/refund must be explicitly authorized and observed before launch. PesaPal refund initiation is not implemented; reversals are synchronized when reported by status lookup.

## Flow and protections

`POST /public/payments/pesapal/checkout` requires an idempotency key and exactly one registration_slug/order_slug. The saved local payment UUID is the merchant reference. A matching retry returns the same attempt; pending/settled payments block a new key. The client submits server-derived amount/currency and saved customer contact details, then returns the validated provider redirect. Submission errors or malformed responses leave a pending attempt and return HTTP 202 with a local payment reference. The server never automatically resubmits the order.

Authentication tokens are cached until shortly before expiry. HTTP calls have timeouts, bounded response decoding and no redirect following. An explicit 401 can refresh the token and retry a status read; submission writes are not automatically replayed. See [Authentication](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/authentication) and [SubmitOrderRequest](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/submitorderrequest).

IPNs and browser returns supply references, not trusted payment status. The server retrieves authoritative status using the tracking ID and verifies the merchant reference, saved tracking ID if present, exact minor-unit amount and currency. A verified status can restore a tracking ID lost during submission. COMPLETED confirms once; FAILED records failure; REVERSED refunds local eligibility; INVALID stays pending. Terminal guards prevent a late success from undoing a reversal. The browser goes only to the configured local payment page. IPN acknowledgment is returned after verification/processing; failures remain retryable. See [GetTransactionStatus](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus).

Each minute the recovery loop claims up to 20 pending attempts with saved tracking IDs, up to eight scheduled checks per attempt. Claims are committed before HTTP; next-check times prevent routine duplicate polling across instances. Failed checks retain state, flag review and back off. A process dying during a check releases the attempt at its next scheduled time. Success receipts and jobs use the existing transactional notification processing. The admin Check status action requires payment.verify and a reason and commits its audit with verified changes.

A pending submission without a tracking ID cannot use the documented tracking-ID lookup. Keep it blocked for review; a later IPN/browser return may recover it. If neither arrives, confirm the outcome with PesaPal before any corrective action. Recovery only schedules pending payments; reversals for already settled payments depend on IPN/admin checks. Historical unprocessed INVALID events are not proof of failure. There is no automatic charge resubmission, refund submission or operator mark-paid action.

## Local verification

Start the committed provider fixture (no credentials/sign-in required):

```sh
postman simulation run postman/simulations/pesapal-checkout.sim.yaml --port 4520 --no-history --output ndjson
```

Use a disposable PostgreSQL database: the test helper resets its public schema. Run from backend:

```sh
TEST_DATABASE_URL='postgres://USER@localhost:PORT/TEST_DB?sslmode=disable' PESAPAL_SIMULATION_URL='http://localhost:4520/pesapal' go test -p 1 ./internal/payments ./internal/jobs ./internal/registrations ./internal/bibs ./cmd/api ./cmd/seed
```

The real Go handlers/client were exercised against this local stand-in. Tests cover matching replay, accepted order with lost response, wrong amount, provider 503, forged tracking IDs, pending recovery, repeated IPNs, reversal/late success, cached/expired tokens, fixed browser redirects, and audited admin verification. Simulation request logs confirmed authentication, submission and status HTTP paths ran. This is mock evidence; no real sandbox account or live payment was used. Browser checkout and real IPN capture remain acceptance tasks. Owner-resource lookup was skipped because the installed CLI rejects postman status; no hosted webhook was created without a real sender to exercise it. The fixture and context are committed local artifacts, not published services.

## Sandbox credential check (2026-11-05)

The supplied sandbox credentials authenticated successfully, including a read-only check using the application's own HTTP client. The returned token was not persisted or printed. GetIpnList reported zero registered sandbox IPNs. Credentials are stored only in ignored backend/.env with mode 0600, and PESAPAL_ENABLED remains false while a public HTTPS endpoint is pending. No PesaPal order, charge or IPN registration was created during this check. This verifies authentication, not merchant payment acceptance. The opt-in TestPesaPalSandboxAuthentication reads the file named by PESAPAL_SANDBOX_ENV_FILE; CI and normal test runs skip it.

## Sandbox acceptance follow-up (2026-11-06)

This section supersedes the earlier authentication-only status. A temporary HTTPS tunnel and sandbox IPN were registered for an isolated acceptance database, with console email and fictitious customers. The application's real client created sandbox race, merchandise and support checkouts. The browser reached the hosted payment form; shop desktop/mobile views were inspected. Actual API checks returned 409 for duplicate email registration and unpaid check-in; repeating a checkout key returned the same payment. Custom support amounts were accepted.

The hosted sandbox card flow did not produce an observed verified COMPLETED transaction. Browser traffic included card-routing requests containing `undefined` returning 404, followed by Payment Processing. Do not treat this as payment acceptance. No successful real IPN processing, customer email delivery, settlement or live funds are claimed. Unverified payments remained pending; expired merchandise reservations were released without fulfillment. The temporary IPN URL must be replaced/re-registered for the next session or deployment.

An observed browser return omitted OrderNotificationType, despite the documented CALLBACKURL value. The callback now accepts omission on that route only and still performs authoritative reference/amount/currency verification. IPNs continue to require IPNCHANGE. Regression simulation covers both callback variants and rejection of a missing IPN type. No hosted URL casing workaround was added to application code.

### Receipts and race-day identification

After verified success, the application queues its own receipt. Race details include participant, registration reference, event, category, date and location; order details include order reference, saved item names, quantities and prices. Both include payment amount and PesaPal confirmation code when returned by the provider. Receipt detail regression tests cover both email and PDF inputs. Email was console-only during acceptance, so real delivery remains unverified.

PesaPal describes printable receipts and email/SMS notifications in its [receipt documentation](https://www.pesapal.com/blog/pesapal-printable-receipts). That page is historical; delivery for this merchant account has not been confirmed. Staff should use the application's verified registration/order record and collection state, rather than a screenshot alone. Receipt issuance does not itself mark a bib, pack or merchandise order collected.

Before launch, complete a successful hosted sandbox payment and observe IPN, browser return, application receipt delivery, repeat notifications, race check-in/bib handover and merchandise collection. Also complete the broader production plan's access, dependency, deployment and operational checks. PesaPal remains disabled in the normal local configuration; no code was pushed or deployed.

Final verification: payments (including the local HTTP simulation), receipts, jobs, registrations, bibs and shop tests passed against disposable PostgreSQL; API and seed packages compiled. Six support/shop and admin-payment frontend tests passed, TypeScript checking passed, and git diff --check passed. The installed Postman CLI still reports postman status as an unknown command. The temporary tunnel/API/frontend listeners were no longer running at wrap-up; the simulator was stopped after verification.
