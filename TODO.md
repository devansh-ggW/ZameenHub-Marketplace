# ZameenHub engineering backlog

## Completed on the current engineering branch (not yet production deployed)

- [x] Add server-side ImageKit upload/delete integration for property and profile images.
- [x] Validate file signatures, supported image types, upload size and owner authorization.
- [x] Persist ImageKit metadata in D1 and queue failed provider cleanup.
- [x] Add seller-hosted PDF/image evidence metadata without downloading or rehosting originals.
- [x] Render seller evidence links on property details with clear, truthful language.
- [x] Remove the active video UI and Worker media path; migration 0006 blocks new video rows while preserving historical data.
- [x] Make new submissions and material edits pending moderation.
- [x] Reduce redundant inbox polling and add message reply, forward, edit, delete-for-me and delete-for-everyone operations.
- [x] Add D1 schema coverage for ImageKit, seller evidence and message action metadata.
- [x] Refresh static production smoke checks for the new architecture.

## Remaining engineering / release checks

- [ ] Run CI on the branch and fix any type, build, migration or smoke failures.
- [ ] Perform a real authenticated ImageKit upload and deletion using the restricted key.
- [ ] Apply migration 0006 to a disposable D1 database and run all integrity tests.
- [ ] Inspect every route and major responsive state in a browser.
- [ ] Run a real multi-user messaging acceptance test for edit/delete visibility, replies and cross-conversation forwarding.
- [ ] Audit and migrate eligible legacy property/profile images with a reversible URL-to-ImageKit mapping. Keep unavailable or unauthorized files unchanged.
- [ ] Verify configured Worker secret/variable names and restricted ImageKit permissions in Cloudflare.
- [ ] Complete an independent security review and controlled production release checklist.

## Architecture constraints

- No Cloudflare R2.
- No Phase 1 video support.
- Do not rehost seller-owned source evidence.
- Do not mark a property verified from content screening or a seller document link.
- Do not run a remote migration or deploy without explicit release approval.
