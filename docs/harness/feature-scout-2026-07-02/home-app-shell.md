# Feature Scout — Home, App Shell & Transitions (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/app/page.tsx, src/app/layout.tsx, src/app/template.tsx, src/lib/site.ts

## 1. Ship a branded, locale-aware 404 page (`not-found.tsx`)
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: user_benefit
- **File**: `src/app/layout.tsx:64`
- **Opportunity**: There is no `not-found.tsx` anywhere in the tree, yet `notFound()` is actively thrown by three dynamic routes (`/report/[token]`, `/m/[slug]`, `/app/[projectId]`) and any mistyped URL — all of which are exactly the links people share (report tokens expire, microsite slugs get retyped). Visitors currently land on Next's bare, English, unbranded default 404 inside a carefully branded shell.
- **Why valuable**: A shared report link that has expired is the single most likely "dead end" a real prospect hits; today it looks like the site is broken instead of guiding them back to the rozcestník.
- **Build sketch**: Add `src/app/not-found.tsx` as an async server component (same pattern as `RootLayout`'s `SKIP_T` block): `getServerLocale()` + `getT()` for a cs/en message pair, then render recovery links derived from `localizedNavItems(locale)` (`src/lib/nav.ts:57`) inside the existing `Container`/`card` styles — the nav SSOT guarantees the links never drift. No client code, no gate files touched.

## 2. Add global error boundaries (`error.tsx` + `global-error.tsx`) with a branded retry screen
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/app/layout.tsx:79`
- **Opportunity**: The app has zero error boundaries. Every route is server-rendered on demand (the locale cookie makes the whole app dynamic) and several depend on Firestore, NextAuth and live Ads APIs — a single thrown render error in production yields Next's generic white "Application error" screen with no branding, no Czech copy and no way back.
- **Why valuable**: For a portfolio whose thesis is "produkční řemeslo", an unstyled crash screen in front of a recruiter is the worst possible failure mode; a branded boundary with a retry button turns a transient Firestore hiccup into a non-event.
- **Build sketch**: Add `src/app/error.tsx` (`"use client"`, receives `{ error, reset }`): it renders inside the existing layout, so `useLocale()` from `LocaleProvider` works for cs/en copy; show a short apology, the `error.digest`, and a `reset()` retry button styled like the landing's pill CTAs. Add a minimal self-contained `global-error.tsx` (inlines its own `<html>`/`<body>` and static cs copy) for layout-level crashes. Per the 2026-06-25 learning, this wave must finish with a full `next build`, not just tsc + unit.

## 3. Mirror the env-driven indexing policy as a `robots.ts` route and advertise the existing sitemap
- **Impact**: 6/10
- **Effort**: 1/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: functionality
- **File**: `src/app/layout.tsx:41`
- **Opportunity**: The SEO story is three-quarters built — env-driven `robots` metadata (layout.tsx:41–44), a nav-model-derived `sitemap.ts`, and a data-driven `opengraph-image.tsx` — but there is no `robots.txt` route. Crawlers are never told the sitemap exists, and the preview-deploy "don't index" decision only lives in a meta tag, which requires the crawler to fetch every page first (previews still get crawled, burning crawl budget and leaking preview URLs into logs).
- **Why valuable**: Now that the production domain is deliberately indexable, this is the missing quarter of the discoverability investment: sitemap discovery for the canonical domain and true crawl-blocking (not just index-blocking) for previews.
- **Build sketch**: Add `src/app/robots.ts` returning `MetadataRoute.Robots`: reuse the exact `process.env.VERCEL_ENV === "production"` toggle from layout.tsx:42 — production gets `allow: "/"` (plus `disallow: ["/app", "/api"]` for the authed/API surfaces) and `sitemap: canonical("/sitemap.xml")` via the existing helper in `src/lib/site.ts:14`; everything else gets `disallow: "/"`. One file, ~15 lines, no hashed files.

## 4. Give the all-dynamic shell a pending state with a root `loading.tsx`
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: user_benefit
- **File**: `src/app/template.tsx:15`
- **Opportunity**: The shell animates content *arrival* (the template fade) but has no *pending* feedback: there is no `loading.tsx` anywhere, and since the locale cookie opts every route into on-demand server rendering, slow Firestore-backed pages (`/kampane`, `/app/*`, `/report/[token]`) leave the previous page frozen and inert for the whole server round-trip before the fade finally plays.
- **Why valuable**: On any non-local connection the site feels unresponsive exactly on its data-heaviest, most impressive pages; instant navigation feedback is the cheapest perceived-performance win available to the shell.
- **Build sketch**: Add a minimal server-rendered `src/app/loading.tsx` — a brand-consistent centered mark (reuse the `Logo` icon + `Container`) with a new `@keyframes` in globals.css that holds `opacity: 0` for the first ~200ms so fast navigations never flash it, and extend the existing `prefers-reduced-motion` block (globals.css:413) to cover it. It renders inside the template wrapper, so the fade-in applies to the skeleton and the swap stays smooth; keep it deliberately sparse so it works for every route it covers.

## 5. Add a web app manifest (`manifest.ts`) so the installed/branded-tab experience matches the shell
- **Impact**: 5/10
- **Effort**: 1/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: feature
- **File**: `src/app/layout.tsx:47`
- **Opportunity**: The shell already declares per-scheme theme colors in `viewport` (layout.tsx:47–52) and ships an `icon.svg`, but there is no web app manifest — so "add to home screen"/installed-app views fall back to a generic name and icon, Android's themed UI has no manifest-level `theme_color`/`background_color`, and the app-shell polish stops at the browser tab.
- **Why valuable**: The `/app` workspace is a dashboard-style tool people revisit; a correct manifest makes a pinned/installed instance carry the Adamant name, monolith icon and onyx background — a one-file finishing touch that reinforces the "production craft" narrative.
- **Build sketch**: Add `src/app/manifest.ts` returning `MetadataRoute.Manifest`: reuse the `SITE` name and description strings from layout.tsx, `theme_color`/`background_color` from the existing viewport constants (`#0a0f16`/`#f4f7f9`), `start_url: "/"`, `display: "standalone"`, and icons pointing at the existing `src/app/icon.svg` plus `public/brand/logo-monolith.png` as the 512px maskable entry. Next auto-links it from the root layout; no other file changes.
