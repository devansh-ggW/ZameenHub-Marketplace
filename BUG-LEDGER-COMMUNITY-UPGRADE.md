# ZameenHub engineering bug ledger — community trust upgrade

**Baseline branch:** `main`  
**Feature branch:** `feature/community-trust-legal-evidence-2026-11`  
**Baseline review date:** 11 November 2026  
**Method:** GitHub source review and existing repository audit/checklist review. No production D1 mutation or deployment was performed.

| ID | Severity | Area | Finding / root cause | Planned action | Verification |
|---|---|---|---|---|---|
| ZH-001 | High | Community trust | No review, discussion, aggregate rating or central colour-engine implementation existed in the baseline. | Add schema, one central policy calculator, Worker aggregate API, UI, and threshold tests. | Unit boundary tests; migration checks; CI build/smoke; API authorization tests still required. |
| ZH-002 | High | Reports | Existing property reports were only open/reviewing/resolved/dismissed and had no append-only status transition history or substantiated finding. | Migrate statuses, add eligibility flag/contribution uniqueness, append-only events, and moderator actions. | SQLite migration regression; concurrency/idempotency tests; live API tests still required. |
| ZH-003 | High | Evidence classification | Existing evidence rows had only generic PDF/image types; no ownership/inheritance/legal-status category, source date, issuing authority or jurisdiction metadata. | Add additive classification fields and dynamic seller workflow. | Migration tests and create/edit/upload integration tests. |
| ZH-004 | High | Privacy | Existing buyer property-detail API exposes active seller evidence URLs. ImageKit and direct external URLs are public resources; there is no private evidence delivery proxy/access-control layer. | Keep only seller-authorized, redacted, public material in the current model; explicitly warn sellers and do not claim confidential URL protection. | Test public responses, browser network behavior, and file privacy with non-production accounts. |
| ZH-005 | High | Legal documents | Baseline privacy/T&C copy was identified as a practical product draft; legal operator identity, address, retention schedule and jurisdiction still need operator confirmation. | Add current primary-source legal research notes and legal-review checklist; update product disclosures. | Review by qualified Indian counsel required. |
| ZH-006 | High | Production migration | Actual remote D1 schema, backup/restore and migration state cannot be established from repository access alone. | Keep migrations additive; do not apply to production; run against local SQLite in CI and require operator backup/restore check. | Must be executed in Cloudflare dashboard/preview or another approved non-production D1. |
| ZH-007 | High | Cross-account authorization | Existing repository security audit already identifies cross-account and MFA/session tests as deployment gates. Source inspection cannot replace adversarial account tests. | Add explicit API authorization tests for every new review/comment/report/admin route. | Must run using separate test accounts against preview. |
| ZH-008 | Medium | Responsive/accessibility | Property detail is a dense two-column desktop layout with evidence and report controls; the new discussion and indicator UI add more content. | Use responsive sections, semantic headings/labels, no horizontal overflow. | Browser tests at desktop/tablet/mobile widths still required. |
| ZH-009 | Medium | Dependencies / preview | Existing SECURITY-AUDIT notes a prior preview build failure on PR #28; not enough evidence to attribute it to the current branch. | Re-run CI and deploy dry-run after this branch is complete. | GitHub Actions status required. |
| ZH-010 | Medium | Public report transparency | Existing report endpoint only exposes pending reports to moderators and has no public aggregate count/definition of eligible reports. | Expose counts only; protect identities and report narratives; label allegation status separately. | CI passes; public payload still requires browser/API response review. |
| ZH-011 | High | Legal operations | Operator legal identity/address, formal Grievance Officer designation, IT Rules intermediary classification and any quarterly user-notice duties are not established by repository code. | Obtain Indian counsel's classification and operator details; implement the applicable grievance contact, response clock and periodic notice process before public launch. | Blocked on operator details and counsel classification; not proven by CI. |
| ZH-012 | Medium | Community trust integrity | Deleted-account seller comments could have been treated as member activity because author_id becomes NULL on account deletion. | Exclude missing authors, seller self-replies and staff activity from GREEN aggregates. | Source and migration regression checks added; latest CI pending. |
| ZH-013 | Medium | Moderation audit concurrency | Concurrent moderation requests could append an event after a stale or already-transitioned report state. | Require exact previous status and a genuine status transition; append the audit event only if the conditional update changed one row. | Migration regression for stale transitions added; latest CI pending. |
| ZH-014 | Medium | Trust score independence | Staff reviews, comments, replies or reports could otherwise influence public trust scoring. | Count only ordinary member accounts; label staff/former-member content and keep seller responses out of the score. | Worker aggregation and migration tests added; latest CI pending. |

## Status convention

- **Open:** identified; no code fix verified.
- **In progress:** code change made but checks not yet run.
- **Ready for CI:** branch contains change; GitHub CI has not yet confirmed it.
- **Verified:** relevant automated test executed successfully.
- **Blocked:** requires preview credentials, deployed infrastructure, a real browser or external legal review.

Do not mark an item verified merely because a file was changed or a TypeScript build is expected to pass.
