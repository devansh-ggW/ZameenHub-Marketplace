# ZameenHub implementation plan

## Implementation approach

ZameenHub will be a React + TypeScript Vite SPA with route-driven pages and a small typed API layer. The first delivery is intentionally honest about data availability: the UI reads from a local development dataset and the API boundary is implemented so it can be replaced with D1/Cloudflare bindings without changing page contracts. Protected actions use explicit logged-out states until a real auth provider and database are configured.

The application is organized into `src/components` for reusable UI, `src/pages` for routed screens, `src/lib` for API/types/data utilities, and `worker` plus `migrations` for the Cloudflare-compatible backend boundary and schema. The homepage is art-directed around the supplied blue architectural icon, warm white surfaces, restrained blue accents, large architectural imagery, and a scroll-linked pinned scene using CSS 3D transforms tied to `scrollYProgress`.

## Design direction

Three possible movements: Swiss architectural editorial (0.06); quiet luxury property journal (0.08); blueprints-and-brick modernism (0.07). Chosen direction: **Swiss architectural editorial**.

- **Design Movement:** Swiss architectural editorial with gallery-like whitespace, hard edges, measured typography, and confident blue wayfinding.
- **Core Principles:** calm utility before decoration; imagery framed as architecture rather than generic cards; blue used for decisions and navigation; generous rhythm and clear hierarchy.
- **Color Philosophy:** warm white makes the interface feel lived-in and approachable; ink blue provides trust and legibility; cobalt is reserved for active decisions and the brand mark.
- **Layout Paradigm:** offset editorial compositions with wide image fields, a left-aligned reading rail, and a search spine that persists through the experience rather than a centered template grid.
- **Signature Elements:** a faceted “Z” architectural icon; thin blue rules and numbered section markers; clipped image layers that shift as the user scrolls.
- **Interaction Philosophy:** every motion reveals context or depth; actions are direct, labelled, and reversible.
- **Animation:** `motion` scroll progress drives translate/scale/rotate on layered images and opacity on story copy; reduced-motion users see the same content in static stacked scenes.
- **Typography System:** Inter for all UI and editorial copy, with bold condensed-feeling uppercase labels achieved through tracking rather than a second font. Display sizes step down deliberately from 72px desktop to 44px mobile.
- **Brand Essence:** a considered property marketplace for people who want to find a place with clarity; calm, assured, observant.
- **Brand Voice:** direct and human. Examples: “A clearer way to find home.” and “List the place that matters.”
- **Wordmark & Logo:** the supplied faceted blue architectural mark sits beside a compact ZameenHub wordmark; the mark is also used alone as a favicon/app icon.
- **Signature Brand Color:** cobalt blue `#2864DC`.

## Project structure

- `src/App.tsx`: route composition and shared providers.
- `src/components`: header, footer, search, cards, filters, gallery, parallax, forms, and state components.
- `src/pages`: homepage, discovery, detail, auth, account, listing flow, informational pages.
- `src/lib`: property types, local development data, query helpers, API client, and formatting.
- `worker/index.ts`: Cloudflare-compatible API route skeleton and response helpers.
- `migrations/0001_initial.sql`: application schema for users, properties, favorites, inquiries, and sessions.
- `public/manus-routes.json`: route manifest for Preview.

## Delivery and verification

Install dependencies, run TypeScript/build checks, start the Vite server on the configured port, verify the route manifest and primary routes, and leave a README that separates local demo data from production database/auth/storage configuration. No production listing, seller, review, or marketplace claim will be fabricated.
