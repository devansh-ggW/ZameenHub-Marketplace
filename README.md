# ZameenHub

ZameenHub is an Indian property marketplace built with React, TypeScript, Vite, a Cloudflare Worker API and D1.

## Architecture

- Frontend: React + TypeScript + Vite.
- API: Cloudflare Worker (worker/index.ts).
- Structured data: Cloudflare D1.
- Image delivery and storage: ImageKit.
- Seller evidence: original seller-hosted HTTPS PDF/image links, stored as metadata in D1.
- Phase 1 media: images only. Video is not part of the current listing workflow.

There is no R2 binding or upload path. Image and PDF binaries are not stored in D1. Seller evidence links are never fetched, proxied or rehosted by the Worker.

## ImageKit configuration

The Worker expects these bindings:

| Name | Type | Purpose |
|---|---|---|
| IMAGEKIT_PRIVATE_KEY | Secret | Restricted ImageKit private key used by Worker-side upload and deletion |
| IMAGEKIT_URL_ENDPOINT | Variable | ImageKit URL endpoint used to validate provider responses |

Use a restricted key with only the permissions required to upload and delete media in the ImageKit account. The private key must never be placed in a VITE_* variable, source file, Wrangler vars, response body or logs. The standard public key is not needed by the current Worker-mediated upload flow.

Current upload endpoints:

- POST /api/my/properties/:id/images — authenticated owner-only property image upload.
- DELETE /api/my/properties/:id/images/:mediaId — authenticated owner-only image removal.
- POST /api/account/profile-image — authenticated profile photo upload.
- PATCH /api/account/profile with an empty profileImageUrl — remove the current profile photo.

The Worker accepts JPEG, PNG and WebP only, checks file signatures, enforces an 8 MiB per-file limit, applies ownership checks, and stores ImageKit file IDs/paths and MIME/size metadata in D1. Property listings are capped at five images. Failed D1 writes are compensated by a provider delete attempt; failed provider deletes are queued for retry in imagekit_cleanup_queue.

The browser uses multipart FormData and does not receive the private key. ImageKit transformation URLs are applied only to ImageKit-hosted images; unrelated editorial artwork remains unchanged.

## Seller-hosted evidence

Sellers can attach up to ten evidence links to a property. Each entry contains a seller-written description, a selected file type (pdf or image), the original HTTPS URL and the derived source domain. The Worker validates the URL syntax and scheme, but deliberately does not make a request to the supplied URL.

On the public property page, buyers can open each original source in a new tab. A seller-provided link, file, image, or URL does not prove ownership or title. ZameenHub does not claim to have legally authenticated the supplied documents.

## Listing and verification states

A newly submitted listing starts in pending moderation. Material edits return it to pending. Only approved published listings appear in public discovery. Ownership verification is a separate status, displayed from the authoritative D1 verification_status; publication, content moderation, an uploaded photograph or a seller document link does not automatically set verified.

The old video columns/triggers in migration 0004 are legacy schema history. Migration 0006 blocks new video media inserts/updates without deleting historical rows, and the Phase 1 frontend and Worker no longer expose video functionality.

## Messaging

The private inbox supports reply, forward, sender-only edit, sender-only delete-for-everyone and per-user delete-for-me. Reply and forward operations are restricted to conversations the current user participates in. The five-second message poll no longer reloads the entire inbox; conversation summaries refresh separately.

## Authentication and account security

The application includes email/password accounts, email verification, password recovery, server-side sessions, optional authenticator-app TOTP, recovery codes and password-confirmed account deletion. TOTP implementation and migration tests are available under scripts/.

## Migrations

The migration sequence is additive. Migration 0006 adds ImageKit metadata, seller evidence records, message action metadata, an ImageKit cleanup queue and Phase 1 video-blocking triggers. Existing URL-based media rows and historical video rows are not automatically deleted or migrated.

Before applying migrations to a live database:
1. Take and verify a restorable D1 backup.
2. Review the exact pending migration files.
3. Apply migrations to a non-production database first.
4. Confirm the migration result and foreign-key integrity.
5. Only then schedule an authorized production migration and matching Worker deployment.

Do not apply remote migrations or deploy directly from this engineering branch without explicit release approval.

## Local checks

    pnpm install --frozen-lockfile
    pnpm typecheck
    pnpm build
    pnpm test:smoke
    python3 scripts/check-migrations.py
    node --experimental-strip-types scripts/test-totp.mjs
    node --experimental-strip-types scripts/test-emi.mjs
    pnpm dlx wrangler@4.154.0 deploy --dry-run

The migration checker executes the complete SQL sequence in an in-memory SQLite database. Static checks and a successful build are not a substitute for a real authenticated ImageKit upload, browser journey, production D1 test, or independent security review.

## Existing media migration

Historical image URLs are preserved so current listings do not break. They are not silently fetched or copied into ImageKit. Before any bulk migration, establish that each source file is owned/authorized for transfer, generate a backup/export, upload it to ImageKit, verify the returned file ID and URL, and update only the corresponding D1 record. Keep a rollback map of original URLs. Files for which the source is unavailable or authorization is unclear must remain unchanged and be reported, not silently replaced.

## Support

Customer support: dewifystores@gmail.com
