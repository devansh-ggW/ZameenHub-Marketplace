# ZameenHub

ZameenHub is an Indian property marketplace built with React, TypeScript, a Cloudflare Worker API, and Cloudflare D1.

The product's trust principle is: **Don't trust us. Check the damn thing yourself.** A public listing is not proof of title or seller identity. Buyers should inspect seller-provided evidence on its original host and obtain independent professional advice before transacting.

## Architecture

- **Frontend:** Vite + React + TypeScript.
- **API:** Cloudflare Workers (worker/index.ts).
- **Structured data:** Cloudflare D1 (DB binding).
- **ZameenHub-hosted media:** ImageKit stores property/profile images and seller-uploaded PDF/image evidence. D1 stores file IDs, URLs, paths, uploader ownership and display metadata; it never stores file bytes.
- **External property evidence:** seller-hosted HTTPS PDF/image links remain supported. ZameenHub stores the URL and descriptive metadata but does not fetch, proxy, or rehost the external file.
- **Phase 1 media scope:** property/profile images and PDF/image evidence uploads or external links. Video upload and playback are postponed. Legacy video schema/data is retained only for backward compatibility and is not exposed by the current Worker/UI.
- **Not used:** Cloudflare R2.

## ImageKit configuration

The Worker expects:

- IMAGEKIT_PRIVATE_KEY — Cloudflare Worker **Secret** containing the restricted ImageKit private key. Grant only the Media Management read/write permissions required by upload and file deletion.
- IMAGEKIT_URL_ENDPOINT — Worker variable containing the account's ImageKit URL endpoint.

The private key is server-only. Never place it in frontend code, a VITE_* variable, committed configuration, logs, or responses. The ImageKit public key is not a substitute for the server-side private key.

Property/profile photos accept JPEG, PNG and WebP with a 10 MB per-file limit. A property may have up to five images. Uploads are authenticated, property ownership is checked in the Worker, and D1 records the ImageKit file ID and URL. On failed D1 attachment, the Worker attempts to delete the newly uploaded ImageKit file. Deletion failures are kept hidden from public galleries and can be retried.

Before treating uploads as production-verified, test with a non-production account and the configured restricted key, including successful upload, wrong ownership, invalid signatures, size/type rejection, replacement, deletion and provider outage.

## Seller-hosted property evidence

Owners can add up to ten evidence items. Each item can be a supported PDF/image uploaded through the Worker to ImageKit, or a seller-hosted HTTPS PDF/image link. D1 stores evidence descriptions, declared formats, source domains and ImageKit file metadata; it does not store file bytes. External files remain on their original hosts and are never fetched, proxied or rehosted by ZameenHub.

At least one active property photo and one active PDF/image evidence item are required before a listing appears publicly. New listings remain drafts while uploads complete and can be published only after the Worker confirms those requirements. Existing published listings missing either requirement are excluded from public discovery until repaired, while remaining available to their owners for editing. The Property Evidence Room identifies seller-provided items, their storage source, description, format and source domain; external links open the original source safely in a new tab.

A seller-submitted document, an ImageKit upload, email verification, publication or administrative evidence review does **not** establish legal ownership, clear title, document authenticity or freedom from disputes. Buyers should independently inspect the evidence and obtain appropriate professional advice.

## Account and marketplace capabilities

The existing application includes email/password accounts, email verification and recovery, server-issued sessions, optional authenticator-app TOTP MFA with recovery codes, profile settings, property creation/editing/archiving, search and filters, saved properties, owner inquiries, private buyer/owner conversations, reporting, moderation routes, legal pages and an EMI calculator.

Authenticated sessions use Secure, HttpOnly, host-scoped cookies and hashed server-side session records. Active sessions renew with a 30-day inactivity window, capped by a 90-day absolute lifetime. The account security page can end the current session or revoke all devices. Temporary session-check/network failures do not automatically clear the authenticated UI state.

Public property detail pages include a **Property Evidence Room** for ImageKit-uploaded and seller-hosted PDF/image evidence, plus a **Listing History** timeline. The timeline begins at rollout for pre-existing listings; it does not claim to know events that occurred before tracking was enabled.

Message actions include reply, sender-only edit, forwarding to another conversation the user participates in, delete-for-everyone (soft deletion), and delete-for-me (per-user hiding). The Worker performs the authorization checks; the frontend is not trusted for access control.

Property verification status is separate from listing publication. A listing may be publicly visible while still Unverified. Only an authorized administrator can manually mark seller-provided evidence as reviewed; that records a platform review, not a government title check or a legal guarantee.

## Cloudflare setup and migrations

1. Confirm wrangler.toml references the intended D1 database.
2. Configure RESEND_API_KEY as a Worker Secret and verify the configured Resend sender domain.
3. Configure MFA_ENCRYPTION_KEY as a Worker Secret (at least 32 random characters). Never commit it.
4. Configure IMAGEKIT_PRIVATE_KEY as a Worker Secret and IMAGEKIT_URL_ENDPOINT as a Worker variable, as described above.
5. Back up the intended D1 database and apply pending migrations **before** deploying Worker code that relies on them:

   ```bash
   pnpm exec wrangler d1 migrations apply zameenhub --remote
   ```

6. Test the complete flows on a non-production environment before production rollout.

Migrations 0006–0008 establish ImageKit property/profile media, external evidence-link metadata, message edit/reply/forward metadata, per-user message hiding and a retryable ImageKit cleanup queue. Migration 0009 adds rolling/absolute session-expiry metadata, evidence update timestamps and the append-only property listing-history table. Migration 0010 adds ImageKit file IDs, paths, uploader ownership and lifecycle status for uploaded property evidence while preserving existing external HTTPS evidence rows. These migrations are additive. Do not apply pending migrations to production without a verified backup and a deliberate deployment window.

## Local checks

```bash
pnpm install --frozen-lockfile
python3 scripts/check-migrations.py
pnpm build
pnpm test:smoke
pnpm dlx wrangler@4.154.0 deploy --dry-run
```

The static smoke checks and SQLite migration tests are wiring/schema checks, not proof of live email delivery, ImageKit uploads, remote D1 behavior, browser journeys, production deployment or penetration-test coverage.

## Production and legal readiness

Before launch, complete [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md) and review [SECURITY-AUDIT.md](./SECURITY-AUDIT.md). The responsible operator must complete and review the actual legal identity, jurisdiction, grievance contact and retention disclosures. Do not invent those details or claim the service is bug-free or legally verifies ownership.

Support: [dewifystores@gmail.com](mailto:dewifystores@gmail.com).
