# Marketing Landing Pages

> Context #14 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 14

## 1. Delete the unreachable, hand-duplicated `DEFAULT_LABELS` fallback

- **Severity**: High
- **Category**: dead-code
- **File**: `src/components/marketing/RankClimbDemo.tsx:40-56`
- **Scenario**: `RankClimbDemo` accepts `labels?: Partial<RankClimbLabels>` and builds its working copy with `{ ...DEFAULT_LABELS, ...partial }` (`RankClimbDemo.tsx:87`). Its only caller anywhere in the repo, `src/components/marketing/LocalSeoShowcase.tsx:165` (`<RankClimbDemo labels={c.rank} />`), always passes the full, locale-specific `c.rank` object — both `CONTENT.cs.rank` and `CONTENT.en.rank` are declared `satisfies RankClimbLabels` (`LocalSeoShowcase.tsx:56`, `:101`), i.e. every key is always present. That makes the `DEFAULT_LABELS` half of the spread permanently unreachable. Worse, `DEFAULT_LABELS` (`RankClimbDemo.tsx:40-56`) is a verbatim, hand-retyped copy of `CONTENT.cs.rank` (`LocalSeoShowcase.tsx:41-56`) — the same 15 Czech strings exist twice.
- **Root cause**: `labels` was made `Partial<...>` defensively for a future second caller that never arrived; the fallback block was copy-pasted from the CS content object at the time and never removed.
- **Impact**: Two copies of the same marketing copy to keep in sync. Because the fallback path is currently dead, a future edit to `CONTENT.cs.rank` (e.g. a copy fix) has no reason to also touch `DEFAULT_LABELS`, so the two will silently diverge — and the divergence would only surface if a second, partial-labels caller appears later and unexpectedly lands on stale text.
- **Fix sketch**: Confirm (grep `RankClimbDemo`) there is still exactly one caller, then drop the `Partial<RankClimbLabels>` prop type and the spread — make `labels: RankClimbLabels` required and delete `DEFAULT_LABELS` (`RankClimbDemo.tsx:40-56`) entirely.

## 2. RankClimbChart re-implements line/area path math that already exists twice elsewhere

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/marketing/charts/RankClimbChart.tsx:23-34`
- **Scenario**: `RankClimbChart` hand-rolls its own coordinate scaling and an `M...L...` path-string builder — `x(i) = PAD.l + (i/(n-1))*plotW` (line 23), `y(rank)` (line 25), `linePath()` (lines 27-29), and an `areaPath` built by appending the two bottom-corner points (line 33) — to turn a numeric series into an SVG line + fill. The identical math is already implemented independently in `src/components/dashboard/TrendChart.tsx:187-217` (its own `x`/`y`/`linePath`/`areaPath`), and, as a proper reusable primitive with more features (autoColor, dashed forecast tail, extremum markers, generated a11y label), in `src/components/charts/Sparkline.tsx:127-143` — whose own header comment says it exists to replace "what the analytics modules used to hand-roll."
- **Root cause**: `RankClimbChart` needed an inverted y-axis (rank #1 at the top) and a two-series (you vs. rival) layout that `Sparkline` doesn't support, so it was written from scratch instead of extending the shared primitive.
- **Impact**: A third independent implementation of the same ~10 lines of scale/path math. A future fix to how paths round coordinates, or how the area's bottom corners are computed, has to be found and applied in up to three places — `RankClimbChart` is the one most likely to be missed since nothing in it references `Sparkline` or `TrendChart`.
- **Fix sketch**: Extract the shared "points → linePath/areaPath" math (already common to `TrendChart` and `Sparkline`) into a small pure helper, e.g. `src/lib/charts/svgPath.ts` exporting `buildLinePath(values, x, y)` / `buildAreaPath(...)`, and have `RankClimbChart` call it with its own inverted `y` accessor. Treat `TrendChart`'s copy as a follow-up in a separate, non-marketing pass — not required to close this finding.

## 3. `CROSSROAD_META` isn't typed against `CROSSROAD_HREFS`, so a future entry can silently vanish

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/brand/crossroad/meta.tsx:17-24`
- **Scenario**: `CROSSROAD_HREFS` (`meta.tsx:17`, 4 literal route strings) and `CROSSROAD_META` (`meta.tsx:19-24`, a `Record<string, CrossroadMeta>` keyed by the same 4 hrefs) are two hand-maintained structures in the same file. `Crossroad.tsx:49-50` looks up `CROSSROAD_META[item.href]` and renders nothing for that row when the key is missing (`if (!meta) return null;`). Because `CROSSROAD_META` is typed with a loose `Record<string, CrossroadMeta>` instead of being keyed off `(typeof CROSSROAD_HREFS)[number]`, TypeScript will not catch a future edit that adds a 5th destination to `CROSSROAD_HREFS` (e.g. a new case-study page) without a matching `CROSSROAD_META` entry — the new item would just silently disappear from the homepage crossroad, no compiler error, no runtime warning.
- **Root cause**: the two collections were introduced together and have stayed in sync by discipline, not by a type-level guarantee.
- **Impact**: A silent, easy-to-miss content bug (a missing homepage row) the next time the crossroad is extended.
- **Fix sketch**: Tighten the annotation in `meta.tsx:19` to `Record<(typeof CROSSROAD_HREFS)[number], CrossroadMeta>`. TypeScript then requires (and rejects extra/misspelled keys for) exactly the four hrefs, so a future addition to `CROSSROAD_HREFS` fails to compile until `CROSSROAD_META` is updated too.

## 4. BrandLanding hand-rolls an eyebrow label instead of reusing the shared `Eyebrow`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/brand/BrandLanding.tsx:191-198`
- **Scenario**: The Proof section's label is styled by hand — `<p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-accent">{t("proofLabel")}</p>` (`BrandLanding.tsx:193-195`) — instead of using the shared `Eyebrow` component from `@/components/ui` (`src/components/ui.tsx:15-22`). One section later on the very same page, `Crossroad.tsx:37` uses that shared component for its own label: `<Eyebrow>{t("eyebrow")}</Eyebrow>`. The two renders look almost, but not quite, the same: `Eyebrow` prepends a short brand-colored rule (`<span className="h-px w-6 bg-brand-400" />`) that BrandLanding's inline version lacks.
- **Root cause**: `BrandLanding.tsx` only imports `Container` from `@/components/ui` (line 3); `Eyebrow` was never pulled in, so equivalent-but-not-identical styling was inlined instead.
- **Impact**: Visually inconsistent eyebrow treatment between two adjacent homepage sections, plus a second Tailwind class string to keep in sync if the eyebrow style ever changes.
- **Fix sketch**: Add `Eyebrow` to the existing `@/components/ui` import in `BrandLanding.tsx:3` and replace lines 193-195 with `<Eyebrow>{t("proofLabel")}</Eyebrow>`.

## 5. Dead default props on the marketing chart leaf components

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/components/marketing/charts/VisibilityGauge.tsx:8-16`
- **Scenario**: `VisibilityGauge`'s three props all declare defaults — `value = 67`, `caption = "viditelnost"`, `label = "Map-pack visibility"` (`VisibilityGauge.tsx:9-11`) — but its only call site, `LocalSeoShowcase.tsx:206` (`<VisibilityGauge value={67} caption={c.visCaption} label={c.visTitle} />`), passes all three explicitly, so none of the defaults is ever read. The same shape recurs next door: `RankClimbChart`'s sole prop `label` (default `"You vs. top rival — map-pack rank"`, `RankClimbChart.tsx:31`) is likewise always overridden by the same caller (`LocalSeoShowcase.tsx:200`).
- **Root cause**: both components were written as if standalone/reusable (sensible fallback values), but in practice each has exactly one call site that fully specifies its props.
- **Impact**: Low and harmless at runtime, but the unreachable literals read as "this prop is optional with a sane fallback" when it never actually is — a future contributor could edit the dead default (e.g. trying to change the visibility target) and see no effect, wasting time chasing a no-op.
- **Fix sketch**: Make `value`, `caption`, `label` required on `VisibilityGauge` (drop the `= 67` / `= "viditelnost"` / `= "Map-pack visibility"` defaults at `VisibilityGauge.tsx:9-11`) and make `label` required on `RankClimbChart` (`RankClimbChart.tsx:31`), since both already have exactly one, fully-specified caller. If a standalone-usage fallback is wanted on purpose, leave a one-line comment saying so instead.
