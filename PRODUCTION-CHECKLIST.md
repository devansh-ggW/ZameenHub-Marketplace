# ZameenHub production checklist

## Before deployment

- [ ] Confirm the Worker name and D1 database ID in wrangler.toml point to the intended existing resources.
- [ ] Confirm run_worker_first = ["/api/*"] is under the [assets] section.
- [ ] Confirm RESEND_API_KEY is a Cloudflare Secret; never commit it.
- [ ] Confirm APP_URL, RESEND_FROM_EMAIL, and SUPPORT_EMAIL use the exact production values and the sender domain is Verified in Resend.
- [ ] Back up D1 and apply migrations/0002_native_email_auth.sql with npx wrangler d1 migrations apply zameenhub --remote before deploying the new Worker code.
- [ ] Run pnpm build, pnpm test:smoke, and review the final source diff. The smoke check is a wiring check, not a live integration test.
- [ ] Review Privacy Policy and Terms with the actual operator identity, address, governing law, grievance process, and real data-retention practices.
- [ ] Confirm the Worker CPU budget/plan can support PBKDF2 password hashing; test registration and login on the deployed plan and inspect CPU-limit errors.
- [ ] Photo uploads are not enabled by this release. Configure and test R2 upload, validation and public delivery before promising property photo uploads.

## End-to-end production tests

- [ ] New user can register; duplicate registration does not leak account status.
- [ ] Verification mail is actually delivered from the correct sender; expired and used tokens are rejected.
- [ ] A pre-existing user row with no password hash can use email-confirmed legacy activation.
- [ ] Unverified users cannot log in or submit listings.
- [ ] Verified users can log in; session cookie is Secure, HttpOnly, SameSite=Lax and scoped to /.
- [ ] Logout invalidates the server session.
- [ ] Password-reset email is delivered; token expires and is one-use; reset revokes existing sessions.
- [ ] Direct visit to /list-property while logged out redirects to sign-in; sign-up remains available.
- [ ] Server rejects unauthenticated listing submissions even if the frontend guard is bypassed.
- [ ] Submitted listings remain pending and are not visible through public search.
- [ ] Only authorized moderator/admin accounts can publish or reject listings.
- [ ] Published listings use D1 data; no fabricated property inventory or verification claims are shown.
- [ ] Favorites persist per account and cannot be changed for unpublished/nonexistent properties.
- [ ] Inquiry is stored and owner notification is delivered; missing notification is reported honestly.
- [ ] Support form actually sends to dewifystores@gmail.com; failed delivery is not shown as success.
- [ ] /api/* responds with JSON, not the SPA HTML fallback.
- [ ] Check mobile layout, keyboard focus, reduced motion, errors, and unknown routes.
- [ ] Test restoring a D1 backup before accepting real traffic or valuable data.

## Do not skip

- [ ] Apply and confirm the D1 migration before deploying Worker code that references the new columns and tables.
- [ ] Use a verified sender address on the exact Resend-verified domain.
- [ ] Keep RESEND_API_KEY secret.
- [ ] Have a qualified local professional review legal pages for the real business and jurisdiction.


## Additional checks for MFA and AI risk screening

- [ ] Back up production D1 and apply `migrations/0003_security_mfa_ai.sql` **before** deploying the updated Worker.
- [ ] Add `MFA_ENCRYPTION_KEY` as a Cloudflare Worker secret (at least 32 random characters); do not commit it or place it in public vars.
- [ ] Confirm `[ai]` / `binding = "AI"` is active for the Worker and check the Workers AI usage dashboard.
- [ ] Configure and test authenticator MFA enrolment, invalid/expired TOTP, one-time recovery codes, rate limits, MFA disable alerts and delete-account confirmation.
- [ ] Verify account deletion revokes sessions and deletes owned property listings; confirm the final administrator cannot self-delete.
- [ ] Verify suspicious submissions remain pending and expose AI risk evidence only in the authorized moderation queue.
- [ ] Verify the cookie banner and /cookies policy against the actual production scripts; update policy if analytics or marketing tools are added.
- [ ] Read [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) and complete every launch blocker listed there.
- [ ] Pin direct package versions and run frozen-lockfile install, typecheck, production build and smoke tests in CI.
- [ ] Verify concurrent reuse attempts for email verification, legacy activation and password reset accept each token only once; confirm sign-up responses do not reveal whether an email is already registered.
- [ ] Confirm listing submitters cannot retrieve AI risk scores/reasons from the response or public property API; only the authorized review queue should contain detailed risk evidence.
- [ ] Test that oversized request bodies are canceled while streaming and that no API mutation succeeds with a missing or mismatched Origin.


## Discovery, calculator and SEO checks

- [ ] Run the EMI calculation tests; verify zero-interest and nonzero-rate examples and the estimate disclaimer.
- [ ] Confirm sitemap.xml contains only public pages and robots.txt disallows private account/moderation routes from indexing.
- [ ] After property inventory is real and published, consider a generated sitemap for published listing URLs; do not include pending or rejected listings.
- [ ] Add map/autocomplete and any property value estimates only with a real, permitted data source and transparent limitations.
