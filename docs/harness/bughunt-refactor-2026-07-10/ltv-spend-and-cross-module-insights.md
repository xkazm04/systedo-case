# LTV, Spend & Cross-Module Insights

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Live spend query caps at 1000 rows GLOBALLY before the per-project filter — undercounts spend or silently shows fabricated seed data

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/spend/live.ts:14`
- **Scenario**: `liveSpendForProject(projectId)` calls `listLlmTelemetrySince(sinceIso, 1000)` (`src/lib/llm/telemetry.ts:90`), which queries the whole `llmTelemetry` collection with only a `where("at", ">=", sinceIso)` predicate, `orderBy("at","desc")`, `limit(1000)` — **no projectId filter at the datastore**. The projectId filter is then applied *in memory* by `telemetryToSpend` (`src/lib/spend/aggregate.ts:18`). In any workspace where all projects/users combined produced more than 1000 telemetry rows in the 60-day window, the query returns only the 1000 most-recent *global* rows; a given project's calls that are older than those 1000 are never fetched. `spotreba/page.tsx:16` then does `const isLive = live.length > 0; entries = isLive ? live : spendForProject(project)` — so a project whose rows fell outside the global top-1000 gets `live = []` and the page renders **illustrative seed spend as if it were real live data** (only the `sample` badge differs). Even for included projects, cost totals are undercounted (only the slice inside the top-1000-global window is summed).
- **Root cause**: pagination/limit is applied to a cross-tenant query before the tenant filter; the query is not scoped by `projectId` at the source, so the cap silently evicts one project's data based on other projects' volume.
- **Impact**: wrong money/cost numbers on the Usage (Spotřeba) module, and — worse — a busy project can be shown fabricated seed spend labelled as real, a trust/correctness failure that scales with adoption.
- **Fix sketch**: push the project scope into the query — add `projectId` as a stored field on telemetry docs and `.where("projectId","==",id)` in `listLlmTelemetrySince` (accept an optional filter arg), so the 1000-row cap applies per-project; or page through until the project's rows are exhausted. Also surface a "results truncated" flag rather than silently degrading `isLive` to seed.

## 2. English "seasonal peak" recommendation renders a Czech month label (`Bře`, `Kvě`…)

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/insights/aggregate.ts:136`
- **Scenario**: `eshopRecs` builds the seasonality rec from `monthlySeasonality(data.daily)`, whose `label` is taken from the hardcoded Czech array `MONTHS_CS = ["Led","Úno","Bře",…]` (`src/lib/inventory/compute.ts:9,30`). The recommendation title interpolates `next.label` into both branches: on `locale === "en"` it renders `` `${next.label} is a seasonal peak` `` → e.g. **"Bře is a seasonal peak"**. Every other string in this file is correctly branched on `locale`; this one leaks Czech because the label comes pre-baked from the seasonality helper. Reachable live on the Overview command center for any eshop project viewed in English (`ProjectOverview.tsx:207/339` thread `locale` through correctly, so the surrounding sentence is English).
- **Root cause**: `monthlySeasonality` returns a display-ready Czech label instead of a locale-neutral month index, and the consumer trusts it as already-localized.
- **Impact**: user-visible mixed-language string in a customer-facing recommendation card — the exact class of "reads as a rendering bug" the file's own comment (line 53-54) warns against, identical in spirit to (but a distinct instance from) the prior report's fixed `moduleLabel` bug.
- **Fix sketch**: have `monthlySeasonality` return `month: i` (already present) and let the consumer resolve the label via a locale-aware month formatter (`createFormatters(locale)` / `Intl`) using `next.month`; drop the reliance on the Czech-only `MONTHS_CS` string in i18n'd surfaces.

## 3. `telemetryToSpend` yields `NaN` `daysAgo` on an unparseable timestamp, silently dropping the row from every windowed view

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/spend/aggregate.ts:26`
- **Scenario**: `daysAgo: Math.max(0, Math.floor((nowMs - Date.parse(e.at)) / DAY_MS))`. If `e.at` is missing/malformed, `Date.parse` returns `NaN`, so `daysAgo` becomes `Math.max(0, Math.floor(NaN)) = NaN`. Downstream, `filterSpend` (`src/lib/spend/compute.ts:16`) keeps rows via `e.daysAgo <= windowDays` — and any comparison with `NaN` is `false`, so the row vanishes from the default 30-day and 7-day windows (it only survives the "All" window where `windowDays === 0` short-circuits the filter). The cost of that call is silently excluded from the tiles/rollups with no error.
- **Root cause**: the date is trusted to be a valid ISO string; there is no validation or fallback, and `NaN` propagates into a truthy-looking numeric field that then fails every range filter silently.
- **Impact**: under-reported spend/cost whenever a single telemetry doc has a bad `at` (legacy/hand-written/partial write), with no signal that a row was dropped.
- **Fix sketch**: guard the parse — `const t = Date.parse(e.at); const daysAgo = Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / DAY_MS)) : 0;` (fold into the current window so it is counted, not silently discarded), or filter out unparseable rows explicitly and log them.

## 4. `tailRatio` / `survivalCurve` propagate `NaN` LTV for an empty or terminally-zero retention curve

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/ltv/compute.ts:72`
- **Scenario**: `tailRatio` computes `retention[n-1]! / retention[n-2]!` with no zero-denominator guard. For a real cohort whose last two observed months are both `0` (a fully churned early cohort — plausible once the documented live seam is wired to Segment/PostHog/Stripe), this is `0/0 = NaN`; `Math.min(0.98, Math.max(0.8, NaN))` stays `NaN`, so `survivalCurve` pushes `last *= NaN` → a `NaN` tail → `ltvOf` returns `NaN` → the cohort's `ltv`, `ltvCac`, and the blended `ltvProjection`/`ltvSummary` all become `NaN`. Separately, an **empty** `retention: []` makes `last = retention[-1] = undefined`, and the extrapolation loop pushes `undefined * ratio = NaN` for the whole horizon. The sample data never triggers this (retention always starts at `1` and stays positive), so it is invisible until live data arrives.
- **Root cause**: the extrapolation assumes retention is non-empty and strictly positive; neither the empty-array nor the zero-denominator case is guarded, and `NaN` flows unchecked into money figures.
- **Impact**: `NaN` CAC/LTV/payback cells and a `NaN`-poisoned blended projection once cohorts come from real analytics — no crash, just silently broken numbers on the LTV module and any Overview LTV recommendation.
- **Fix sketch**: in `tailRatio`, return the `0.9` default when `n < 2` **or** `retention[n-2]` is `0`/non-finite; in `survivalCurve`, early-return `[]` (or a zero-filled horizon) when `retention.length === 0`. Add a unit case for `retention: [1, 0.3, 0]` and `retention: []`.

## 5. `ltvProjection` recomputes `withMetrics` over every cohort just to read `paidCac`, which callers already computed

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: structure
- **File**: `src/lib/ltv/compute.ts:197`
- **Scenario**: `ltvProjection` calls `ltvSummary(cohorts)` solely to pull `.paidCac` (line 197); `ltvSummary` internally does `cohorts.map((c) => withMetrics(c))` (line 337), an O(cohorts × horizon) pass. But `app/app/[projectId]/ltv/page.tsx:19-20` already calls `cohorts.map(withMetrics)` for the table **and** `ltvSummary(cohorts)` for the summary, while `LtvProjectionPanel.tsx:88` calls `ltvProjection(cohorts, horizon)` — so `withMetrics` runs over the same cohorts 3× per render, and `ltvSummary` runs twice. This is a distinct observation from the prior report's items (dead sparkline / csvCell / colors / quick-win predicate); it is about redundant recomputation of the cohort metrics, not duplication of a literal.
- **Root cause**: `ltvProjection` re-derives `paidCac` through the full `ltvSummary`/`withMetrics` pipeline instead of accepting the already-computed rows (or a precomputed `paidCac`) from its caller.
- **Impact**: purely wasted compute today (small cohort counts), but it couples the projection to a heavyweight summary pass and invites the same recomputation to grow as horizons/cohorts scale.
- **Fix sketch**: factor a `paidCacOf(cohorts)` (or accept a `rows: CohortMetrics[]` argument) so `ltvProjection`, `ltvSummary`, and the page share one `cohorts.map(withMetrics)` result; the page passes the memoized rows down rather than each function re-mapping.
