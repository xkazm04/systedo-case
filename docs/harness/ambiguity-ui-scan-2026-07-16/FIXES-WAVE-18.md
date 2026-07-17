# Fixes — Wave 18 (Finance/LTV UI, cost model & profit analytics, LTV/spend/insights)

Module-clustered tail wave over the finance/LTV surface: `finance-ltv-profit-ui.md`
(#2 High, #3/#4/#5 Med), `cost-model-profit.md` (#2–#5 Med), `ltv-spend-insights.md`
(#2–#5 Med). 1 High + 11 Medium = **12 findings, all fixed**. Earlier waves closed
finance #1 (CZK currency label — already `currencyUnit: "Kč"` in EN), cost-model #1
(hold-revenue, High), ltv-spend #1 (Overview reads resolved cohorts) — verified in
place, not re-touched.

## Commits

| Commit | Finding | Scope |
| --- | --- | --- |
| `20dbcca` | finance #2 (High) | ltv projection: "Auto" resting churn readout |
| `093009b` | finance #3 | competitors: enforce max-8 on names, not slots |
| `e855578` | finance #4 | report: confirm + error-surface the two deletes |
| `63875ae` | finance #5 | ltv: cohortTrend returns relative %s, drop rows[0] |
| `501736d` | cost-model #2 | cost-model: omit loaded break-even vs. leak Infinity |
| `03f2c9b` | cost-model #3 | cost-model: reject invalid overhead/per-order (no coerce-to-0) |
| `816df32` | cost-model #4 | cost-model store: single writer of updatedAt |
| `149f9ef` | cost-model #5 | profit trend: flag leading partial bucket + chart drops it |
| `f9a02db` | ltv-spend #2 | ltv: survivalCurve empty-retention guard (no NaN) |
| `4a8025a` | ltv-spend #3 | ltv: surface minObservedMonths + "partly modeled" caption |
| `1e979d0` | ltv-spend #4 | ltv: avgLtvCac signup-weighted blend |
| `a69401d` | ltv-spend #5 | insights: rec() def-guard vs. Overview-wide crash |

## Narratives

- **finance #2 (High)** — The resting "Monthly churn X%" readout was a back-projection
  of the expected LTV's *position inside the low..high band* mapped onto the ratio range
  — no churn semantics. The auto expected line uses each cohort's own decay (no single
  ratio exists), so the readout now shows **"Auto"** until the slider is engaged, then
  the real override. UI-only; the slider thumb still rests at the (now cosmetic) implied
  position.
- **finance #3** — `setAt` sliced to `9` ("8 names + 1 blank"); a filled 9th slot posted
  9 competitors past the "max 8" copy. Extracted `MAX_COMPETITORS = 8`, cap *names*
  (drop the trailing blank at the cap), slice Save's payload, and derive the hint from
  the constant.
- **finance #4** — Both deletes destroyed saved config on one click and ignored the
  response (a failed DELETE just `router.refresh()`ed → silent no-op). Added a two-step
  confirm (matching the unlink-live-data flow) and `res.ok` checks reusing each editor's
  `t("failed")` slot; Save's clear-to-empty path deletes directly.
- **finance #5** — The trend subtitle divided `cohortTrend`'s absolute deltas by
  `rows[0].cac`/`rows[0].ltv` — a hidden ordering contract. `cohortTrend` now returns
  `cacDeltaPct`/`ltvDeltaPct` against its own oldest endpoint (null when the base is 0);
  the view reads those. Dropped `fmtSignedPctSafe` + the `rows[0]!` indexing.
- **cost-model #2** — `deriveBreakEven` emitted `loadedRoas/loadedPno = Infinity` when
  the reference window had overhead but zero ad spend. `JSON.stringify(Infinity)` is
  `null`, breaking the `number` contract. Now omits both optional fields on a non-finite
  loaded value; documented the JSON-boundary rule on the gross primitives.
- **cost-model #3** — `sanitizeCostModel` rejected a bad margin but silently coerced a
  non-finite/negative overhead or per-order cost to `0` — a rosier "true net profit"
  omitting real overhead. Now one uniform reject-don't-coerce policy (route can 400);
  documented accepted ranges incl. both boundaries.
- **cost-model #4** — Save wrote the store's `new Date()` into the `updated_at` column
  while the blob carried a caller-synthesized `updatedAt` (two parallel, undocumented,
  divergable timestamps). `saveCostModel` now takes `Omit<CostModel,"updatedAt">`,
  stamps once, writes the same value into blob **and** column; route passes `clean`.
- **cost-model #5** — Only the trailing partial month was flagged incomplete; the
  leading bucket (oldest fixed weekly window truncating at series START, or a first
  calendar month not starting on the 1st) plotted as full → an artificial near-zero
  cliff. `profitTrend` now flags the leading bucket `complete: false` when short, and
  `TrendPanel` plots only complete buckets (falls back to the full series if <2 remain).
- **ltv-spend #2** — `survivalCurve` dereferenced `retention[n-1]!`; a `retention: []`
  cohort made every extrapolated month NaN, poisoning ltv/ltvCac/sparklines into
  "NaN Kč". Early-return `[]` on empty retention → metrics degrade to zero.
- **ltv-spend #3** — The trend badge declared improving/worsening from horizon LTV:CAC
  that is mostly extrapolation for a short-history cohort (can flip sign from the clamp
  alone). `cohortTrend` now returns `minObservedMonths`; the LTV module captions the
  trend "partly modeled — only N of 12 mo. observed" when below the horizon.
- **ltv-spend #4** — `avgLtvCac` was an unweighted mean of per-cohort ratios while every
  sibling blend is signup-weighted, so a tiny cohort could flip the "≥ 3×" verdict and
  the Overview alert severity. Now blended LTV per user / blended paid CAC, consistent
  with `ltvProjection`.
- **ltv-spend #5** — `rec()`'s `MODULES.find(...)!` threw inside `moduleLabel` before the
  `?? module` fallback, so one renamed module key error-paged every project Overview.
  Now looks up the def first and falls back to the raw key.

## Verification

- `npx tsc --noEmit` clean before every commit (and via the pre-commit hook).
- **`npm run test:unit`: 1737 pass / 0 fail** (baseline 1730; **+7 new test cases**).
- New/extended tests: `deriveBreakEven` no-ad-spend JSON-safe; `sanitize` rejects
  negative/non-finite costs + accepts 100% margin; store stamps `updatedAt`;
  `profitTrend` partial-leading weekly + monthly; `survivalCurve` empty-retention;
  `cohortTrend` relative %s + null-base + `minObservedMonths`; `avgLtvCac` weighted
  blend + not-a-mean.
- LLM contract golden snapshots unchanged; no `--no-verify`, no dep/CI changes.
- Untracked `uat/driver/*.mjs` left untouched.

## Behavior changes needing sign-off

1. **cost-model #3** — Invalid `monthlyOverhead`/`perOrderCost` (negative, or a
   non-numeric string like `"45 000"`) now **400s** instead of silently saving `0`. The
   editor inputs are `type=number` so this rarely fires in the happy path, but a
   malformed client payload is now rejected rather than persisted.
2. **cost-model #4** — `saveCostModel` no longer honors a caller-supplied `updatedAt`;
   it always stamps `now`. `duplicate-cascade` therefore re-stamps a duplicated model's
   `updatedAt` to copy time (previously it carried the source's). Considered more correct
   (a copy is a new edit), but flag it.
3. **ltv-spend #4** — `avgLtvCac` values shift (signup-weighted vs. mean). The headline
   LTV:CAC tile and the Overview "LTV:CAC below target" alert (fires < 3×, critical < 1×)
   can now cross the threshold differently for datasets with small anomalous cohorts.
   This is the intended honesty fix but it moves a client-facing number.
4. **cost-model #5 / finance #2 / ltv-spend #3** — Visible UI changes: profit sparklines
   drop the partial leading/trailing bucket; the churn readout shows "Auto" at rest; the
   cohort trend gains a "partly modeled" caption. Cosmetic/honesty, no data change.

## Partially addressed (deferred sub-points, with reason)

- **ltv-spend #5** — Fixed the crash (the substantive issue). The sketch's compile-time
  typing (`module: (typeof MODULES)[number]["key"]`) is **not achievable** without
  restructuring `MODULES` (its `key` is typed `string`, not a const union) — out of
  scope for a Medium. The `id = ${module}:${localizedTitle}` locale-instability is also
  left: there is no locale-stable slug available at the `rec()` call sites, and no
  dismissal/dedupe state keys on `id` yet. No test added — `rec()` is not exported and
  every current call site uses a valid key, so the drift path is unreachable in-suite.

## Patterns

- `.map(withMetrics)` in tests silently passes the array index as the `horizon` arg
  (`withMetrics(c, horizon)`) → first cohort gets horizon 0 → `ltv: 0`. Always
  `.map((c) => withMetrics(c))`, exactly as `ltvSummary` does internally.
- Two findings sharing a file (cost-model #2/#3 in `compute.ts`): revert one hunk,
  commit the other, reapply — keeps atomic-per-finding without interactive `git add -p`
  (blocked here).
- `git add -A` will sweep the untracked `uat/driver/*.mjs`; stage explicit paths only.
