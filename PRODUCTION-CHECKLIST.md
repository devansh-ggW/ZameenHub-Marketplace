# ZameenHub production checklist

## Before deployment

- [ ] Confirm the Worker name and D1 database ID in wrangler.toml point to the intended existing resources.
- [ ] Confirm run_worker_first = ["/api/*"] is under the [assets] section.
- [ ] Confirm RESEND_API_KEY is a Cloudflare Secret; never commit it.
- [ ] Confirm APP_URL, RESEND_FROM_EMAIL, and SUPPORT_EMAIL use the exact production values and the sender domain is Verified in Resend.
- [ ] Back up D1 and apply all pending D1 migrations through the latest numbered file (`migrations/0005_property_chat.sql`) before deploying Worker code that references the schema. The production migration must be applied to the intended remote `zameenhub` database.
- [ ] Run pnpm build, pnpm test:smoke, and review the final source diff. The smoke check is a wiring check, not a live integration test.
- [ ] Review Privacy Policy and Terms with the actual operator identity, address, governing law, grievance process, and real data-retention practices.
- [ ] Confirm the Worker CPU budget/plan can support PBKDF2 password hashing; test registration and login on the deployed plan and inspect CPU-limit errors.
- [ ] Apply `migrations/0004_media_verification.sql` only after backing up the intended D1 database. Confirm profile image URLs, five-image cap, one-video cap, evidence fields and moderation audit columns exist.
- [ ] URL-based media is not an upload system: owners can reference up to five public HTTPS image URLs, one supported HTTPS video URL and a profile image URL. Files remain on third-party hosts, so check host permissions, link durability and content-policy rights.

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
- [ ] Low-risk, non-duplicate listings that receive a valid Cloudflare Workers AI response may be auto-published. Unscored, medium/high-risk, and duplicate submissions remain pending; AI screening never marks ownership evidence as verified.
- [ ] Only authorized moderator/admin accounts can publish or reject listings.
- [ ] Published listings use D1 data; AI-screened status is labelled separately from human evidence review, and no AI result is presented as proof of legal ownership.
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

- [ ] Back up production D1 and apply pending migrations through `migrations/0005_property_chat.sql` **before** deploying Worker code that references the new schema.
- [ ] Add `MFA_ENCRYPTION_KEY` as a Cloudflare Worker secret (at least 32 random characters); do not commit it or place it in public vars.
- [ ] Confirm `[ai]` / `binding = "AI"` is active for the Worker and check the Workers AI usage dashboard.
- [ ] Configure and test authenticator MFA enrolment, invalid/expired TOTP, one-time recovery codes, rate limits, MFA disable alerts and delete-account confirmation.
- [ ] Verify account deletion revokes sessions and deletes owned property listings; confirm the final administrator cannot self-delete.
- [ ] Verify suspicious, duplicate, and unscored submissions remain pending; low-risk AI-screened submissions may publish, but detailed AI risk reasons stay only in the authorized moderation queue.
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


## Media and evidence-review checks

- [ ] Profile image URL can be saved, cleared, and is returned only in authenticated profile/session or public property-owner context.
- [ ] New and edited listings accept no more than five unique public HTTPS image URLs and one supported video URL. Invalid, local, credential-bearing, and non-HTTPS URLs are rejected.
- [ ] Gallery thumbnails and detail-page video render from saved URLs; broken third-party links degrade gracefully.
- [ ] Evidence reference URL and review note are private from public listing APIs and visible only to the owner and authorized review queue.
- [ ] Low-risk, non-duplicate submissions may be auto-published by Cloudflare AI content-risk screening. `Evidence reviewed` / verified ownership status is separate and can only be set by an authorized moderator after inspecting the reference and documenting what was checked. AI screening alone never sets it.
- [ ] Test the property media SQL triggers directly in D1/SQLite: a sixth image and a second video must be rejected.
- [ ] Confirm public inquiry saves to D1 and attempts owner email notification after a listing is published.
- [ ] Review public-record verification steps with a qualified local professional. There is no universal automated property title API configured in this release.


## Private chat and automatic AI screening
- [ ] Apply `migrations/0005_property_chat.sql` before deploying the conversation endpoints.
- [ ] Verify buyers can start a private chat only for a published property, cannot chat with their own listing, and cannot read another user's conversation.
- [ ] Verify owners can reply from /messages, messages refresh, unread counts clear, and email addresses are not exposed by the chat API.
- [ ] Confirm Cloudflare Workers AI responds with a valid low-risk result; submit a low-risk non-duplicate listing and confirm it publishes with an “AI screened” disclosure, not an ownership-verified badge.
- [ ] Confirm duplicate, high/medium-risk, and unscored listings remain private for review.
- [ ] Add `MFA_ENCRYPTION_KEY` as a Cloudflare Worker Secret (at least 32 random characters) in the production and preview environments separately where required. Never commit it or place it in public vars.
- [ ] Confirm `/api/auth/mfa/status` reports the configuration state and test authenticator enrolment, sign-in challenge, recovery codes, disable MFA, and account deletion with MFA enabled.
