# ZameenHub

ZameenHub is a React + TypeScript real-estate marketplace experience for India. It combines a premium architectural editorial surface with a practical discovery flow: search, filter, property detail, saved states, account routes, and a listing wizard with review status.

## Current state

The workspace is implemented and runs as a Vite SPA on port 3000. It contains no local property records, demo listings, sample sellers, fabricated prices, or fallback marketplace data. Architectural photographs remain only as editorial brand imagery. When the live data source is empty or unavailable, the application shows a zero-result empty state or an explicit backend error.

The supplied blue architectural mark is stored at `public/assets/zameenhub-icon.jpg` and is used in the browser favicon, header, footer, and brand presentation.

## Run locally

```bash
pnpm install
pnpm dev
```

Then open the Preview for the project. Production compilation is `pnpm build`; type checking is `pnpm typecheck`.

## Architecture

The frontend lives in `src/` and uses React Router. Shared components are in `src/components.tsx`; routed screens are in `src/pages.tsx`; types, editorial image assets, and the typed API boundary are in `src/lib/`. `src/motion.tsx` provides the sitewide `MotionProvider`, `ScrollProgress`, `ScrollScene`, and `DepthImage` primitives. The homepage now uses multiple distinct architectural scenes, and the global motion root adds restrained progress-linked depth treatments to discovery, detail, account, listing, informational, and footer layouts. Every scroll listener is coalesced with `requestAnimationFrame` and cleaned up on unmount. Reduced-motion CSS disables transforms while preserving content and controls.

`worker/index.ts` is the Cloudflare-compatible API boundary. `migrations/0001_initial.sql` is a versioned SQLite/D1 schema for users, sessions, properties, images, favorites, and inquiries. If deploying with a Cloudflare Worker, connect the `DB` and `R2` bindings and expand the route handlers to use parameterized queries, secure session validation, ownership checks, CSRF protection, and the approved authentication flow. The current managed Webdev project does not claim those external Cloudflare resources are connected.

## Data, auth, storage, and deployment

No additional database, storage service, or hosting service has been introduced. The managed project server/database capabilities remain the existing integration boundary. Before production use, configure the approved authentication provider and server-verified sessions, apply the existing migration to the intended database, connect the already-planned object storage binding for validated image uploads, and return verified records through `/api/properties`. There is no development seed and no local fallback array to remove or accidentally deploy.

For a Cloudflare deployment, adapt the existing project configuration to the chosen Worker/static-assets target, run the migration through the target D1 migration command, set the Worker bindings and secrets, and route `/api/*` to the Worker while serving the Vite build output for the SPA. No Cloudflare credentials or deployment claim is included in this workspace.

## Honest limitations

The managed development environment starts with no verified marketplace records or configured owner-supplied contact/legal details. Login and account pages therefore fail closed with an explicit configuration message, private account routes do not expose simulated data, and the contact/legal pages explain what the owner must supply before launch. Inquiry and listing interfaces validate their forms and use the typed boundary, but production delivery requires the configured backend and approved authentication/database bindings.
