# ZameenHub

ZameenHub is a React + TypeScript property marketplace for India, with a Cloudflare Worker API and D1 persistence.

## Authentication and marketplace security

The application uses native email/password authentication, email verification, existing-account activation, password recovery, server-side sessions, protected listing submission, saved properties, owner inquiries, support email delivery, moderator review routes, Privacy Policy, Terms, and Cookie Policy.

This security-hardening release adds optional authenticator-app TOTP two-factor authentication, single-use recovery codes, password-confirmed account deletion, listing-risk triage, property reporting, owner listing management, an inquiry inbox, additional search filters, and an EMI calculator.

### Configure Cloudflare

1. Confirm the existing D1 binding in `wrangler.toml` points to the correct `zameenhub` database.
2. Add the Resend API key in **Workers & Pages → zameenhub-marketplace → Settings → Variables and Secrets** as a **Secret** named `RESEND_API_KEY`. Never put it in the repository, `wrangler.toml`, frontend code or a `VITE_` variable.
3. Configure plain-text Worker variables `APP_URL=https://zameenhub.dewify.shop`, `RESEND_FROM_EMAIL=ZameenHub <verify@zameenhub.dewify.shop>`, and `SUPPORT_EMAIL=dewifystores@gmail.com`. Confirm the exact sender address/domain is Verified in Resend.
4. Apply the additive migration to the intended remote D1 database **before** deploying this Worker:
   ```bash
   npx wrangler d1 migrations apply zameenhub --remote
   ```
5. Verify `/api/health` and complete signup → received email → verification → login → listing submission → moderation → password reset on the deployed domain.

The migration preserves existing users and property data. Existing accounts without a password need the activation flow to set a password and verify their email. Keep the database backup/restore path available before applying schema changes.

## Local checks

```bash
pnpm install
pnpm build
pnpm test:smoke
``

GitHub Actions runs the dependency audit, migration checks, TOTP and EMI tests, production build, smoke checks, and Wrangler dry-run on `main`, the authentication-upgrade branch, the security-hardening branch, and pull requests targeting `main`. Static checks are not a substitute for testing live Resend delivery, D1 queries, cookie behavior over HTTPS, role permissions, abuse/rate limits, and the full browser journey.

## Marketplace behavior

- Public discovery returns only rows whose status is `published`; an empty database is shown as an empty state rather than fake listings.
- New property submissions require a verified account and remain `pending` until a moderator/admin approves them.
- Session cookies are HTTP-only, Secure and SameSite=Lax; session tokens are stored in D1 only as hashes.
- Passwords are hashed with PBKDF2-HMAC-SHA-256 using per-password random salts; password-reset and email-verification tokens are random, hashed at rest, single-use and expiring.
- Support form submissions are sent to `dewifystores@gmail.com` through Resend. If delivery is unavailable, the UI tells the visitor to email support directly.

## Production checklist

Before launch, complete `PRODUCTION-CHECKLIST.md`, review the privacy/terms text for the operator's legal identity and jurisdiction, and verify that account roles are assigned only through trusted administrative processes. Do not promote anyone to moderator/admin through a public endpoint. Photo uploads are not enabled by this upgrade; the UI must not imply that owners can upload photos until a configured storage/delivery path is implemented.

## Support

Customer support: [dewifystores@gmail.com](mailto:dewifystores@gmail.com)


## Account security and listing-risk screening

The security branch adds optional authenticator-app MFA, single-use recovery codes, password-confirmed account deletion, cookie notice/policy, and server-side listing-risk triage. See [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) for the competitor gap analysis and the deployment acceptance checklist.

### Deploying the security branch safely

1. Back up the production D1 database before making schema changes.
2. Apply `migrations/0003_security_mfa_ai.sql` to the configured `zameenhub` D1 database **before** deploying the matching Worker source.
3. In Cloudflare Worker settings, add `MFA_ENCRYPTION_KEY` as a secret, using a cryptographically random value of at least 32 characters. Do not put it in `wrangler.toml`, the source tree, client-side code, or GitHub issues.
4. Confirm the Workers AI binding named `AI` is enabled for `zameenhub-marketplace`. The model uses the Cloudflare Workers AI allowance and may fall back to rule-based flags when inference is unavailable; all new listings remain pending until a reviewer approves them.
5. Run a complete test with non-production accounts and a restorable database backup. Static checks alone do not establish deployment safety.

For example, from an environment already set up with the repository and Wrangler, the migration can be applied with `pnpm exec wrangler d1 migrations apply zameenhub --remote`. Do not deploy the new Worker first: it references the new columns and tables.
