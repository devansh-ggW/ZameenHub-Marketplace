# ZameenHub production checklist

## Before deployment

- [ ] Confirm the Worker name and D1 database ID in wrangler.toml point to the intended resources.
- [ ] Confirm run_worker_first = ["/api/*"] is under the [assets] section.
- [ ] Confirm RESEND_API_KEY and MFA_ENCRYPTION_KEY are Cloudflare Worker Secrets; never commit them.
- [ ] Confirm IMAGEKIT_PRIVATE_KEY is configured as a Worker Secret and IMAGEKIT_URL_ENDPOINT as a Worker variable. Use the restricted ImageKit private key with only the Media Management read/write permissions needed for upload and deletion.
- [ ] Confirm APP_URL, RESEND_FROM_EMAIL and SUPPORT_EMAIL use the intended production values and the sender domain is Verified in Resend.
- [ ] Back up the intended D1 database and verify the restore procedure before applying schema changes.
- [ ] Apply pending D1 migrations through migrations/0008_imagekit_cleanup_queue.sql to the intended database before deploying Worker code that references the new schema. Do not apply to production without a reviewed backup and deployment authorization.
- [ ] Run python3 scripts/check-migrations.py, pnpm build, pnpm test:smoke and Wrangler dry-run; review the source diff.
- [ ] Review Privacy Policy and Terms with the actual operator identity, address, governing law, grievance process and real data-retention practices.
- [ ] Test registration/login password hashing on the actual Cloudflare plan and inspect CPU-limit errors.

## ImageKit upload acceptance

- [ ] Upload a valid JPEG, PNG and WebP through the property editor; verify the returned URL resolves through the configured ImageKit endpoint.
- [ ] Upload a profile image, replace it, and remove it; confirm the old provider asset is deleted or that any cleanup-pending condition is recorded and visible to the operator.
- [ ] Confirm files over 10 MB, unsupported MIME types, MIME/signature mismatches, malformed multipart bodies and missing files are rejected.
- [ ] Confirm no more than five property images can be associated with a listing.
- [ ] Confirm an anonymous user cannot upload, and one owner cannot upload/delete images belonging to another owner's listing.
- [ ] Confirm the Worker never returns IMAGEKIT_PRIVATE_KEY or the Authorization header and that the key is absent from frontend bundles and public repository files.
- [ ] Confirm a failed ImageKit request does not create a D1 media row.
- [ ] Confirm a successful ImageKit upload followed by a D1 failure triggers a provider delete attempt.
- [ ] Confirm image deletion hides an asset from public gallery reads before provider cleanup; a failed cleanup remains hidden and can be retried.
- [ ] Confirm gallery ordering, owner editing, card thumbnails, public detail galleries and profile avatars all resolve from ImageKit URLs.
- [ ] Inspect existing media rows. Existing external URLs are not migrated automatically; plan a one-time migration only if ImageKit credentials and a safe source-fetch process are available.

## Seller-hosted property evidence

- [ ] Seller can create, edit and remove up to ten evidence links with a declared PDF/image format and a meaningful description.
- [ ] Only HTTPS URLs are accepted. javascript:, data:, file:, credential-bearing and malformed URLs are rejected.
- [ ] Worker does not fetch arbitrary seller-provided URLs or proxy the documents.
- [ ] Buyer property detail shows document description, declared format and source hostname.
- [ ] Buyer opens the original seller-hosted URL in a new tab with noopener/noreferrer protections.
- [ ] Empty state appears when no seller documents have been supplied.
- [ ] Public APIs expose only the seller-hosted evidence links intended for buyers; private review notes/reference fields remain restricted to the owner and authorized reviewers.
- [ ] UI copy makes clear that supplied links are not legal authentication or proof of title.

## Video and obsolete storage

- [ ] No video upload control, video URL field, video player, video API creation path or video media is exposed in Phase 1.
- [ ] Legacy video schema/rows from migration 0004 are retained only for compatibility; the current Worker ignores them and does not create new video rows.
- [ ] wrangler.toml, Worker Env, docs and current setup instructions contain no active R2 binding or R2 implementation.

## Account, verification and marketplace flows

- [ ] New user can register; duplicate registration does not leak account status.
- [ ] Verification mail is delivered by the correct sender; expired and used tokens are rejected.
- [ ] A pre-existing user row with no password hash can use email-confirmed legacy activation.
- [ ] Unverified users cannot log in or submit listings; logout invalidates the server session.
- [ ] Session cookie is Secure, HttpOnly, SameSite=Lax and scoped to /.
- [ ] Password-reset email is delivered; token expires and is one-use; reset revokes existing sessions.
- [ ] Listing create/edit/delete/archive is owner-scoped and input validation is enforced by the Worker.
- [ ] A published listing with verification_status=unverified displays Unverified, not Verified.
- [ ] Only an authorized administrator can set verification_status=verified through the audited evidence-review action.
- [ ] AI/content-risk screening and ordinary publication are never represented as proof of ownership.
- [ ] Favorites persist per account and cannot be changed for unpublished/nonexistent properties.
- [ ] Search filters alter actual API results and URL state; empty/error/no-results states render correctly.
- [ ] Inquiry storage, owner notification and support email delivery report failures honestly.

## Messaging

- [ ] Buyers can start chats only for published listings and cannot chat with their own listing.
- [ ] Non-participants cannot view messages, mark read, edit, forward, hide or delete conversation content.
- [ ] Reply references are restricted to messages in the same conversation.
- [ ] Only the original sender can edit or delete a message for everyone.
- [ ] Delete-for-me hides only for the requesting participant; the other participant still sees their copy.
- [ ] Forwarding succeeds only to another open conversation in which the current user participates.
- [ ] Edited/deleted/forwarded/reply metadata renders consistently and safely.
- [ ] Inbox summaries do not refresh at the same frequency as message polling. Confirm five-second message polls do not exhaust conversation-list IP rate limits.
- [ ] A slow request does not create overlapping message polls or duplicate state updates.
- [ ] The composer supports multiline typing, mobile layout, keyboard navigation and a clear send/loading state.

## Authentication and security

- [ ] Configure and test TOTP enrollment, valid/invalid/expired codes, replay rejection, one-time recovery code consumption, MFA login challenge and secure disablement.
- [ ] Confirm recovery codes are stored as hashes and TOTP secrets are encrypted using MFA_ENCRYPTION_KEY.
- [ ] Verify CSRF/Origin enforcement, streaming body-size limit, rate limits, authorization and session revocation.
- [ ] Test IDOR attempts on properties, images, documents, conversations, message actions, favorites, inquiries and admin routes.
- [ ] Test SQL injection, XSS through message/document descriptions, unsafe URL schemes, forged status/role/user IDs and malformed input.
- [ ] Verify no secrets or sensitive personal information appear in logs, public API responses or frontend bundles.

## Database, CI and deployment

- [ ] Run the complete migration sequence in a fresh SQLite/D1-compatible test database and a separate upgrade test against a copy of an existing schema.
- [ ] Confirm PRAGMA foreign_key_check returns no violations.
- [ ] Verify document, image metadata and message hidden rows cascade correctly when their owning property/message/user is deleted.
- [ ] Verify no destructive migration drops old property, account, moderation or audit information.
- [ ] Run frozen-lockfile dependency install, dependency audit, migration tests, TOTP/EMI tests, production build, smoke tests and Wrangler dry-run.
- [ ] Test all primary user journeys in a browser at desktop, tablet and narrow mobile widths.
- [ ] Test restoring a D1 backup before accepting production traffic.
- [ ] Do not deploy automatically from a green local build. Review the PR, apply migrations deliberately, then deploy through the normal release procedure.

## Legal and operational blockers

- [ ] Complete and review the operator's true legal identity, address, jurisdiction, grievance/contact process and retention practices.
- [ ] Do not claim ZameenHub has legally verified a property merely because a seller added a document link or a moderator inspected a public reference.
- [ ] Do not describe the site as bug-free or production-secure solely because automated checks pass.
