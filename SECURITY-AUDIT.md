# ZameenHub production gap analysis and security review

**Review date:** 28 October 2026  
**Scope:** Repository-level review of the public React application, Cloudflare Worker/D1 API, Wrangler configuration, and available production smoke checks. This is not a penetration test, legal opinion, live Cloudflare deployment check, or exhaustive inspection of logged-in competitor systems.

## Executive summary

ZameenHub has a working foundation for email/password accounts, email verification and recovery, listing submission, published-property search, saved properties, inquiries, support, and a moderator review queue. This branch adds optional authenticator-based MFA, recovery codes, password-confirmed account deletion, a cookie notice/policy, server-side listing risk screening, and several API hardening measures.

The important safety choice is deliberate: **AI risk screening does not certify ownership and does not auto-publish a listing.** New listings remain private/pending until a moderator or administrator approves them. High-risk signals appear in the review queue, but a reviewer must investigate them. This avoids turning a text classifier's guess into a false “verified owner” badge.

## Competitor comparison

This comparison uses the competitors' publicly reachable pages, not their private dashboards, internal risk systems, or every plan-specific feature.

| Capability | ZameenHub in this branch | Housing.com public offering | 99acres public offering |
|---|---|---|---|
| Basic buy/rent search | Yes; keyword/location, purpose, type, bedrooms/bathrooms, min/max budget, minimum area, and sort | Yes; broad buy/rent and related property search paths | Yes; property search and category pages |
| Saved properties and listing inquiries | Basic favorites and owner email inquiry | More mature lead/discovery flows | More mature lead/discovery flows |
| Listing submission / review | User submissions are pending; review queue for authorized roles | Seller portal, free posting/promotional seller workflow, property price tool | Owner/broker/developer listings and builder/project catalogues |
| Builder/developer/project catalogue | Not yet | Project and developer discovery | Builder/project pages with project types, possession details, and RERA labels where provided |
| Price/finance tools | EMI calculator with transparent user-editable assumptions; no property valuation data feed yet | EMI calculator, property value calculator, rent receipt generator, home-loan and premium services | Project/property content and tools vary by page/product; a full current logged-in product audit was not available |
| Market content | Not yet | Property news, market guides, buying guides, research | Knowledge Centre stories and real-estate content |
| Risk screening | This branch adds text-based AI/rule-based risk triage; it is not ownership verification | Housing's public seller portal advertises free posting, buyer leads and a price calculator; separate help material describes seller self-verification, and its public terms still caution users to verify ownership/title independently | Internal fraud-prevention details not independently verified |
| Owner identity / document verification | Optional public record reference stored privately; moderator evidence review is separately audited. No automatic legal title or government-record validation is configured | Public verification material describes additional evidence/quality review | Not fully verified from accessible public material |
| Photo/video media | Up to five external HTTPS image URLs and one video URL per property; profile image URL; URL references in D1, no binary uploads/R2 or automated duplicate-photo detection | Property imagery is part of the listing workflow | Project/listing imagery is visible on public pages |
| Advanced map and filter experience | Basic filters; no map or locality autocomplete | Broader discovery experience | Broader project/locality discovery experience |
| Account controls | Email authentication, optional TOTP MFA, recovery codes, delete-account flow | Mature marketplace account workflows | Mature marketplace account workflows |
| Owner/agent workflow | My listings, edit/archive, private inquiry inbox; no buyer-seller chat, listing expiry, repost, lead feedback, or promoted-placement packages | Seller dashboard documents listing create/edit/delete/repost, filters, lead panel, chat/feedback, listing validity, profile editing, and promotional packages | Public search and builder/project pages; a complete current seller-dashboard audit was not available |
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
- Evidence-reference review workflow: owners may submit a public record URL and evidence type; the reference is private from public APIs; moderators have a separate explicit “publish + mark evidence reviewed” action and a required audit note. The UI describes what was reviewed rather than claiming guaranteed legal title. AI/rule risk scores never make the evidence decision.

- Optional authenticator-app TOTP MFA, time-limited challenge cookies, atomically capped attempts, one-time TOTP counter tracking to prevent replay, and one-time recovery codes stored as hashes.
- MFA secrets encrypted at rest with AES-GCM using a Cloudflare secret named `MFA_ENCRYPTION_KEY`. Do not put that secret into GitHub, Wrangler vars, or chat.
- MFA setup/disable requires the current password; disabling also requires the existing authenticator or an unused recovery code. Email alerts are attempted for MFA changes.
- Account deletion requires the current password, typing `DELETE`, and a valid MFA/recovery code when MFA is enabled. Owned listings are removed as part of this action. The last administrator is protected from deleting their own account.
- Cloudflare Workers AI listing risk triage plus deterministic red-flag and duplicate-title/location checks. Risk reasons and model metadata are saved in D1 and shown only in the authorized moderation review queue.
- A property-report form, an admin/moderator report queue, resolution notes, and a moderation-decision audit record. Reports do not automatically ban users or remove listings.
- Owner-scoped listing editing and archiving. Any material edit is re-screened and returns the listing to pending review.
- A private owner inquiry inbox with read/archive status controls; inbox queries only return inquiries for listings owned by the signed-in account.
- Budget, bathroom, and minimum-area filters on property search, all encoded in the URL for shareable searches.
- A home-loan EMI calculator using the standard reducing-balance formula, with known-value tests, validation, and an explicit estimate-not-quote disclaimer.
- A crawler-friendly sitemap and robots rules that list public pages but not private account/moderation routes.
- Listing submission rate limits, login limits by IP and normalized email, a streaming 32 KiB request-body cap, strict Origin validation for state-changing requests, and additional security headers.
- Valid registration attempts use a generic response and status to reduce account enumeration; existing accounts receive neutral sign-in guidance rather than an account-state response.
- Email verification, legacy activation, and password-reset tokens are atomically consumed before use, reducing replay under concurrent requests.
- Listing submission and owner-edit responses do not reveal internal AI risk scores or detailed trigger reasons; these remain restricted to the authorized review queue.
- The AI classifier accepts only actual JSON integer scores from 0–100. Malformed values such as `null`, strings or booleans are ignored instead of being coerced to a misleading low-risk score.
- A clear cookie notice and dedicated cookie policy. The current implementation does not intentionally set analytics or advertising cookies; the notice preference uses browser local storage.
- UI language now makes clear that “published” means approved for public display, not independently verified property ownership.
- Static production smoke checks now verify the new wiring. CI also runs a SQLite migration test, owner-isolation query checks, RFC TOTP vectors, a full dependency audit, and the TypeScript/Vite build.

## Security review: addressed in this branch

| Risk | Change |
|---|---|
| Missing second authentication factor | Optional TOTP MFA and one-time recovery codes |
| MFA recovery/guessing risk | Short challenge lifetime, attempt caps, and rate limiting |
| Sensitive account actions trusted only to a session | Password and (if enabled) second-factor confirmation for MFA changes and deletion |
| Account-deletion route absent | Password-confirmed deletion; owned listings removed explicitly |
| State-changing request accepted when Origin was absent | Worker requires the exact request origin for non-GET mutations |
| Unbounded JSON body reads | Worker rejects bodies over 32 KiB |
| Request-body buffering before the size check | The Worker reads streamed chunks and cancels once the 32 KiB cap is exceeded |
| Registration response account enumeration | Valid registration branches use a generic status/message and perform password-hash work before checking the email address |
| Verification/reset token reuse races | Email verification, activation and reset tokens are claimed atomically with `DELETE ... RETURNING` before use |
| Risk-score leakage to listing submitters or owners editing a listing | Submission and edit responses reveal pending status/message only; detailed risk evidence stays in the moderator queue |
| Malformed AI classifier output | Only an actual integer JSON score from 0–100 is accepted; other value types are ignored |
| Password input silently truncated/trimmed before verification | Password values are kept byte-for-byte as provided; passwords outside 8–128 characters are rejected |
| “Published” presented like proof of ownership | Backend no longer maps publication status to a verified-owner boolean; public copy warns users to verify independently |
| Listing text may attempt prompt injection | AI instruction treats fields as untrusted data; returned risk is parsed as data and never has authority to publish |
| Repeated bulk listing requests | IP- and account-based submission limits |
| Basic security-header coverage | HSTS on static assets and extra API response headers |

## High-priority gaps before public launch

1. **Apply and test the database migrations.** Back up production D1 and apply pending migrations through `migrations/0004_media_verification.sql` before deploying Worker code that references those columns/tables.
2. **Configure secrets and bindings.** Set `MFA_ENCRYPTION_KEY` as a Cloudflare Worker secret; deploy the `AI` binding in `wrangler.toml`; check Worker logs and AI usage after deployment. Workers AI calls incur usage charges under Cloudflare's current pricing and quotas; verify the current pricing and account limits before launch. If the AI call is unavailable or quota-exhausted, rule-based checks still run and listings stay pending, but AI review is not available.
3. **Do not advertise automated ownership verification.** This implementation can flag scam language and exact duplicates, and lets a moderator document a check of an owner-supplied public record reference. It does not call government record APIs or establish legal title, prove identity, validate a sale mandate, or verify that photos depict the claimed property. Add evidence-backed owner/agent verification and a clear audit trail before using a “verified owner/property” badge.
4. **Enable safe image upload.** R2 is currently commented out and the listing flow explicitly says photos are not enabled. Provision storage, enforce file type/size limits, use non-guessable keys, reject active content, and test public delivery before enabling uploads.
5. **Exercise reporting, moderation audit, owner lifecycle and inbox isolation.** The report form/queue, resolution notes, moderation-event table, owner edit/archive controls, and private lead inbox are included. Test duplicate reports, role restrictions, concurrent status changes, owner isolation, and retention after account deletion.
6. **Expand listing management gradually.** Safe edit and archive/unpublish are now implemented and edits re-enter moderation. Remaining workflow improvements include draft autosave, photo management once uploads are enabled, and clear owner-facing reasons when reviewers reject a submission.
7. **Improve discovery parity gradually.** Basic budget, bathroom, and minimum-area filters, the owner inbox and an EMI calculator are now included. Remaining gaps are locality autocomplete/map, amenities/furnishing/possession filters, market-price research, listing/project/builder profiles, dynamic listing sitemaps and saved-search alerts; add them only as reliable data and providers become available.
8. **Add practical property tools.** EMI calculator, property-value research, rent receipt tools, and editorial guides are useful competitor gaps but need tested calculations and clear disclaimers; do not publish fabricated price estimates or market statistics.
9. **Legal review is still a launch blocker.** The operator's legal identity, contact address, governing law/jurisdiction, data-retention periods, and complaint/grievance process must be completed and reviewed for the actual business and applicable Indian requirements. The policy text in the repo cannot invent these facts.
10. **Run live end-to-end tests.** A static smoke check does not prove email delivery, MFA interoperability with common authenticator apps, D1 migration success, AI quota availability, multi-cookie handling, production deployment, or account-deletion behavior. Test with non-production accounts and a D1 backup first.

## Prioritized product roadmap: add, change, or keep out

### P0 — required before public launch
- Apply and verify the production D1 migrations, configure Cloudflare secrets/bindings, verify the Resend sender domain, restore-test a backup, and complete end-to-end account/listing/moderation checks.
- Complete real operator identity, address, governing jurisdiction, grievance/contact process, and retention disclosures with the responsible operator or a qualified local professional.
- Make listing review evidence-based. Never describe a text-risk score or moderation approval as independent title/ownership verification.

### P1 — next practical marketplace upgrades
- Add safe image storage and delivery only after provisioning R2 and testing file size/type validation, unguessable object keys, content handling, deletion, and access controls.
- Add owner/agent evidence review and clearly labelled RERA/project fields backed by records that can actually be checked; record what was checked and when.
- Add locality autocomplete/map only with a suitable provider, permitted usage, privacy review and rate limits. Expand property-type filters (such as commercial or PG/co-living) only if those categories are genuinely supported by the listing schema and moderation workflow.

### P2 — after inventory and operations justify them
- Buyer-seller chat, saved-search alerts, listing expiry/repost, lead feedback, project/developer profiles, verified market guides, and optional promotional listings.
- Price/rent trends or property valuation only when there is a traceable, licensed and current data source with transparent methodology and limitations.

### Keep out of the product
- Fake demo inventory presented as real, fabricated marketplace counts or lead promises, invented price estimates, placeholder “verified owner” badges, unsupported photo-upload claims, or decorative controls that do not perform the action they advertise.
- Automated bans or automatic publication based only on AI scores, user reports, or duplicate-title signals.

## Production acceptance checklist

- [ ] Back up production D1 and apply migration 0003 before deploying the changed Worker.
- [ ] Add the `MFA_ENCRYPTION_KEY` Cloudflare secret without exposing it in Git or client code.
- [ ] Confirm the `AI` binding is active for `zameenhub-marketplace`.
- [ ] Register, verify email, sign in, sign out, reset password, and test invalid/expired tokens.
- [ ] Enrol TOTP with at least two common authenticator apps; test invalid/expired codes, one-time recovery-code consumption, disable, and account deletion.
- [ ] Confirm login from a second browser never bypasses MFA and that logout/deletion clear server sessions.
- [ ] Submit clean and deliberately suspicious test listings; confirm both remain private until authorized review, and the queue shows evidence-based risk reasons.
- [ ] Confirm a high-risk listing cannot be accidentally represented publicly as ownership-verified.
- [ ] Confirm malformed and oversized bodies, wrong/missing Origin headers, repeated logins, and burst listing requests are rejected.
- [ ] Verify mobile navigation, keyboard use, screen-reader labels, cookie-policy link, reduced-motion behavior, and smaller screens.
- [ ] Confirm Resend service emails are delivered and MFA security-notification failures do not expose secrets.
- [ ] Complete the legal/operator details and test the actual production deployment before publicly claiming “production ready”.

**No source-code review can guarantee a website is “perfect.”** This report records concrete changes and the remaining checks instead of claiming a complete penetration test.
