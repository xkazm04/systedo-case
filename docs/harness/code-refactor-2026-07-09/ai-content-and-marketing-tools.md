# AI Content & Marketing Tools

> Context #8 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 3, Medium: 2, Low: 0)
> Files read: 17

## 1. Six panels hand-roll the same loading/timeout/error block instead of sharing ContentPipeline's own abstraction

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/ai/ContentPipeline.tsx:199-223`
- **Scenario**: `ContentPipeline.tsx` defines a private `StepStatus` component that renders `<LoadingTimer expectedMs={tool.expectedMs} />` while loading, then branches `tool.timedOut ? <TimeoutState onRetry={tool.reset} /> : <ToolError message={tool.error ?? ""} onRetry={tool.reset} retryIn={tool.retryIn} upgradeUrl={tool.upgradeUrl} />` on error. The exact same three-way branch — same props, same order, same fallback string — is copy-pasted inline in five other places: `src/components/ai/AdGenerator.tsx:703-709`, `src/components/ai/ContentBriefGenerator.tsx:530-536`, `src/components/ai/ArticleDraftPanel.tsx:410-416`, `src/components/ai/PerformanceAnalyst.tsx:202-208`, and `src/components/ai/KeywordResearch.tsx:438-444` (for the `clusters` sub-tool). All six call sites consume the identical shape `useAiTool()` already returns (`status`, `error`, `retryIn`, `upgradeUrl`, `timedOut`, `expectedMs`, `reset`).
- **Root cause**: Each panel was built independently against `useAiTool`, and when `ContentPipeline.tsx` needed the same chrome for its four sub-tools it wrote a local helper instead of promoting the pattern to `primitives.tsx` where `LoadingTimer`, `TimeoutState` and `ToolError` themselves already live.
- **Impact**: A UX tweak to the loading/timeout/error sequence (e.g. changing the fallback error copy, adding a spinner variant, or reordering timeout-vs-error precedence) requires editing six near-identical blocks in lockstep; missing one leaves that panel visibly inconsistent. `ContentPipeline.tsx` already proves the abstraction is safe and sufficient — it's just trapped as a private, non-exported function.
- **Fix sketch**: Move `StepStatus` out of `ContentPipeline.tsx` into `primitives.tsx`, export it (e.g. as `ToolStatus`) accepting `{ status, error, retryIn, upgradeUrl, timedOut, expectedMs, reset }`. Replace the five duplicate inline blocks with `<ToolStatus status={status} error={error} retryIn={retryIn} upgradeUrl={upgradeUrl} timedOut={timedOut} expectedMs={expectedMs} reset={reset} />` (most callers can spread the `useAiTool()` return value directly), and update `ContentPipeline.tsx`'s four call sites to import the shared version instead of the local one.

## 2. CreativeAttribution recomputes ROAS by hand instead of calling the helper it already imports from

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/ai/CreativeAttribution.tsx:270-275`
- **Scenario**: The per-record ROAS shown next to each saved creative link is computed inline: `{l.metrics.cost > 0 ? fmt.fmtMultiple(l.metrics.convValue / l.metrics.cost) : "—"}`. But `src/lib/images/attribution-types.ts:53-55` already exports `creativeRoas(m: CreativeMetrics): number` — the exact same `safeRatio(convValue, cost)` guard — and `CreativeAttribution.tsx:9` already imports `CreativeLink, CreativeMetrics, StyleStat, StylePrior` from that very file. The leaderboard table a few lines above (line ~194) correctly uses the server-computed `s.roas` field (itself built from `creativeRoas`'s `safeRatio`), so the same file displays two different code paths computing the same ratio for the same metric shape.
- **Root cause**: The per-style leaderboard's `roas` field arrives pre-computed from the API, so that render path never needed the helper; the per-link list was added later and reached for a quick inline expression instead of importing the sibling function that already handles the same edge case.
- **Impact**: Low today (both expressions are mathematically identical), but it's a live drift risk — if `creativeRoas`/`safeRatio` ever changes its zero-division or rounding behavior, this inline copy silently diverges and the two ROAS numbers on the same page can disagree.
- **Fix sketch**: Add `creativeRoas` to the existing import from `@/lib/images/attribution-types` and replace the inline ternary with `l.metrics.cost > 0 ? fmt.fmtMultiple(creativeRoas(l.metrics)) : "—"` (or drop the `cost > 0` guard entirely since `creativeRoas` already returns `0` via `safeRatio`, and format `0` as "—" only for display).

## 3. AdExperiments and CreativeAttribution duplicate the entire "enter performance metrics" form

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/ai/AdExperiments.tsx:57,73-79,130-133,216-229`
- **Scenario**: `AdExperiments.tsx` defines `EMPTY_METRICS` (impressions/clicks/conversions/cost/convValue all 0), a `metricFields` array mapping those five keys to labels, a `setField` handler that clamps input to `Math.max(0, Number(value) || 0)`, and a `metricFields.map(...)` render loop producing five labelled `<input type="number" min={0}>` rows. `src/components/ai/CreativeAttribution.tsx:64,83-89,233-246` defines the identical `EMPTY_METRICS` shape, an identical `metricFields` array (same five keys, same label keys `metricImpressions`/`metricClicks`/`metricConversions`/`metricCost`/`metricConvValue`), and the same clamped-number-input pattern inline in its `onChange`. The two backing types (`AdVariantMetrics` in `src/lib/ai/experiment-types.ts` and `CreativeMetrics` in `src/lib/images/attribution-types.ts`) are structurally identical records.
- **Root cause**: Both panels independently needed a small "record real performance for this X" form and each wrote its own copy rather than factoring a shared field-set component into `primitives.tsx`.
- **Impact**: Any change to the metrics-entry UX (a new field, a currency-aware input, validation messaging) has to be made twice, and the two copies have already drifted stylistically (different input padding/classes) even though the field set and behavior are meant to be the same.
- **Fix sketch**: Add a small generic component to `primitives.tsx`, e.g. `MetricsFields<T extends Record<string, number>>({ fields, value, onChange }: { fields: { key: keyof T; label: string }[]; value: T; onChange: (key: keyof T, raw: string) => void })`, encapsulating the `Math.max(0, Number(raw) || 0)` clamp and the label/input row markup. Have both `AdExperiments.tsx` and `CreativeAttribution.tsx` build their five-entry `fields` array and pass their existing `EMPTY_METRICS`/state through it, deleting the duplicated JSX and clamp logic (the two panels can keep their own styling via a `className` prop if the visual difference is intentional).

## 4. `slugify` is reimplemented a third time in AdGenerator instead of reusing either existing shared helper

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/ai/AdGenerator.tsx:256-264`
- **Scenario**: `AdGenerator.tsx` defines a local diacritics-stripping slug function (`.normalize("NFD").replace(/\p{Diacritic}/gu, "")...`) used at four call sites (lines 292, 550, 563, 570) for the RSA-preview URL path and CSV filenames. This is the third independent "diacritics-aware slugify" in the repo: `src/lib/nav.ts:104` exports `slugify` (built on the same NFD-normalize technique via `normalizeForSearch`) used by the quick-nav search, and `src/lib/ai/tools/_shared.ts:58` exports a separate `slugify` (a manual code-point `DIACRITICS` map, dependency-free by design) used by the ads/brief/analysis/campaign-eval prompt builders. All three produce the same class of output (`"Kešu ořechy" → "kesu-orechy"`); AdGenerator's local copy additionally caps the result at 28 characters, which neither shared version does.
- **Root cause**: `AdGenerator.tsx` is a client component and likely avoided importing from `src/lib/ai/tools/_shared.ts` (a directory that reads as server/prompt-building code) or `src/lib/nav.ts` (a nav-specific module), so a third copy was written inline instead.
- **Impact**: Three slug implementations means three places to fix if diacritics handling needs to change (e.g. adding a missing Czech character), and no guarantee the three stay in sync — `nav.ts`'s and `_shared.ts`'s already differ in technique (regex range vs. lookup map) even though their outputs currently agree.
- **Fix sketch**: Import `slugify` from `src/lib/ai/tools/_shared.ts` (it has zero imports of its own — verified safe to pull into a `"use client"` file) and replace the local definition with a one-line wrapper `const slugSeed = (s: string) => slugify(s).slice(0, 28);` used at all four call sites, preserving today's truncation behavior exactly.
- **Build risk**: `_shared.ts` currently has no imports (pure string functions only), so pulling it into this `"use client"` component is safe today — but re-verify with `next build` after the change in case that file later grows a transitive server-only import.

## 5. `TextRow` in primitives.tsx is exported and documented but has zero callers

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/components/ai/primitives.tsx:159-173`
- **Scenario**: `TextRow` ("A single generated text line with its character count and a copy button") is exported from `primitives.tsx` but is never imported or rendered anywhere in `src/`. A repo-wide grep for `TextRow` turns up only its own definition and a doc comment in `AdGenerator.tsx:372` ("TextRow's editable sibling") describing the *unrelated* local `EditableTextRow` component — the read-only original it was meant to generalize was superseded by the editable version everywhere it would have been used, and the old one was never deleted.
- **Root cause**: `AdGenerator.tsx` grew an editable variant (`EditableTextRow`) to support in-place text fixes; every call site that would have used the plain `TextRow` was migrated to the editable one, leaving the original an orphan.
- **Impact**: Minor — a reader scanning `primitives.tsx`'s public surface for "how do I render a generated text line" will reach for the dead `TextRow` instead of the actually-used `EditableTextRow`, and any future bugfix to the shared row styling (over-limit tint, copy button) has one more component to remember to check.
- **Fix sketch**: Delete the `TextRow` function and the `ResultHistoryItem`-adjacent export line in `primitives.tsx:159-173`. No import sites exist, so no other file changes are needed. (Do not touch `EditableTextRow` in `AdGenerator.tsx` — that one is live and unrelated.)
