# ZameenHub — current architecture and product plan

## Product

ZameenHub is an India-focused marketplace for buying, selling and renting property. Its trust principle is:

**DON'T TRUST US. CHECK THE DAMN THING YOURSELF.**

The marketplace gives buyers access to property information and seller-provided evidence. It does not guarantee ownership, clear title, document authenticity or the outcome of a transaction.

## Current architecture

- **Frontend:** React, TypeScript and Vite.
- **API:** Cloudflare Workers in `worker/index.ts`.
- **Database:** Cloudflare D1 with ordered SQL migrations in `migrations/`.
- **Media:** ImageKit for property/profile images and uploaded PDF/image evidence.
- **External evidence:** seller-hosted HTTPS PDF/image links remain supported; the Worker does not fetch, proxy or rehost these files.
- **Email:** Resend for account verification, recovery and security messages.
- **Source control and deployment:** GitHub; Cloudflare Workers Builds is configured for the repository.

Cloudflare R2 is not part of the architecture. Phase 1 video upload and playback are deferred. Do not add OCR or automatic legal-document verification.

## Listing and evidence lifecycle

1. A seller creates a listing draft and supplies the required listing details.
2. The seller adds property imagery and at least one PDF/image evidence item. Evidence may be uploaded through ImageKit or linked from an external HTTPS source.
3. The Worker validates ownership, allowed file types, file size, listing requirements and state transitions.
4. A listing is eligible for public discovery only after it has at least one active property photo and one active evidence item.
5. Eligible listings may be publicly visible while still marked Unverified.
6. Only an authorized administrator can separately record that seller-provided evidence was reviewed. This is not legal verification or a title guarantee.
7. Incomplete listings stay out of public discovery while remaining available to their owners for repair.

## Security and reliability priorities

- Enforce authentication and object-level authorization in the Worker, never only in the UI.
- Keep ImageKit private credentials, Resend API keys and MFA encryption keys in server-side secret storage.
- Keep session credentials in Secure, HttpOnly cookies and enforce rolling inactivity and absolute expiration on the server.
- Bound request bodies, pagination, uploads and rate-limited actions.
- Keep private evidence references, account details, moderation records and message data out of public responses.
- Preserve data through additive migrations, tested backups and a documented recovery process.
- Test changes with migration, integration, security-regression, production-build and non-production end-to-end checks.

## Visual direction

Use a clean white/light foundation with cobalt/blue accents, strong typography, clear hierarchy, consistent spacing, purposeful motion and responsive layouts. Avoid neon effects, purple gradients, cluttered nested cards, decorative controls without behavior and unnecessary animation. The interface should feel like a carefully engineered property marketplace.

## Current repository layout

- `src/App.tsx`: route composition and shared providers.
- `src/*.tsx`: marketplace pages, account flows, listing forms, messaging, moderation and legal content.
- `src/lib/`: API, authentication, data, ImageKit and property utilities.
- `worker/index.ts`: Cloudflare Worker routes, authentication, authorization, D1 and provider operations.
- `worker/totp.ts`: authenticator-app TOTP implementation.
- `migrations/`: ordered D1 schema changes, currently through `0010_imagekit_property_evidence.sql`.
- `scripts/`: migration, production-smoke, TOTP and EMI checks.
- `.github/workflows/`: CI and CodeQL workflows.

## Release acceptance

A passing build alone is not launch approval. Before production release, verify the real Cloudflare secret/binding configuration, restore a D1 backup, confirm production migration state, test ImageKit and Resend against non-production resources, complete cross-account browser security tests, review legal/operator disclosures and inspect all CI/Cloudflare preview checks. Do not merge or deploy until the branch diff and these operator checks have been reviewed.
