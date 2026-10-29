# ZameenHub production gap analysis and security review

**Review date:** 29 October 2026  
**Scope:** Repository-level review of the public React application, Cloudflare Worker/D1 API, Wrangler configuration, and available production smoke checks. This is not a penetration test, legal opinion, live Cloudflare deployment check, or exhaustive inspection of logged-in competitor systems.

## Executive summary

ZameenHub has a working foundation for email/password accounts, email verification and recovery, property search, favorites, inquiries, private buyer/owner messaging, reports, and account security. This branch adds an admin control room, account suspension and restoration, audited property moderation/deletion, optional Resend-backed email one-time codes alongside authenticator-app MFA, and additional schema/security tests.

**Publication and verification are separate.** New listings publish after required-field validation and carry an Unverified badge until an administrator manually checks them. There is no active AI-based listing screening in the current Worker. The admin interface records moderation actions, but a Verified badge is still a manual platform check—not a guarantee of ownership or legal title.

## Competitor comparison

This comparison uses the competitors' publicly reachable pages, not their private dashboards, internal risk systems, or every plan-specific feature.

| Capability | ZameenHub in this branch | Housing.com public offering | 99acres public offering |
|---|---|---|---|
| Basic buy/rent search | Yes; keyword/location, purpose, type, bedrooms/bathrooms, min/max budget, minimum area, and sort | Yes; broad buy/rent and related property search paths | Yes; property search and category pages |
| Saved properties and listing inquiries | Basic favorites and owner email inquiry | More mature lead/discovery flows | More mature lead/discovery flows |
| Listing submission / review | New listings publish after required fields validate and show Unverified until an administrator manually verifies them; older pending listings remain in the review queue | Seller portal, free posting/promotional seller workflow, property price tool | Owner/broker/developer listings and builder/project catalogues |
| Builder/developer/project catalogue | Not yet | Project and developer discovery | Builder/project pages with project types, possession details, and RERA labels where provided |
| Price/finance tools | EMI calculator with transparent user-editable assumptions; no property valuation data feed yet | EMI calculator, property value calculator, rent receipt generator, home-loan and premium services | Project/property content and tools vary by page/product; a full current logged-in product audit was not available |
| Market content | Not yet | Property news, market guides, buying guides, research | Knowledge Centre stories and real-estate content |
| Risk screening | No active AI screening; users can report listings and admins manually review evidence and verification state | Housing's public seller portal advertises free posting, buyer leads and a price calculator; separate help material describes seller self-verification, and its public terms still caution users to verify ownership/title independently | Internal fraud-prevention details not independently verified |
| Owner identity / document verification | Optional public record reference stored privately; moderator evidence review is separately audited. No automatic legal title or government-record validation is configured | Public verification material describes additional evidence/quality review | Not fully verified from accessible public material |
| Photo/video media | Up to five external HTTPS image URLs and one video URL per property; profile image URL; URL references in D1, no binary uploads/R2 or automated duplicate-photo detection | Property imagery is part of the listing workflow | Project/listing imagery is visible on public pages |
| Advanced map and filter experience | Basic filters; no map or locality autocomplete | Broader discovery experience | Broader project/locality discovery experience |
| Account controls | Email authentication; optional Resend email codes and/or authenticator-app TOTP; recovery codes; delete-account flow; admin account suspension | Mature marketplace account workflows | Mature marketplace account workflows |
| Owner/agent workflow | My listings, edit/archive, inquiry inbox and private buyer/owner chat; no listing expiry, repost, lead feedback, or promoted-placement packages | Seller dashboard documents listing create/edit/delete/repost, filters, lead panel, chat/feedback, listing validity, profile editing, and promotional packages | Public search and builder/project pages; a complete current seller-dashboard audit was not available |
| Listing media and project evidence | URL-based gallery + one video and optional private public-record reference; moderator review decision is audited, but record matching is not an automated government integration | Seller help documents optional photo uploads and listing self-verification | Public project pages can display configurations, amenities, RERA/possession details when supplied; this is not proof those details have been independently validated |

Public reference pages:
- Housing.com main site: https://housing.com/
- Housing.com seller portal: https://seller.housing.com/user-login?f=HOUSING.COM
- Housing.com seller dashboard help (listing filters, lead panel, edit/delete/repost): https://housing.freshdesk.com/support/solutions/articles/4000200870-seller-dashboard-kya-hota-hai-
- Housing.com help on posting a listing and optional photos/self-verification: https://support.housing.com/support/solutions/articles/4000200811-how-can-i-post-a-listing-on-housing-com-
- Housing.com search workflow (cities, localities/projects/landmarks/developers, filters): https://support.housing.com/support/solutions/articles/4000200976-how-do-i-find-a-property-on-housing-com-
- Housing.com seller portal features and listing plans: https://seller.housing.com/
- 99acres builder/project catalogue example (RERA labels, possession dates and BHK where shown): https://builders.99acres.com/dream-developers-builders-bid-4990
- Housing.com verification help article: https://support.housing.com/support/solutions/articles/4000200805-mere-listing-ko-kaise-verify-kiya-ja-sakta-hai-
- Housing.com public terms/disclaimer: https://careers.housing.com/terms-of-use/
- 99acres builder/project catalogue: https://builders.99acres.com/om-group-builders-and-developers-bid-110049
- 99acres Knowledge Centre: https://webstories.99acres.com/

## Changes included in this branch

- URL-based media in D1: up to five public HTTPS image references and one supported video per property, plus a per-user profile image URL. File bytes are not uploaded or stored by ZameenHub; broken/offline third-party media URLs can stop working.
- Evidence-reference review workflow: owners may submit a public record URL and evidence type; the reference is private from public APIs; authorized administrators can mark a published listing Verified after an explicit confirmation. The action is stored in moderation and administrator audit logs. The UI describes a manual check rather than claiming guaranteed legal title.

- Optional authenticator-app TOTP and Resend-backed email one-time codes; users can enable either method or both. Email codes are short-lived, pepper-hashed using a server secret, rate-limited, attempt-limited, and consumed once.
- Authenticator secrets are encrypted at rest with AES-GCM using the Cloudflare Worker secret `MFA_ENCRYPTION_KEY`. Do not put that secret into GitHub, Wrangler vars, or chat. Email-code MFA requires the existing `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configuration.
- TOTP setup/disable and email-MFA setup/disable require the current password plus confirmation. Authenticator recovery codes remain single-use and stored as hashes; MFA changes trigger security email alerts where delivery succeeds.
- Account deletion requires the current password, typing `DELETE`, and an enabled second factor where applicable. Owned listings are removed as part of account deletion. The last administrator cannot delete their own account.
- Admin panel: overview counts, account search, suspend/restore, property search, manual verification, taking published listings offline, permanent property deletion, report moderation, and an administrator activity log. Server-side routes enforce admin permissions; suspensions revoke sessions and block future sign-ins.
- A property-report form, an admin/moderator report queue, resolution notes, and a moderation-decision audit record. Reports do not automatically ban users or remove listings.
- Owner-scoped listing editing and archiving. Edits become visible immediately but reset verification to Unverified until an administrator checks the updated details.
- A private owner inquiry inbox with read/archive status controls; inbox queries only return inquiries for listings owned by the signed-in account.
- Budget, bathroom, and minimum-area filters on property search, all encoded in the URL for shareable searches.
- A home-loan EMI calculator using the standard reducing-balance formula, with known-value tests, validation, and an explicit estimate-not-quote disclaimer.
- A crawler-friendly sitemap and robots rules that list public pages but not private account/moderation routes.
- Listing submission rate limits, login limits by IP and normalized email, a streaming 32 KiB request-body cap, strict Origin validation for state-changing requests, and additional security headers.
- Valid registration attempts use a generic response and status to reduce account enumeration; existing accounts receive neutral sign-in guidance rather than an account-state response.
- Email verification, legacy activation, and password-reset tokens are atomically consumed before use, reducing replay under concurrent requests.
- New listing and owner-edit paths do not run AI screening or expose AI risk scores. The prior risk-related database columns remain for compatibility, but the current runtime does not use an AI binding.
- A clear cookie notice and dedicated cookie policy. The current implementation does not intentionally set analytics or advertising cookies; the notice preference uses browser local storage.
- UI language now makes clear that “published” means approved for public display, not independently verified property ownership.
- Static production smoke checks now verify the new wiring. CI also runs a SQLite migration test, owner-isolation query checks, RFC TOTP vectors, a full dependency audit, and the TypeScript/Vite build.

## Security review: addressed in this branch

| Risk | Change |
|---|---|
| Missing second authentication factor | Optional email-code MFA and/or TOTP authenticator MFA with recovery codes |
| MFA recovery/guessing risk | Short challenge/code lifetimes, attempt caps, keyed OTP hashes, one-time consumption, and rate limiting |
| Sensitive account actions trusted only to a session | Password and (if enabled) second-factor confirmation for MFA changes and deletion |
| Account-deletion route absent | Password-confirmed deletion; owned listings removed explicitly |
| State-changing request accepted when Origin was absent | Worker requires the exact request origin for non-GET mutations |
| Unbounded JSON body reads | Worker rejects bodies over 32 KiB |
| Request-body buffering before the size check | The Worker reads streamed chunks and cancels once the 32 KiB cap is exceeded |
| Registration response account enumeration | Valid registration branches use a generic status/message and perform password-hash work before checking the email address |
| Verification/reset token reuse races | Email verification, activation and reset tokens are claimed atomically with `DELETE ... RETURNING` before use |
| Unauthorized account suspension | Admin-only API, administrator-account safeguards, active-session revocation, and login/session checks |
| Unlogged destructive moderation | Admin activity events for account suspension/restoration, property verification/archiving/deletion, and report moderation |
| Password input silently truncated/trimmed before verification | Password values are kept byte-for-byte as provided; passwords outside 8–128 characters are rejected |
| “Published” presented like proof of ownership | Backend no longer maps publication status to a verified-owner boolean; public copy warns users to verify independently |
| A user report may be treated as proof by itself | Reports do not automatically suspend users or delete listings; moderators document the decision before taking action |
| Repeated bulk listing requests | IP- and account-based submission limits |
| Basic security-header coverage | HSTS on static assets and extra API response headers |

## High-priority gaps before public launch

1. **Apply and test the database migrations.** Back up production D1 and apply `migrations/0006_admin_email_mfa.sql` before deploying the Worker code in this branch; it adds user suspension, email MFA, and admin audit tables/columns.
2. **Configure secrets and sender settings.** Confirm `RESEND_API_KEY` is set as a Cloudflare Worker secret and `RESEND_FROM_EMAIL` is a valid, verified sender. Set `MFA_ENCRYPTION_KEY` as a Worker secret for authenticator-app MFA. Do not set any of these secret values in the frontend or commit them to Git.
3. **Do not advertise automated ownership verification.** This implementation can flag scam language and exact duplicates, and lets a moderator document a check of an owner-supplied public record reference. It does not call government record APIs or establish legal title, prove identity, validate a sale mandate, or verify that photos depict the claimed property. Add evidence-backed owner/agent verification and a clear audit trail before using a “verified owner/property” badge.
4. **Treat URL-based media as a reference feature, not upload hosting.** This branch stores public HTTPS image/video URLs in D1, not media bytes. Test third-party link stability and permissions. If direct file uploads are later required, provision R2 and add file-type/size validation, non-guessable keys, active-content handling, deletion, and access-control tests before enabling them.
5. **Exercise admin controls and moderation audit.** Test admin-only access, user suspension/restoration, active-session revocation, property verification/archive/deletion, report resolution logging, invalid reasons, and attempts by a non-admin. Verify related data is deleted only for the selected property.
6. **Expand listing management gradually.** Safe edit and archive/unpublish are now implemented and edits re-enter moderation. Remaining workflow improvements include draft autosave, photo management once uploads are enabled, and clear owner-facing reasons when reviewers reject a submission.
7. **Improve discovery parity gradually.** Basic budget, bathroom, and minimum-area filters, the owner inbox and an EMI calculator are now included. Remaining gaps are locality autocomplete/map, amenities/furnishing/possession filters, market-price research, listing/project/builder profiles, dynamic listing sitemaps and saved-search alerts; add them only as reliable data and providers become available.
8. **Add practical property tools.** EMI calculator, property-value research, rent receipt tools, and editorial guides are useful competitor gaps but need tested calculations and clear disclaimers; do not publish fabricated price estimates or market statistics.
9. **Legal review is still a launch blocker.** The operator's legal identity, contact address, governing law/jurisdiction, data-retention periods, and complaint/grievance process must be completed and reviewed for the actual business and applicable Indian requirements. The policy text in the repo cannot invent these facts.
10. **Run live end-to-end tests.** A static smoke check does not prove Resend delivery, email-code expiry/attempt-limit behavior, authenticator interoperability, D1 migration success, cookie handling, production deployment, or account-deletion behavior. Test with non-production accounts and a D1 backup first.

## Prioritized product roadmap: add, change, or keep out

### P0 — required before public launch
- Back up production D1 and apply/verify migration `0006_admin_email_mfa.sql` before deploying the Worker. Configure Resend and `MFA_ENCRYPTION_KEY`, verify the sender, restore-test a backup, and complete end-to-end admin/listing/MFA checks.
- Complete real operator identity, address, governing jurisdiction, grievance/contact process, and retention disclosures with the responsible operator or a qualified local professional.
- Make listing review evidence-based. Never describe a text-risk score or moderation approval as independent title/ownership verification.

### P1 — next practical marketplace upgrades
- Add direct file uploads only if needed, after provisioning R2 and testing file size/type validation, unguessable object keys, content handling, deletion, and access controls. Current URLs are external references stored in D1.
- Add owner/agent evidence review and clearly labelled RERA/project fields backed by records that can actually be checked; record what was checked and when.
- Add locality autocomplete/map only with a suitable provider, permitted usage, privacy review and rate limits. Expand property-type filters (such as commercial or PG/co-living) only if those categories are genuinely supported by the listing schema and moderation workflow.

### P2 — after inventory and operations justify them
- Buyer-seller chat, saved-search alerts, listing expiry/repost, lead feedback, project/developer profiles, verified market guides, and optional promotional listings.
- Price/rent trends or property valuation only when there is a traceable, licensed and current data source with transparent methodology and limitations.

### Keep out of the product
- Fake demo inventory presented as real, fabricated marketplace counts or lead promises, invented price estimates, placeholder “verified owner” badges, unsupported photo-upload claims, or decorative controls that do not perform the action they advertise.
- Automated bans or automatic publication based only on AI scores, user reports, or duplicate-title signals.

## Production acceptance checklist

- [ ] Back up production D1 and apply `migrations/0006_admin_email_mfa.sql` before deploying the changed Worker.
- [ ] Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for email codes and service messages.
- [ ] Add the `MFA_ENCRYPTION_KEY` Cloudflare secret for authenticator-app MFA without exposing it in Git or client code.
- [ ] Register, verify email, sign in, sign out, reset password, and test invalid/expired tokens.
- [ ] Test email MFA setup, sign-in code delivery, invalid/expired codes, the attempt limit, resend, disable, and security notifications through Resend.
- [ ] Enrol TOTP with at least two common authenticator apps; test invalid/expired codes, email/authenticator selection when both are enabled, one-time recovery-code consumption, disable, and account deletion.
- [ ] Confirm login from a second browser never bypasses MFA and that logout/deletion clear server sessions.
- [ ] Submit a clean listing and verify it publishes as Unverified; mark it Verified from the admin panel and confirm the public badge changes only after that action.
- [ ] Verify take-offline and permanent-delete actions remove the property and related favorites, media, inquiries, reports, and chat history; confirm the admin activity log records the actions.
- [ ] Test account suspension/restoration, non-admin authorization denial, and session revocation.
- [ ] Confirm malformed and oversized bodies, wrong/missing Origin headers, repeated logins, and burst listing requests are rejected.
- [ ] Verify mobile navigation, keyboard use, screen-reader labels, cookie-policy link, reduced-motion behavior, and smaller screens.
- [ ] Confirm Resend service emails are delivered and MFA security-notification failures do not expose secrets.
- [ ] Complete the legal/operator details and test the actual production deployment before publicly claiming “production ready”.

**No source-code review can guarantee a website is “perfect.”** This report records concrete changes and the remaining checks instead of claiming a complete penetration test.
