# UI Shell: Navigation, i18n & Design Tokens

> Context #46 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 1, Medium: 3, Low: 0)
> Files read: 12

## 1. Two disagreeing "readable ink colour" formulas pick opposite text colours for the same hex

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/lib/design-tokens-color.ts:11-34`
- **Scenario**: `design-tokens-color.ts` implements `luminance()`/`readableInkOn()` using the real gamma-corrected WCAG relative-luminance formula (sRGB channel curve, weights 0.2126/0.7152/0.0722, threshold `> 0.45`). `src/lib/branding/compute.ts:15-27` reimplements the exact same "pick readable text on a colour" problem with a different, non-gamma-corrected formula (plain 0.299/0.587/0.114 weights, threshold `> 0.6`) as `luminance()`/`readableOn()`. The two disagree on real colours: for `#f59e0b` (one of `branding/compute.ts`'s own `ACCENT_PALETTE` entries), the WCAG formula computes luminance ≈0.44 (→ white ink, `readableInkOn` picks `#ffffff`), while the YIQ-style formula computes ≈0.66 (→ dark ink, `readableOn` picks `#111111`) — the opposite answer for the identical colour.
- **Root cause**: The two modules were built independently for different surfaces (design-system swatches vs. branding accent preview) without either author knowing a "pick readable ink" helper already existed.
- **Impact**: A future caller who needs "readable text on a colour" has a 50/50 chance of importing the less-correct, non-WCAG-compliant formula. Because `branding/compute.ts`'s `readableOn` is used for the client-report accent preview (`AccountSecurity`/branding surfaces) with its own docstring promise "so the client-report preview stays legible on any accent," the weaker approximation can genuinely under- or over-shoot accessible contrast on some accent colours — the exact bug the WCAG version exists to prevent.
- **Fix sketch**: Delete `luminance`/`readableOn` from `src/lib/branding/compute.ts` and have it import `luminance`/`contrastRatio`/`readableInkOn` from `src/lib/design-tokens-color.ts` instead (both are already pure, zero-Node modules, so no boundary issue). Keep `isHexColor`/`initials` in `branding/compute.ts`. Update the one caller of `readableOn` to use `readableInkOn`, adjusting for its slightly different return contract (`"#111111"/"#ffffff"` literals vs. `"var(--color-ink)"/"#ffffff"`) if `branding/compute.ts` needs a hex literal rather than a CSS var.
- **Build risk**: None — both files are already framework-free / zero-Node, so consolidating them does not cross the client/server boundary.

## 2. `SUPPORT_EMAIL` is re-hardcoded outside its single source of truth

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/site.ts:24`
- **Scenario**: `site.ts` defines `SUPPORT_EMAIL = "podpora@adamant.app"` with an explicit doc comment: "Canonical contact addresses — one brand, one domain, everywhere (E1). A buyer doing due diligence must never see two company names or two support domains." Despite that, `src/components/app/modules/AccountSecurity.tsx:14` declares its own local `const SUPPORT_EMAIL = "podpora@adamant.app";` instead of importing the canonical constant, and uses it for the account-deletion mailto link.
- **Root cause**: `AccountSecurity.tsx` was written without importing `@/lib/site`; the string was copy-pasted instead.
- **Impact**: Exactly the drift `site.ts`'s own doc comment warns against — if the support address is ever rotated, this one call site silently keeps mailing the old address on a GDPR account-deletion flow, with no compiler error to catch it.
- **Fix sketch**: In `AccountSecurity.tsx`, delete the local `const SUPPORT_EMAIL = …` and `import { SUPPORT_EMAIL } from "@/lib/site";` instead.
- **Build risk**: `site.ts` has no `server-only`/Node imports (it only reads `process.env` and pulls pure constants from `@/lib/llm/models`), so it is safe to import into `AccountSecurity.tsx`'s `"use client"` boundary — but this would be the first client-component import of `site.ts`, so verify with `next build`, not just `tsc`, per this project's known tsc-blind-spot.

## 3. `useT` and `getT` reimplement the identical translator-resolution logic

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/i18n/client.ts:22-26`
- **Scenario**: `useT` (client) and `getT` (`src/lib/i18n/server.ts:15-19`) both do `const table = dict[locale] ?? dict.cs; return (key, vars) => interpolate(table[key] ?? dict.cs[key] ?? key, vars);` — byte-for-byte identical fallback/interpolation logic, differing only in how each obtains `locale` (`useLocale()` hook vs. `await getServerLocale()`).
- **Root cause**: The translator-resolution logic was inlined separately in each entry point rather than factored into the already-shared, framework-free `interpolate.ts`.
- **Impact**: Currently harmless (both copies agree), but any future change to the fallback rule (e.g. how a missing key degrades) has to be made twice in lockstep with no shared test guarding the pairing — an easy spot to introduce exactly the kind of client/server drift finding #1 shows already happened elsewhere in this context.
- **Fix sketch**: Add `export function resolveTranslator<K extends string>(dict: TDict<K>, locale: SupportedLocale): TFn<K>` to `src/lib/i18n/interpolate.ts` containing the shared two lines, then have `useT` call `resolveTranslator(dict, locale)` and `getT` call `resolveTranslator(dict, await getServerLocale())`.
- **Build risk**: None — `interpolate.ts` is already framework-free and imported by both the `"use client"` `client.ts` and the server-only `server.ts`, so adding one more pure export to it doesn't change its boundary safety.

## 4. `pinPlant` motion variant is unused dead code

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/motion.ts:33-42`
- **Scenario**: `pinPlant` ("a numbered map pin dropping onto the canvas") is exported alongside `pingPulse`, which is actively used by `src/components/marketing/RankClimbDemo.tsx:20,176`. A repo-wide grep for `pinPlant` outside `motion.ts` returns zero matches — the map-pin drop animation it was written for was apparently never wired up (or was replaced by the layout-animation approach `RankClimbDemo` actually uses).
- **Root cause**: Leftover from the "hybrid layer from the local-SEO consolidation" the file's header comment references — likely ported speculatively alongside `pingPulse` but never consumed.
- **Impact**: Low but real — every future reader of this small, otherwise-tight file has to mentally filter out a variant that does nothing, and it's one more surface a "does anything use this?" grep has to cross-check.
- **Fix sketch**: Delete the `pinPlant` export (lines 33-42) from `src/lib/motion.ts`. No other file imports it, so no follow-up changes are needed.

## 5. `JOURNEY_LAST_KEY` is written every visit but never read back

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/journey.ts:10,38-48`
- **Scenario**: `markVisited()` writes both `JOURNEY_VISITED_KEY` and `JOURNEY_LAST_KEY` to `localStorage` on every journey-page visit (invoked from `JourneyBeacon.tsx`). Only `JOURNEY_VISITED_KEY` is ever read back (via `readVisited()` in `src/components/site/Nav.tsx:37`); the "Pokračovat" resume target is computed from `firstUnvisited(items, visited)` — derived purely from the visited list, not from `JOURNEY_LAST_KEY`. A repo-wide grep for `JOURNEY_LAST_KEY` shows it is written in `journey.ts` and asserted-as-set in `test-unit/journey.test.mjs:45`, but never read via `getItem` anywhere in `src/`.
- **Root cause**: `JOURNEY_LAST_KEY` looks like scaffolding for a "resume to last-visited page" feature that was superseded by the current "resume to first-unvisited task" design (`firstUnvisited`) without the now-redundant write being cleaned up.
- **Impact**: Minor — an extra `localStorage.setItem` on every page visit that nothing consumes, and a key in the public `journey.ts` contract that implies functionality (a "last visited" pointer) the app doesn't actually use, which can mislead a developer debugging the resume flow into looking in the wrong place.
- **Fix sketch**: Remove the `JOURNEY_LAST_KEY` export and its `storage.setItem(JOURNEY_LAST_KEY, href)` write from `markVisited()` in `src/lib/journey.ts`, and drop the corresponding assertion in `test-unit/journey.test.mjs:45` (outside this context's file list, but a required follow-up edit for the fix to be complete).
