# ZameenHub delivery checklist

## Brand and experience
- [ ] Use the supplied blue architectural icon as the ZameenHub mark and app identity.
- [ ] Implement the warm-white, blue-accent editorial design system without purple gradients, neon, fake trust claims, or decorative nonfunctional controls.
- [ ] Implement a reusable CinematicScrollExperience with actual scroll-linked layered transforms, normal scrolling, reduced-motion support, and a lighter mobile treatment.

## Core pages and navigation
- [ ] Implement `/` with navigation, cinematic hero, search, browse/list CTAs, featured data section, categories, supported location discovery, how-it-works, seller CTA, and footer.
- [ ] Implement `/properties` with URL-synchronized search/filter/sort controls, actual result counts, loading/error/empty/no-results states, responsive cards, and mobile filter behavior.
- [ ] Implement `/properties/:slug` with gallery/lightbox, property attributes, description, amenities, seller block, save/share/contact/report actions, similar properties, and missing-listing handling.
- [ ] Implement `/login`, `/signup`, `/profile`, `/saved`, `/list-property`, `/my-listings`, `/about`, `/contact`, `/help`, `/privacy`, and `/terms` as real routed pages.

## Data and backend boundary
- [x] Keep production data truthful: the local property array and all development listing records are removed; production empty and error states are supported.
- [ ] Provide typed API contracts and Cloudflare-compatible Worker endpoints for auth, properties, profile, favorites, inquiries, and image uploads.
- [ ] Include versioned SQL schema with ownership, statuses, timestamps, constraints, and indexes.
- [ ] Document required Cloudflare/D1/R2/auth configuration and do not claim unavailable services are connected.

## Quality
- [ ] Use accessible labels, focus states, semantic landmarks, keyboard-friendly dialogs, meaningful image alt text, and responsive mobile layouts.
- [ ] Run dependency installation, type checks, production build, route manifest validation, and a live server smoke test.
- [ ] Fix actionable errors found by diagnostics and leave an honest completion report in README.md.
