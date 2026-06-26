# Metrics Analytics Engine — Ambiguity + Business scan
> Context: pure analytics layer turning the daily series into totals, equal-length period comparisons, chart buckets, channel rows + metric metadata.
> Files analyzed: 11 (listed `src/lib/metrics.ts` no longer exists — it was split into `src/lib/metrics/*`: index, ratios, totals, series, channels, meta, seasonality, pacing, anomalies, snapshot; plus `data.ts`, `types.ts`, and adjacent `format.ts`)
> Total findings: 5

> Note on the data: the shipped seed (`src/data/performance.json`) is hand-tuned to exactly **730 daily points, 2024-06-01 → 2026-05-31, goals.pno = 0.15, monthlyRevenue = 1 600 000**. Several numeric edge cases below are therefore currently *dormant* because the dataset happens to land exactly on their boundaries — which is itself the hidden assumption worth surfacing.

## 1. Undocumented dataset invariants silently redefine what "12 měsíců" and the monthly chart mean
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: M
- **File**: src/lib/metrics/series.ts:83 (and series.ts:120-136)
- **Problem/Opportunity**: `evaluatePeriod` caps the window to `Math.min(days, Math.floor(n/2))` so current and comparison windows stay equal length, but the returned `PeriodResult` keeps the period's `label` ("12 měsíců", series.ts:18-23) with **no field reporting the actual span used**. Separately, `bucketize` (series.ts:120-136) emits a bucket per calendar month including partial edge months, with no "partial" flag. Both are masked today only because the seed is exactly 730 days (12m sits exactly at 365 = 730/2) and starts/ends on clean month boundaries — so the 365-day window splits perfectly and every month bucket is complete.
- **Why it matters**: `npm run seed` with a different `meta.days`/`asOf` silently turns "12 měsíců" into a 6-month-vs-6-month delta, or renders a half-finished month as a full bar that looks like a revenue collapse — and the KPI cards + AI grounding (which consume this) have no way to detect the divergence.
- **Fix sketch**: Add `actualDays`/`truncated` to `PeriodResult` and a `partial: boolean` to `Bucket` (set when a month's day-count < its calendar length); render a hint in the UI when truncated/partial. Not gate-triggering (no hashed LLM file touched). Optionally assert the invariants in the seed script.

## 2. The "dopad ≈ −X Kč" anomaly-impact headline mixes windfalls with losses and ignores conversions
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/lib/metrics/anomalies.ts:116-130
- **Problem/Opportunity**: `anomalyImpact` sums `observed − expected` across **all** revenue and cost anomalies — including positive revenue **spikes** (anomalies.ts:69) — so a good windfall day partially cancels a bad outage day inside the same "this cost us" figure, understating the real damage. Anomalous days in `conversions`/`visits` carry **zero** money effect even when they are the root cause, and `net = revenue − cost` (anomalies.ts:129) blends two semantically different things into one number with only a comment to explain the sign convention.
- **Why it matters**: This single Kč figure is the engine's most quotable output (the comment itself sells "3 upozornění → dopad ≈ −85 tis. Kč") and it feeds the AI grounding and any client-facing narrative — a number that silently nets out windfalls is misleading.
- **Fix sketch**: Split into `lost`/`gained` (only negative revenue deviations and positive cost deviations count as "impact"), or filter to `kind` ∈ {drop, outage} for the loss headline; optionally money-weight conversion anomalies via period AOV. Pure-function change in anomalies.ts — not gate-triggering.

## 3. Significance + the family of magic thresholds are undocumented and internally inconsistent
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/lib/metrics/series.ts:56-74 (also 49-52, 89-108)
- **Problem/Opportunity**: Answers the brief's "why these thresholds?". `meanVar` uses **population** variance (÷n, series.ts:60) while the comment calls it "Welch-style ≈ p < 0.05" (series.ts:64-65) and applies fixed `z≥2`/`z≥1` cutoffs (series.ts:73) — a normal-approx z-test on as few as 7 daily points oversells "p < 0.05". Worse, for ratio metrics the `delta` is computed from the **ratio of sums** (`rel(c.pno, p.pno)`, series.ts:94-97) while `significance` is computed from the **mean of per-day ratios** (`dailyValue`, series.ts:49-52) — two different definitions of the same metric, so a large delta can read "noise" and vice-versa. The same undocumented-constant pattern recurs: anomaly `window=28`/`z=2.5` (anomalies.ts:40-41), outage `≤10%` (anomalies.ts:68), pacing `z90=1.2816` (pacing.ts:84), sigma window `56` and weekday window `84` (seasonality.ts:12,38) — none cite a rationale.
- **Why it matters**: Significance badges and anomaly flags drive what the dashboard tells a client is "real"; inconsistent definitions and unjustified cutoffs erode trust and are impossible to tune or defend later.
- **Fix sketch**: Use sample variance (÷(n−1)) or document the choice; align ratio `delta` and `significance` on one definition; lift the constants into a documented `THRESHOLDS` block with one-line rationale each. Pure-math edits, not gate-triggering.

## 4. PNO-vs-goal is computed throughout but never surfaced as a status — the agency's core promise
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/metrics/snapshot.ts:46,62-63 (goal usage: anomalies.ts:75-89; meta: meta.ts:99-111,154-160)
- **Problem/Opportunity**: `goals.pno` (0.15) is threaded through the snapshot and `MetricsSnapshot.goals`, yet it is consumed **only** by the anomaly goal-breach branch (anomalies.ts:75-89). PNO is a HEADLINE KPI (meta.ts:154-160) with `goodDirection: "down"`, but the engine exposes no "PNO vs cíl" status — the one number an e-commerce client and the managing agency actually steer by.
- **Why it matters**: "Are we under target PNO this period?" is the headline question a marketing case study should answer at a glance; the data is already in the snapshot, so the gap is purely presentational and high-signal.
- **Fix sketch**: Add a tiny derived field to the snapshot (e.g. `pnoStatus: { goal, actual, delta, met }` from `current.pno` vs `goals.pno`) for a KPI badge / chart reference line on the PNO trend (RATIO_METRICS already zooms its axis). Pure addition in snapshot.ts — not gate-triggering.

## 5. The versioned MetricsSnapshot is built for export/AI but stops at an in-memory object
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: src/lib/metrics/snapshot.ts:13-15,50-66
- **Problem/Opportunity**: `buildMetricsSnapshot` already composes one reconciled, **serialisable, `schemaVersion`-stamped** artefact and the comments explicitly anticipate "any future export" and "any future `/api/snapshot` consumer" (snapshot.ts:4,14-15) — but nothing consumes it as a deliverable, and `SNAPSHOT_SCHEMA_VERSION` is declared yet never validated anywhere. A scheduled cs-CZ client report (PDF/email) anchored on the period totals, the PNO-vs-goal status (#4) and the anomaly-impact money headline (#2) is a natural, differentiating agency deliverable that the data layer is already shaped for.
- **Why it matters**: It demonstrates end-to-end product thinking (raw data → reconciled snapshot → client-ready artefact) rather than just an on-screen dashboard — strong for a portfolio piece.
- **Fix sketch**: Add a thin renderer over the existing snapshot (reuse `format.ts` for cs-CZ output) plus a guard that rejects a snapshot whose `schemaVersion` ≠ `SNAPSHOT_SCHEMA_VERSION`. **Caveat: monetization here is hypothetical for a portfolio app** — frame as a demo deliverable, not a revenue line. Not gate-triggering (no hashed LLM file).
