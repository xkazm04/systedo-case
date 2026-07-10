# App shell, dev tooling, design system & site metadata infrastructure

> Total: 5
> Critical: 0 · High: 0 · Medium: 2 · Low: 3
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

Note: the prior code_refactor report's clipboard-dup (#2) and `LocEntry.raw` dead-field (#5) are already fixed in current source. Its template/ChromeGate (#1), `error.tsx` `useT` (#3) and robots-duplication (#4) findings are still live but are deliberately NOT restated here per the dedup rule. All five below are new.

## 1. `global-error.tsx` renders its own `<html>` but omits a viewport meta — the last-resort crash screen is non-responsive on mobile

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/global-error.tsx:23`
- **Scenario**: When the ROOT LAYOUT itself throws (the exact case this boundary exists for), Next.js discards `layout.tsx` entirely and mounts `global-error.tsx` as a fresh document root. That bypasses `layout.tsx`'s `export const viewport` (line 45) — the only place `<meta name="viewport" content="width=device-width">` is declared for the whole app. `global-error.tsx` hand-inlines `<html lang="cs"><body>` but never re-declares `viewport` (neither a `<meta>` in a `<head>` nor an `export const viewport`). A user who hits a layout-level crash on a phone therefore gets the error screen rendered at the default ~980px desktop viewport: zoomed-out, sub-readable "Něco se pokazilo" text and a tiny "Zkusit znovu" button.
- **Root cause**: The assumption that document-level `<head>`/viewport metadata is inherited. `global-error` is a *replacement* root, not a child of `layout.tsx`, so nothing from the crashed layer (including its `viewport` export) applies; the file styles the `<body>` for brand fidelity but forgets the one meta tag that governs mobile layout.
- **Impact**: Degraded, hard-to-read recovery UX on mobile precisely at the worst moment (total app failure) — the screen whose entire job is "stay calm and let them retry" is the one that renders broken.
- **Fix sketch**: Add `export const viewport: Viewport = { width: "device-width", initialScale: 1 };` to `global-error.tsx` (Next honours a `viewport` export in the global-error file), or render an explicit `<head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>` inside its `<html>`.

## 2. `/design-system` maps every `icons.tsx` export as a JSX component — one non-component export crashes the whole page

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/app/design-system/page.tsx:36`
- **Scenario**: `const ICONS = (Object.entries(Icons) as [string, IconComponent][]).sort(...)` takes a namespace import (`import * as Icons`) of the icon module and blind-casts *every* export to a renderable component, then renders each with `<Icon width={24} height={24} />` (line 428). Today all 55 exports of `src/components/icons.tsx` happen to be components, so it works. The moment anyone adds a non-component runtime export to `icons.tsx` — a shared `const ICON_SIZE = 20`, an `iconNames` array, a helper like `pickIcon()` — that value flows into `ICONS` and React tries to render it as an element, throwing "Element type is invalid: expected a function/class but got object/number", which crashes the entire `/design-system` route (a footer-linked, production-indexed page).
- **Root cause**: The generator trades a maintenance convenience ("a new icon shows up automatically") for an unchecked assumption that the icon module will only ever export components. The `as [string, IconComponent][]` cast actively suppresses the type error that would otherwise catch this at compile time.
- **Impact**: A future, innocuous edit to an unrelated shared file (`icons.tsx`) silently arms a full-page runtime crash on `/design-system` with no local warning at the edit site.
- **Fix sketch**: Filter before rendering: `Object.entries(Icons).filter(([, v]) => typeof v === "function") as [string, IconComponent][]`, or explicitly whitelist via a named registry. At minimum drop the blanket cast so TypeScript flags a non-component export.

## 3. `Swatch` picks on-swatch ink via a helper that silently returns white for any non-6-digit-hex colour

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/design-system/Swatch.tsx:34`
- **Scenario**: `style={{ background: var(token.cssVar), color: readableInkOn(token.value) }}` chooses legible ink from `token.value`. `readableInkOn` (in `design-tokens-color.ts`) guards with `/^#[0-9a-f]{3,6}$/i.test(hex) && luminance(hex) > 0.45 ? ink : "#ffffff"` — so any colour value that is NOT a 3-to-6-digit hex (an 8-digit `#rrggbbaa`, a `color-mix(...)`, `oklch(...)`, `rgb(...)`) fails the regex and unconditionally yields **white** ink. Worse, a 4- or 5-char hex *passes* the `{3,6}` regex but `luminance()` then reads channel pairs off a mis-length string (`full.slice(4,6)` on a 4-char value → `parseInt("",16)` → `NaN`), so `NaN > 0.45` is false → white ink again. On a light-valued token expressed in any of those forms, the swatch's `token.step`/label renders white-on-light and becomes invisible.
- **Root cause**: The helper is documented as a shared primitive ("lets both the server token reader and the client `Swatch` share it") but its contract silently assumes canonical 6-digit hex; it degrades to `#ffffff` instead of computing real contrast, even though the same file already exports a correct `contrastRatio()`.
- **Impact**: Latent today (all `globals.css` colour tokens are 6-digit hex, verified), but the design system deliberately invites new tokens; the first alpha/`oklch`/`color-mix` token added produces an illegible swatch label with no error.
- **Fix sketch**: Normalise or reject non-hex input explicitly (return a mid-contrast default only after a real luminance/`contrastRatio` computation), and tighten the regex to `{3}|{6}` so a 4/5-char value can't reach `luminance()` and produce `NaN`.

## 4. `DevInspector` schedules a `setTimeout` inside a `setState` updater — an impure updater that can double-fire/leak timers

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/app/_dev-inspector/DevInspector.tsx:77`
- **Scenario**: The `;` keydown handler does `setMode((m) => { if (m==="nav") return "off"; if (m==="armed") return "armed"; navTimer.current = setTimeout(...); return "nav"; })`. The updater is not pure: it mutates the `navTimer` ref and schedules a timer as a side effect. React may invoke a state updater more than once for a single dispatch (StrictMode double-invoke in dev — which this dev-only overlay always runs under; also on discarded/replayed renders). Each extra invocation runs `setTimeout` again and overwrites `navTimer.current`, orphaning the earlier timer id so the subsequent `clearTimeout(navTimer.current)` on `i`/`Esc` can only cancel the last one.
- **Root cause**: Timer scheduling (a side effect) is placed inside the reducer instead of being derived from a state transition in an effect. React's contract requires updaters to be pure functions of previous state.
- **Impact**: Benign in today's flow (the orphaned 2s timer's callback is a no-op unless still in `nav`), but it's a genuine purity violation that becomes an actual duplicate/leaked-timer bug the instant the transition logic gains any observable side effect, and it defeats the `clearTimeout` cancellation guarantee.
- **Fix sketch**: Move the auto-exit timer into an effect keyed on `mode` (`useEffect` that, when `mode==="nav"`, sets a 2s timer and clears it on cleanup / mode change), leaving the `setMode` updater a pure `nav|armed|off` transition.

## 5. The internal design-system styleguide is emitted into the production `sitemap.xml`, soliciting indexing of a raw token-dump page

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/sitemap.ts:12`
- **Scenario**: `sitemap()` maps `sitemapEntries()` into crawl entries with `priority: 0.7`. `sitemapEntries()` (nav.ts) includes every `FOOTER_META_PAGES` href, one of which is `/design-system` — an internal "living style guide" (per the manifest description) that renders raw colour-ramp hex dumps, radius/shadow swatches and an icon grid. Because `robots.ts` allows `/` and only disallows `/app` + `/api`, this internal tooling page is both crawlable and *actively advertised* in the production sitemap, so it competes for SERP real estate with the real marketing/case-study pages and can surface a token-dump as a Google result for the brand.
- **Root cause**: `sitemapEntries()` treats "linked in the footer" as equivalent to "should be indexed", conflating internal-diagnostic surfaces with public marketing pages; there's no per-entry `index`/exclude flag, so a diagnostic page rides into the sitemap for free.
- **Impact**: Low but real SEO/brand degradation — an internal styleguide indexable (and sitemap-promoted) on the production domain. Unlike `/report/[token]` (which correctly sets `robots: noindex`) and illustrative microsites, `/design-system` has no page-level noindex to compensate.
- **Fix sketch**: Either add `robots: { index: false, follow: false }` to `design-system/page.tsx`'s `metadata`, or exclude diagnostic hrefs from `sitemapEntries()` (e.g. tag `FOOTER_META_PAGES` entries with an `indexable` flag and filter it out in `sitemap.ts`).
