# ZameenHub

ZameenHub is an Indian property marketplace built with React, TypeScript, a Cloudflare Worker API, and Cloudflare D1.

The product's trust principle is: **Don't trust us. Check the damn thing yourself.** A public listing is not proof of title or seller identity. Buyers should inspect seller-provided evidence on its original host and obtain independent professional advice before transacting.

## Architecture

- **Frontend:** Vite + React + TypeScript.
- **API:** Cloudflare Workers (worker/index.ts).
- **Structured data:** Cloudflare D1 (DB binding).
- **ZameenHub-hosted photography:** ImageKit. D1 stores file IDs, URLs, paths, uploader ownership and display order; it never stores image bytes.
- **Property evidence:** seller-hosted HTTPS links to PDF or image documents. The originals remain on the seller's website; ZameenHub stores only descriptions, types, source domains and URLs.
- **Phase 1 media scope:** property images and seller-hosted PDF/image evidence. Video upload and playback are postponed. Legacy video schema/data is retained for backward compatibility and is not exposed by the current Worker/UI.
- **Not used:** Cloudflare R2.

## ImageKit configuration

The Worker expects:

- IMAGEKIT_PRIVATE_KEY — Cloudflare Worker **Secret** containing the restricted ImageKit private key. Grant only the Media Management read/write permissions required by upload and file deletion.
- IMAGEKIT_URL_ENDPOINT — Worker variable containing the account's ImageKit URL endpoint.

The private key is server-only. Never place it in frontend code, a VITE_* variable, committed configuration, logs, or responses. The ImageKit public key is not a substitute for the server-side private key.

Property/profile photos accept JPEG, PNG and WebP with a 10 MB per-file limit. A property may have up to five images. Uploads are authenticated, property ownership is checked in the Worker, and D1 records the ImageKit file ID and URL. On failed D1 attachment, the Worker attempts to delete the newly uploaded ImageKit file. Deletion failures are kept hidden from public galleries and can be retried.

Before treating uploads as production-verified, test with a non-production account and the configured restricted key, including successful upload, wrong ownership, invalid signatures, size/type rejection, replacement, deletion and provider outage.

## Seller-hosted property evidence

Owners can add up to ten described HTTPS links, each identified as PDF or image. ZameenHub does not download, proxy, scan, or rehost those original documents. The property page displays the seller's description, declared format, source domain and a link that opens the original source safely in a new tab.

A document link, accessible PDF/image, AI result, content review or ordinary publication does **not** establish legal ownership. The UI must not imply that ZameenHub has authenticated the seller's title.

## Account and marketplace capabilities

The existing application includes email/password accounts, email verification and recovery, server-issued sessions, optional authenticator-app TOTP MFA with recovery codes, profile settings, property creation/editing/archiving, search and filters, saved properties, owner inquiries, private buyer/owner conversations, reporting, moderation routes, legal pages and an EMI calculator.

Message actions include reply, sender-only edit, forwarding to another conversation the user participates in, delete-for-everyone (soft deletion), and delete-for-me (per-user hiding). The Worker performs the authorization checks; the frontend is not trusted for access control.

Property verification status is separate from listing publication and content-risk screening. A listing may be publicly visible while still Unverified. Only the separate authorized evidence-review action may mark it Verified; that is a recorded human review, not a government title API or a legal guarantee.

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

Migrations 0006–0008 add ImageKit metadata, seller-hosted document records, message edit/reply/forward metadata, per-user message hiding, and a retryable ImageKit cleanup queue. The admin review queue includes a protected cleanup-retry control. These migrations are additive. Do not apply them to production without a verified backup and a deliberate deployment window.

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
