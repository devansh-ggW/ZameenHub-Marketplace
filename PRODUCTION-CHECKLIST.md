# ZameenHub release checklist

This checklist is for a controlled release. The engineering branch is not deployed and no live D1 migration is authorized by this document.

## Before a release

- [ ] Confirm the intended Worker, production domain and D1 database ID.
- [ ] Back up production D1 and verify the restore procedure.
- [ ] Apply migrations 0001–0006 to a disposable D1 database and run python3 scripts/check-migrations.py.
- [ ] Confirm the restricted IMAGEKIT_PRIVATE_KEY secret is configured in Worker settings and has media upload/delete permission.
- [ ] Confirm IMAGEKIT_URL_ENDPOINT is configured as a Worker variable and matches the endpoint returned by ImageKit.
- [ ] Confirm RESEND_API_KEY is a Worker secret, not a Wrangler variable or frontend build variable.
- [ ] Confirm APP_URL, RESEND_FROM_EMAIL and SUPPORT_EMAIL are correct, and the sender domain is verified with Resend.
- [ ] Run dependency installation, typecheck, production build, migration tests, TOTP/EMI tests, smoke checks and Worker dry-run in CI.
- [ ] Inspect the exact diff and confirm no secrets or .dev.vars files are committed.
- [ ] Review Privacy Policy, Terms, cookies and actual operator/legal details with an appropriate professional.

## ImageKit acceptance

- [ ] Upload a JPEG, PNG and WebP as the property owner; confirm actual ImageKit URLs and file IDs are stored in D1.
- [ ] Reject spoofed MIME/extensions, unsupported formats, malformed images and files over 8 MiB.
- [ ] Confirm users cannot upload or delete media for another user's property.
- [ ] Confirm a sixth property image is rejected by both Worker validation and D1 constraints.
- [ ] Confirm gallery ordering and ImageKit transformations render on desktop and mobile.
- [ ] Confirm profile photo upload and removal work.
- [ ] Confirm provider failure and D1 failure do not leave untracked uploads; test the cleanup queue.
- [ ] Confirm the ImageKit private key is absent from built frontend bundles, API responses and logs.
- [ ] Audit existing media URLs. Migrate only files whose source and transfer rights are confirmed; do not silently overwrite unavailable sources.

## Seller-hosted evidence

- [ ] Seller adds, edits and removes up to ten HTTPS PDF/image links.
- [ ] Invalid URL schemes, malformed URLs, duplicate URLs, invalid descriptions and more than ten links are rejected.
- [ ] Worker never fetches a seller-supplied URL.
- [ ] Buyer sees the seller description, type and source domain and opens the original URL in a new tab.
- [ ] No-document empty state is clear and accessible.
- [ ] The page says seller-provided evidence has not been authenticated by ZameenHub.
- [ ] Evidence links never set the listing's ownership verification status automatically.

## Listing lifecycle and verification

- [ ] New submissions remain pending until an authorized moderator approves them.
- [ ] An edited listing returns to pending moderation.
- [ ] Only published listings are publicly discoverable.
- [ ] Verification badges reflect the actual D1 verification_status, not moderation/content-screening status.
- [ ] No buyer-facing listing UI mentions Cloudflare implementation details or treats moderation as proof of ownership.
- [ ] Admin review actions are permission-checked and audit events retain the review decision.

## Messaging and account security

- [ ] Normal inbox use does not produce false "too many inbox requests" errors.
- [ ] Message polling refreshes only the selected conversation; inbox summaries refresh separately.
- [ ] Reply is restricted to the same conversation.
- [ ] Forward requires membership in the source and target conversations and preserves attribution.
- [ ] Only the sender can edit or delete for everyone.
- [ ] Delete-for-me hides a message only for the current participant.
- [ ] Unauthorized users cannot access conversations, messages or private attachments.
- [ ] Registration, login, logout, verification, password recovery and session expiration work.
- [ ] TOTP enrollment is confirmed before MFA becomes enabled; test invalid, expired, replayed and recovery codes.
- [ ] Account deletion requires reauthentication, preserves audit requirements and queues ImageKit file cleanup.

## Full regression

- [ ] Test property create/edit/archive, search, filters, saved listings, inquiries and review queue.
- [ ] Test all navigation, menus, forms, dropdowns, dialogs and public/private routes.
- [ ] Test mobile layouts, keyboard navigation, visible focus, labels, errors and reduced motion.
- [ ] Confirm no severe console errors, unhandled promise rejections, or avoidable failed requests.
- [ ] Verify Cloudflare Worker asset/API routing and inspect wrangler deploy --dry-run output.
- [ ] Obtain explicit approval before remote D1 migration or production deployment.

## Scope notes

- R2 is not part of the architecture.
- Phase 1 supports images and seller-hosted PDF/image links only; video is postponed.
- Legacy video rows and legacy image URLs are preserved for compatibility. They are not exposed as current video functionality and are not automatically migrated/deleted.
- Static tests and a green build do not establish production security or legal verification.
