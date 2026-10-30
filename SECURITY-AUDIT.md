# ZameenHub repository security review

**Review date:** 30 October 2026  
**Review scope:** Repository source, Worker routes, D1 migrations and CI configuration on the engineering branch. This is not a penetration test, external audit, live Cloudflare configuration check, legal opinion or production-data verification.

## Architecture and trust boundaries

- React/TypeScript frontend; Cloudflare Worker API; D1 for structured data; ImageKit for ZameenHub-hosted images.
- Browser requests are not trusted for identity, ownership, role, file content or verification state. Sensitive routes must resolve the authenticated session and enforce ownership/participant checks in the Worker.
- Seller-hosted evidence remains at the original HTTPS URL. The Worker validates URL syntax and stores metadata; it does not fetch the seller's URL or claim to authenticate the document.
- New listings enter pending moderation. Manual ownership verification is a separate state. Content screening, publishing, the presence of a PDF, or a seller-provided URL is not legal proof of property ownership.
- R2 is not configured or used. Phase 1 video is disabled. Migration 0006 blocks new video media records without deleting historical rows.

## Changes on this engineering branch

### ImageKit media

- Restricted ImageKit private key is used only inside the Worker through server-side Basic authentication.
- File bytes are bounded while reading; the Worker checks JPEG, PNG and WebP signatures instead of relying only on the extension/MIME claim.
- Each property upload is authenticated and scoped to a property owned by that user. Profile photo upload is authenticated and scoped to the current session user.
- Uploads have an 8 MiB per-file limit, unpredictable filenames, five-image property cap and D1 metadata for ImageKit file ID/path, MIME type, size and uploader.
- Worker verifies the returned provider URL host/path against the configured endpoint before persisting the record.
- Provider deletion is attempted when records are removed or replaced. Media rows and cleanup-queue entries are changed transactionally in D1; a 15-minute scheduled Worker event retries due provider deletions. Account deletion queues media cleanup in the same D1 transaction as dependent-data removal.
- Existing URL-only media records remain readable. No legacy binary migration was performed because source ownership, access and transfer rights have not been independently established.

### Seller evidence

- Up to ten PDF/image links per property; HTTPS and bounded description/URL length validated server-side.
- D1 stores the seller's description, declared type, original URL, source domain and owner/property IDs.
- Buyer UI opens original links in a new tab with safe link attributes and states that ZameenHub has not authenticated them.
- Worker does not fetch arbitrary user-provided links; this avoids turning document support into a server-side request forgery proxy.

### Messaging

- Inbox summaries are no longer fetched on every five-second message poll. Summary refresh is on a separate visibility-aware interval.
- Reply references must belong to the same conversation.
- Edit and delete-for-everyone require the original sender; edit rejects soft-deleted messages.
- Delete-for-me writes a per-user hidden record; other participants retain visibility.
- Forward requires the sender to be a participant in both source and destination conversations and preserves source message/sender attribution.

### Account and listing workflows

- Profile image upload/removal uses Worker-mediated ImageKit routes.
- New listings and material edits remain pending for moderation.
- Public verification field is derived from the D1 verification state, not from publishing or content screening.
- Existing TOTP enrollment, verification and recovery flows remain in place; run their dedicated tests before release.

## Security checks still required before production

- Execute the complete CI workflow on this branch and inspect all job output.
- Apply migration 0006 only to a disposable D1 database first, then run the full migration checker and PRAGMA foreign_key_check.
- Run authenticated browser journeys for ImageKit upload, profile photo upload/removal, seller evidence management, document opening, chat actions, TOTP and account deletion.
- Confirm the exact Cloudflare Worker binding names and restricted ImageKit key permissions in the production dashboard. This repository does not expose secret values or prove those dashboard settings.
- Confirm the exact ImageKit upload/delete API responses using a real test upload. No real authenticated ImageKit upload was possible from repository inspection alone.
- Test race conditions around deletion, concurrent image uploads and property ownership changes.
- Perform an independent security review of authentication, rate limiting, CORS/Origin handling, XSS, CSRF and authorization before accepting sensitive production traffic.
- Review privacy/retention and user-provided document handling with a qualified local legal professional.

## Test interpretation

A static source check or successful TypeScript build cannot prove a live ImageKit upload, production D1 migration, external document availability, sender-email delivery or deployment security. The release report must state the exact test commands and results. Do not label external checks as complete unless they were actually performed.
