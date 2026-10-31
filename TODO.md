# ZameenHub — current engineering follow-up

## Implemented on the engineering branch

- [x] Add the supplied blue Z mark as the repository website icon and app logo reference.
- [x] Replace the inbox's five-second conversation-summary refresh with a slower refresh and overlapping-request guard.
- [x] Add ImageKit upload helpers and authenticated Worker endpoints for property and profile photos.
- [x] Store ImageKit file IDs, URLs, paths, uploader IDs and status in D1 metadata; do not store media bytes in D1.
- [x] Replace property photo URL fields with JPEG/PNG/WebP file selection and upload progress.
- [x] Add seller-hosted PDF/image evidence links with descriptions, source-domain display and buyer-facing original-source links.
- [x] Remove Phase 1 video UI, player and Worker media creation/read logic while retaining legacy schema/data compatibility.
- [x] Add message reply, sender-only edit, forward, delete-for-everyone and per-user delete-for-me metadata/routes/UI.
- [x] Add additive migrations 0006 and 0007 for ImageKit, seller document links and message actions.

## Still needs verification or follow-up

- [ ] Run GitHub CI for this branch and fix any build, typecheck, migration, smoke-test, audit or Wrangler dry-run failures.
- [ ] Test the configured ImageKit restricted private key against a non-production account; verify upload, URL endpoint, file deletion and permissions.
- [ ] Verify the exact production Worker secret names/values in Cloudflare without exposing them in Git, code output or logs.
- [ ] Back up a non-production D1 database, apply migrations through 0007, run the full schema checks, and test restore.
- [ ] Inspect existing property/profile media records and prepare a safe legacy image migration only where ImageKit credentials and source access are available.
- [ ] Add operator-visible retry/reconciliation for ImageKit deletion-pending rows and any provider orphan created by a failed D1 operation.
- [ ] Browser-test listing create/edit, photo upload and deletion, profile upload, buyer documents, mobile galleries and message actions.
- [ ] Continue the full authorization audit for property/document/image ownership, message IDs, forwarding targets, roles and rate limits.
- [ ] Inspect every remaining route, dashboard action, responsive breakpoint and loading/error/empty state.
- [ ] Complete real legal operator details and arrange independent security review before production launch.

## Release controls

- Production main has not been changed by this engineering branch.
- Do not apply migrations to production or deploy automatically from a passing build.
- Keep video postponed and do not add R2 or another object store.
- A seller-provided link or listing publication is not legal ownership verification.
