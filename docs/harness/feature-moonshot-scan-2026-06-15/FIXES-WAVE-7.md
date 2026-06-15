# Fix Wave 7 — Pipeline & SEO Polish (systedo-case)

> 3 atomic commits. The nav model becomes a presented IA deliverable, an
> embarrassing data-persistence contradiction + a dead link are gone, and the
> quality pipeline is a visible portfolio artifact.
> Baseline preserved: 0 TS / 0 lint → 0 / 0. Production build ✓ (13 routes incl.
> /mapa + /sitemap.xml).

Date: 2026-06-15.

## Commits

| Commit | Fix | Finding |
|---|---|---|
| `…(W7·1)` | /mapa IA page + SiteNavigation JSON-LD + sitemap | header-footer-nav #5 (Critical) |
| `3b444c2` | Footer↔nav drift + dead category link | header-footer-nav #2 + article-reading #1 |
| `9cc058f` | README badges + Dependabot + CI coverage gate | build-tooling #1/#2/#3 |

## What was built

1. **`/mapa` + sitemap + SiteNavigation JSON-LD** — `sitemapEntries()` derives
   `app/sitemap.ts`; `/mapa` renders the task-ordered journey with blurbs and emits
   `ItemList`/`SiteNavigationElement` JSON-LD — all from the one `NAV_ITEMS` array, so
   header, footer, home, breadcrumbs, sitemap and the map can't drift. Footer links it.
2. **Drift + dead-link fix** — the footer claimed "JSON persistence (bez DB)" while the
   Kampaně page genuinely persists to `node:sqlite` (a self-contradiction in a no-drift
   study). Extracted `STACK_FACTS` to `site.ts` with an accurate "JSON (obsah) +
   node:sqlite (kampaně)" line, rendered by the footer. `categoryHubPath()` now returns
   `/clanek` instead of a dead `/clanek?kategorie=` query with no listing behind it.
3. **Pipeline as artifact** — README stack badges (Next.js/React/TS/Tailwind/quality
   gate), a `dependabot.yml` (npm + github-actions weekly, dev bumps grouped), and a
   key-free `LLM chokepoint coverage` step added to CI so the single-chokepoint invariant
   is enforced in CI, not just the local pre-commit hook.

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 (per commit) |
| `eslint` | 0 |
| `next build` | ✓ — `/mapa`, `/sitemap.xml` prerender |
| LLM gate | pass |

## Notes / honest caveats

- The site is intentionally `robots: { index: false }` (a case-study demo), so the
  sitemap/JSON-LD won't be crawled — they ship as correct *infrastructure + a
  systems-thinking deliverable*, not for live SEO ranking.
- The repo has **no git remote**, so a live CI-status shield would 404 — used static
  shields.io badges instead.

## Patterns established (catalogue, cont.)

21. **Derive every navigation artifact from one model** — header, footer, home,
    breadcrumbs, sitemap, IA page and SiteNavigation JSON-LD should all read one typed
    array; a "no-drift" claim is only true if the artifacts are *generated*, not retyped.
22. **A no-drift study must not contradict itself** — hard-coded facts (the footer
    stack line) drift from the truth; centralise them (`STACK_FACTS`) so there's one
    place to keep honest.
23. **Don't emit dead links** — a path helper that returns a URL with no page behind it
    (`/clanek?kategorie=`) is a latent 404 in breadcrumbs + JSON-LD; point at what exists.

## What remains
- **Wave 6 — Multi-market locale** (`createFormatters(locale)` at the `format.ts`
  chokepoint + a cs/en · Kč/€ switcher) — the last unstarted numbered wave.
- Package-extraction moonshots (structured-llm SDK, LLM Quality Gate, token package,
  AI case-study starter) as standalone goals.
- Per-theme leftovers noted across the wave docs.

Done: Wave 5, Wave 1, Wave 1b, Wave 2, Wave 3, Wave 4, Wave 7 (6 of 7 planned waves).
