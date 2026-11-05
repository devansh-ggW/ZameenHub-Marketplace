# ZameenHub — current engineering follow-up

## Implemented in the current repository

- [x] React + TypeScript + Vite frontend backed by Cloudflare Workers and D1.
- [x] Email/password authentication, email verification and recovery, secure HttpOnly session cookies, rolling 30-day inactivity expiry and 90-day absolute expiry.
- [x] Optional authenticator-app TOTP MFA, recovery codes and session-revocation controls.
- [x] Owner-scoped property creation, editing, archiving and deletion/moderation workflows.
- [x] ImageKit-backed property/profile images and PDF/image property evidence uploads; D1 stores metadata and provider identifiers, not file bytes.
- [x] Seller-hosted external HTTPS PDF/image evidence links remain supported and are not fetched, proxied or rehosted.
- [x] Public listings require active property imagery and at least one active evidence item; eligible listings may be public while Unverified.
- [x] Separate administrator-controlled evidence review; the status is not a legal title or ownership guarantee.
- [x] Public lister profiles, profile editing, saved properties, search/filtering, inquiries, private messaging and message actions.
- [x] Reporting, moderation routes, listing history, retryable ImageKit cleanup and repository migrations through 0010.
- [x] Phase 1 video upload/playback is out of scope; Cloudflare R2 is not used.
- [x] PR #28's proposed response-policy, CI, CodeQL and Dependabot hardening is preserved on the pre-launch branch.

## Outstanding engineering and operator verification

- [ ] Run the updated GitHub CI and CodeQL workflows on the final implementation PR head; resolve any new findings instead of suppressing checks.
- [ ] Inspect the failed Cloudflare preview build reported for PR #28 commit `84af995`; the connected repository tools did not provide its detailed Cloudflare build log.
- [ ] Test the configured ImageKit restricted private key against a non-production account: successful upload, wrong-owner rejection, invalid signatures, size/type rejection, replacement, deletion and provider outage.
- [ ] Back up a non-production D1 database, apply migrations 0001–0010, run foreign-key/schema checks and prove the restore procedure.
- [ ] Confirm the actual production D1 migration state through 0010 before any Worker release; repository files do not establish remote migration status.
- [ ] Verify Resend sender-domain authentication and real delivery for registration, verification, password recovery and security notices.
- [ ] Browser-test buyer, seller and administrator journeys at desktop, tablet and narrow mobile widths, including cross-account authorization attempts.
- [ ] Perform independent security testing of authentication, sessions, object authorization, uploads, moderation and messaging.
- [ ] Complete the real operator identity, address, jurisdiction, grievance/contact process and data-retention disclosures with the responsible operator and qualified local counsel.

## Release controls

- Work stays on a dedicated implementation branch and must be reviewed in a pull request; do not merge or deploy automatically from a green build.
- Do not apply migrations to production, change live Cloudflare secrets, alter DNS, delete production data or rotate credentials as part of this code task.
- Preserve ImageKit as the media provider. Do not add R2, video, OCR or automatic legal-document verification.
- A seller-provided evidence item, email verification, listing publication or administrator review is not proof of legal ownership or clear title.
