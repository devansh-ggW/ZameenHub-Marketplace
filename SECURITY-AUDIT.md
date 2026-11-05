# ZameenHub security and production-readiness review

**Current repository review:** 5 November 2026  
**Baseline:** repository and implementation review, not an independent penetration test or legal opinion.

## Scope and limitations

This review covers the repository's React/TypeScript/Vite frontend, Cloudflare Worker API, D1 migrations, ImageKit and Resend integration code, Wrangler configuration, CI workflows, static production checks and documentation.

A source review cannot prove that production secrets are configured correctly, migrations have been applied to the remote D1 database, provider accounts work, browser journeys succeed, or a deployed application is free of vulnerabilities. Those require controlled non-production tests and operator access. No production migration, secret change, DNS change, production deployment or data deletion is authorized by this review.

## Current implementation snapshot

- **Architecture:** React, TypeScript and Vite frontend; Cloudflare Workers API; Cloudflare D1; ImageKit for property/profile images and uploaded PDF/image evidence; Resend for transactional email.
- **Evidence:** sellers can upload supported PDF/image evidence to ImageKit or supply external HTTPS PDF/image links. D1 stores descriptive metadata and ImageKit file identifiers/paths, not file bytes. The Worker does not fetch, proxy or rehost seller-hosted files.
- **Public listing eligibility:** a listing needs at least one active property photo and one active PDF/image evidence item to appear in public discovery. New listings remain drafts while required uploads complete. Existing incomplete listings are hidden from public discovery but remain available to their owners for repair.
- **Publication and evidence review are separate:** an eligible listing may be public while marked Unverified. Only an authorized administrator can separately record an evidence review. That action does not prove identity, ownership, clear title, document authenticity or freedom from disputes.
- **Authentication:** email/password authentication, verification and recovery, server-issued session cookies, optional TOTP MFA and one-time recovery codes are implemented in the repository.
- **Session policy:** the Worker enforces a rolling 30-day inactivity window capped by a 90-day absolute lifetime. Session identifiers are opaque and token hashes are stored in D1; browser cookies are configured Secure, HttpOnly and SameSite=Lax.
- **Scope exclusions:** Cloudflare R2 is not used. Phase 1 video upload/playback, OCR and automatic legal-document verification are not part of the current implementation.
- **Database:** repository migrations run through `migrations/0010_imagekit_property_evidence.sql`. This does not establish the migration state of the production D1 database.
- **UI/brand:** the product uses a light visual foundation with blue accents. The exact icon assets and every responsive state still need a live browser review.

## Repository-level controls found

| Area | Current implementation observed | Remaining verification |
|---|---|---|
| Authentication | Email/password flows, email verification and password recovery routes, server-issued sessions | Exercise registration, login, reset, expiry and concurrent sessions on a non-production environment |
| Session security | Secure, HttpOnly, SameSite=Lax cookies; hashed session tokens; rolling/absolute expiry; logout-all route | Verify browser behavior, cookie expiration and revocation with multiple browsers/devices |
| MFA | TOTP, encrypted secrets, replay counter handling and hashed one-time recovery codes | Verify authenticator interoperability, encryption-secret setup and recovery behavior in non-production |
| Authorization | Worker-side user/role and object ownership checks are used for sensitive operations | Run cross-account IDOR/BOLA tests across every property, media, evidence, profile, conversation, message and admin route |
| Request controls | Request body caps, Origin validation on state-changing requests, rate limiting and bounded inputs are present | Test malformed payloads, concurrency, rate limits and actual production-origin behavior |
| ImageKit | Worker-side upload/delete integration, file signature checks, listing ownership checks, file limits and D1 metadata | Test restricted-key permissions, provider outages, upload reconciliation, replacements, cleanup and wrong-owner rejection |
| External evidence links | HTTPS URL validation; original seller-hosted resources are not fetched or proxied | Test unsafe schemes, credentials, malformed input and browser link behavior |
| D1 integrity | Ordered additive migrations, ownership columns, media/evidence metadata and cleanup tracking | Apply 0001–0010 to a non-production database, run foreign-key checks and test backup restoration |
| Resend | Server-side provider call and plain-text/HTML email construction | Verify sender-domain authentication, real delivery, token expiry and failure reporting |
| Browser security | Static and Worker response policies include no-store for API JSON, HSTS, nosniff, frame protection, referrer and permissions policies, plus same-origin resource policy | Inspect deployed headers and confirm the CSP works with all legitimate assets and routes |
| CI and supply chain | Frozen pnpm lockfile install, dependency audit, migrations/tests/build/smoke/dry-run, CodeQL and Dependabot workflows | Re-run checks on the final PR head and inspect any Cloudflare preview build failure |

## Current security and release risks

### P0 — no confirmed source-level critical issue established by this review

This is not a claim that no critical vulnerability exists. Full adversarial testing has not been performed.

### P1 — release gates that remain open

1. **Remote D1 state and recovery:** verify the actual production migration state through 0010, take a restorable backup, and prove restoration on a safe non-production copy before a production release.
2. **Provider configuration:** verify `RESEND_API_KEY`, `MFA_ENCRYPTION_KEY` and `IMAGEKIT_PRIVATE_KEY` as Worker secrets, and `IMAGEKIT_URL_ENDPOINT` as a Worker variable. Never paste secret values into chat or commit them. Confirm ImageKit's restricted key has only the permissions needed for upload and deletion.
3. **ImageKit acceptance:** use a non-production account to test accepted and rejected file types, invalid signatures, size limits, wrong-owner attempts, D1 failures after provider upload, deletion retries and provider outages.
4. **Cross-account authorization:** test every sensitive Worker route using at least two normal users and an administrator. Verify that changing IDs or submitting forged roles/owner IDs cannot read or mutate another account's records.
5. **Authentication and MFA acceptance:** test email delivery, verification/recovery token replay and expiry, MFA enrollment/disablement, invalid and replayed TOTP codes, recovery-code single use, session renewal and logout-all.
6. **Cloudflare preview build:** PR #28's Cloudflare bot reported a preview build failure for commit `84af995`. The GitHub workflow summaries show CI and CodeQL succeeded, but the detailed Cloudflare build log was not available through the connected repository tools. Inspect the linked Cloudflare build before release.
7. **Legal/operator disclosure:** complete the actual operator identity, address, jurisdiction, grievance/contact process and retention disclosures with the responsible operator and qualified Indian counsel. These facts must not be invented in repository copy.
8. **External security review:** obtain an independent review before making strong security or trust claims to the public.

### P2 — remaining quality work

- Exercise reporting, moderation audit, owner listing lifecycle, buyer/seller messaging and message actions with separate user accounts.
- Verify responsive layouts, keyboard interaction, accessible labels, focus handling and reduced-motion behavior across all major pages.
- Review query limits, pagination, request amplification, logs, cache behavior, provider timeouts and media cleanup under realistic non-production failure conditions.
- Improve listing workflow clarity and owner-facing rejection explanations without implying legal verification.
- Continue product discovery improvements only when supported by reliable property data and providers.

## Data protection and trust requirements

- Never expose ImageKit private keys, Resend keys, MFA encryption keys, session tokens, recovery codes or password hashes to browser code, public APIs or logs.
- Keep ownership and role checks in the Worker. A hidden button or client-side role flag is not authorization.
- Public APIs must not expose private emails, MFA state, internal moderation notes or private verification references.
- Keep externally hosted seller evidence on its original host. Do not fetch arbitrary seller URLs from the Worker.
- Do not represent a seller upload, email verification, publication, administrator review or any platform status as proof of property ownership or clear title.
- Preserve legacy database columns and records unless an additive, reviewed migration proves that a change is necessary. Do not remove compatibility fields merely because the current application no longer uses them.
- Keep R2, video upload/playback, OCR and automatic legal-document verification out of Phase 1.

## CI and static verification

The repository's CI workflow is configured to run a frozen-lockfile dependency installation, dependency audit, migration checks, TOTP and EMI tests, TypeScript/Vite production build, production smoke checks and Wrangler dry-run. CodeQL and Dependabot workflows are present on the current hardening branch.

The production smoke test is a static wiring and policy check. Passing it does not prove provider delivery, remote D1 migration state, browser behavior, real MFA security, production deployment or penetration-test coverage.

The hardening work in this branch also changes the CSP smoke assertions to parse the actual `frame-src` and `media-src` directives instead of searching the complete policy string for host substrings. This keeps the assertion focused on CSP directives and avoids treating an arbitrary substring in a URL-like token as a meaningful host match.

## Release controls

- Keep implementation on a dedicated branch and submit a reviewable pull request.
- Do not merge or deploy as part of this task; Cloudflare auto-deploy is configured for the deployment branch.
- Do not apply migrations to production, change live secrets, rotate credentials, change DNS, delete production data or alter billing.
- Run all available CI checks on the final PR head and inspect the Cloudflare preview result.
- Complete non-production ImageKit, Resend, D1 restore and browser security acceptance before production release.
- A green build or static audit is not a declaration that the marketplace is bug-free, legally compliant or penetration-tested.
