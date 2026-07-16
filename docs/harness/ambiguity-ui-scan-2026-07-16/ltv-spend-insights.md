# LTV, Spend & Cross-Module Insights — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 4 medium / 0 low)

## 1. Overview LTV rec reads the global static SAMPLE_COHORTS, not the project's resolved cohorts
- **Severity**: High
- **Lens**: ambiguity
- **Category**: cross-surface-number-mismatch
- **File**: src/lib/insights/aggregate.ts:157
- **Scenario**: An `app` project's Overview command center computes `ltvSummary(SAMPLE_COHORTS)` — the hardcoded SaaS sample — while the LTV module resolves per-project cohorts (`varyCohorts`/`cohortsForProject` exists precisely so "the /ltv page and the report read identical numbers", sample.ts:195). User opens Overview, sees "LTV:CAC pod cílem 2.1×", clicks through to /ltv and sees a different ratio.
- **Root cause**: `appRecs` was never given the threading treatment its siblings got — the same file threads `seoQueries` and `LocalRecsInput` through `collectRecommendations` exactly to avoid this class of drift, but the LTV signal still reads the module-level constant.
- **Impact**: The flagship cross-module insight can contradict the module it links to, and every app project shows the identical LTV rec regardless of its data — undermining trust in the whole command center.
- **Fix sketch**: Add `cohorts?: Cohort[] | null` to `collectRecommendations` (same pattern as `seoQueries`), have ProjectOverview thread the same resolved cohorts the /ltv page uses, default to `SAMPLE_COHORTS` for back-compat.

## 2. survivalCurve NaN-poisons everything on an empty retention array
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: unguarded-edge-case
- **File**: src/lib/ltv/compute.ts:85
- **Scenario**: A cohort arrives with `retention: []` (plausible once the documented "real-integration seam" feeds Segment/PostHog data for a brand-new month). `retention[n - 1]!` is `undefined`, `last *= ratio` yields NaN for every extrapolated month.
- **Root cause**: Non-null assertion on `retention[n-1]` assumes at least one observed month; `tailRatio` guards `n < 2` but `survivalCurve` has no `n === 0` guard.
- **Impact**: `ltv`, `ltvCac`, `paybackMonth` (never reached, so `null`), the sparkline y-coords and the blended projection all become NaN — the page renders "NaN Kč" tiles and invisible sparklines instead of failing loudly or degrading.
- **Fix sketch**: In `survivalCurve`, early-return `[]` (or a zero-filled curve) when `retention.length === 0`; add a unit test pinning the behavior.

## 3. cohortTrend compares a mostly-extrapolated newest cohort against a fully-observed oldest one
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: modeled-vs-observed-conflation
- **File**: src/lib/ltv/compute.ts:289
- **Scenario**: "Čvn 2026" has 4 observed months, so 8 of its 12 LTV months are geometric extrapolation from one clamped ratio; "Led 2026" is 6/12 observed. The trend badge declares "improving"/"worsening" from `newest.ltvCac - oldest.ltvCac` — a delta that can flip sign purely from the tail-ratio clamp, not from real behavior.
- **Root cause**: The trend consumes `CohortMetrics.ltvCac` (horizon LTV) instead of a like-for-like observed window, and nothing in `CohortTrend` records how much of each endpoint is modeled — even though the codebase elsewhere insists modeled data "should read as visually distinct" (`observedMonths` doc).
- **Impact**: A confident "worsening" arrow can be a modeling artifact of the newest cohort's short history; users may reallocate budget off noise.
- **Fix sketch**: Compare over the shared observed prefix (min `observedMonths` of the two endpoints), or surface `minObservedMonths` in `CohortTrend` so the UI can caption the trend as partly modeled.

## 4. avgLtvCac is an unweighted per-cohort mean while every other blend is signup-weighted — and it drives the Overview alert
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: inconsistent-aggregation-method
- **File**: src/lib/ltv/compute.ts:376
- **Scenario**: `ltvSummary` computes `blendedCac`/`paidCac` as spend/signup-weighted totals and `ltvProjection` signup-weights its blends, but `avgLtvCac` is a plain mean of per-cohort ratios: a 10-signup cohort moves it as much as a 300-signup one. `appRecs` then fires a "critical" recommendation when this mean drops below 3.
- **Root cause**: Ratio-of-averages vs average-of-ratios chosen implicitly, with no doc comment stating which and why — unlike the carefully documented paid-CAC fallback right above it.
- **Impact**: The headline LTV:CAC tile and the severity of the Overview alert can disagree with what blended-LTV/blended-CAC would say, and a tiny anomalous cohort can flip the "target ≥ 3×" verdict.
- **Fix sketch**: Either compute `avgLtvCac` as blended LTV / blended paid CAC (consistent with `ltvProjection`), or keep the mean but signup-weight it and document the choice on the field.

## 5. rec() crashes the whole Overview on a module-key drift despite an intended fallback
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: dead-fallback-non-null-assert
- **File**: src/lib/insights/aggregate.ts:47
- **Scenario**: `moduleLabel(MODULES.find((m) => m.key === module)!, locale) ?? module` — the `?? module` fallback signals defensive intent, but the `!` throws inside `moduleLabel` before the fallback can apply. Producers pass string literals ("zisk", "sklad-sezonnost", "kanaly", …) with no type link to `MODULES`; one renamed module key turns every project Overview into an error page.
- **Root cause**: Module keys are stringly-typed at each `rec()` call site; the non-null assertion contradicts the null-coalescing fallback (dead code).
- **Impact**: A routine module rename/removal breaks the highest-traffic page for all project types at once, instead of degrading one recommendation's label. Also: `id` is `${module}:${title}` with a localized title, so any future dismissal/dedupe state keyed on `id` silently resets on locale switch.
- **Fix sketch**: `const def = MODULES.find(...); moduleLabel: def ? moduleLabel(def, locale) : module` — and type the `module` param as `(typeof MODULES)[number]["key"]` so drift is a compile error; derive `id` from module + a locale-stable slug.
