# Feature Scout — Performance Dataset & Seed (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/data/performance.json, scripts/generate-data.mjs

## 1. Inject deterministic "story events" into the series and record them in an event calendar
- **Impact**: 8/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: none
- **Category**: feature
- **File**: `scripts/generate-data.mjs:60-93`
- **Opportunity**: The generator emits only smooth jittered data (±6–10 %), so the downstream anomaly engine is starved: with a z≥2.5 threshold, the `outage` kind (observed ≤ 10 % of expected) can mathematically never fire against the `Math.max(300, …)`/`Math.max(1, …)` floors, and `goal-breach` almost never fires since late-series PNO (~13.5 %) sits under the 15 % goal. `detectAnomalies`, `anomalyImpact` ("dopad ≈ −X tis. Kč") and the AI-analysis "Významné události" prompt block (src/lib/snapshot.ts:120-133) are effectively dead UI in the shipped demo.
- **Why valuable**: The anomaly detector + money-impact headline are the engine's most quotable outputs and the AI analyst's best material; a case study that demos "we catch outages and cost runaways" needs at least one of each to exist.
- **Build sketch**: Add an `EVENTS` table to the generator (e.g. Black Friday spike, one-day measurement outage with visits/conversions ≈ 0, a weekend cost-runaway, a "spuštění PMax" milestone), applied as deterministic per-day multipliers inside the daily loop (same seeded `rnd`, dated relative to `AS_OF`), and emit them as an optional top-level `events: [{date, label, kind}]` in the JSON + optional `events?` on `PerformanceData` (house convention: optional fields + graceful fallback). Re-run `npm run seed` and `seed:check`; anomalies/impact/AI blocks light up with zero engine changes. Follow-up step (separate wave): annotate events on the dashboard trend chart, which would be [CLIENT].

## 2. Ship a mid-month as-of (`--as-of` flag) so the month-end forecast actually forecasts
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 4/10
- **Flags**: none
- **Category**: functionality
- **File**: `scripts/generate-data.mjs:45`
- **Opportunity**: `AS_OF = "2026-05-31"` ends the series on a month boundary, so `monthlyPacing` always returns `complete: true` — the GoalPacing card's flagship machinery (seasonality-weighted projection, P10–P90 band, "šance na splnění", today's-plan marker, `probabilityReliable` settling state) is permanently stuck in the degenerate "měsíc dokončen / Hotovo" state, and the snapshot prompt's pacing block (gated on `!pacing.complete`) never reaches the AI. The dataset also reads "k 31. 5. 2026" — already a month stale.
- **Why valuable**: An entire built-and-polished forecast feature is invisible to every visitor; a partial current month is also what a real agency dashboard shows, making the demo both livelier and fresher.
- **Build sketch**: Add a validated `--as-of YYYY-MM-DD` CLI arg (default moves to ~day 20 of the month after the last complete month, e.g. `2026-06-20`, `DAYS` extended to keep the two-year depth) and re-seed. The old "partial month would dip the chart" objection is already solved downstream: `bucketize` flags `partial: true` buckets and `evaluatePeriod` reports `truncated`. Verify no e2e/date-pinned assertion breaks; document the monthly one-command refresh in the script header. Orthogonal to the open "config-driven demo engine" follow-up (no client/growth/channel config lifted).

## 3. Add a year-over-year comparison mode — the two-year depth exists exactly for this
- **Impact**: 7/10
- **Effort**: 5/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `scripts/generate-data.mjs:42`
- **Opportunity**: The series is deliberately 730 days with strong baked-in seasonality (`SEASON` swings 0.82→1.30), yet the engine only compares adjacent equal-length windows: a 90d window ending in December reads +30–40 % "improvement" over Sep–Nov that is pure Christmas seasonality the generator itself encoded. The like-for-like comparison the data was sized for ("every period has an equal-length comparison window before it") is never offered as "vs. stejné období loni".
- **Why valuable**: Marketers' first question about a seasonal e-shop is YoY, not previous-period; the current deltas systematically overstate (or understate) agency performance around seasonal boundaries, which a savvy reviewer will spot.
- **Build sketch**: Extend `evaluatePeriod(daily, days)` with an optional compare mode (`"previous" | "yoy"`) that slices the same window 365 days earlier for `previous`/`comparePoints` — totals, deltas, significance and the chart overlay all flow through the existing `PeriodResult` unchanged; `channelRowsCompared` reuses the two Totals. Surface as a small toggle next to the period picker in `DashboardClient.tsx` (hence [CLIENT]; run a full `next build`). Skip YoY for the 12m period (window equals the whole prior year already).

## 4. Reconcile the keyless sample campaigns with the dashboard dataset via a shared demo core
- **Impact**: 6/10
- **Effort**: 5/10
- **Risk**: 3/10
- **Flags**: none
- **Category**: integration
- **File**: `src/lib/campaigns/sample.ts:44-59` (vs `scripts/generate-data.mjs:100-108`)
- **Opportunity**: Both surfaces claim to describe Mionelo, but the keyless-mode sample campaigns tune per-campaign impressions/CTR/CPC/AOV independently of performance.json, so campaign cost/revenue totals bear no relation to the dashboard's Google channel shares (Google Ads Search+PMax 33 % + Nákupy 16 % of cost). The seeded PRNG (`mulberry32`) is also copy-pasted three times (generate-data.mjs:24, campaigns/sample.ts:24, keywords/sample.ts).
- **Why valuable**: A prospect clicking from the dashboard to the campaign console sees two contradictory versions of the same client — the exact "internal consistency" promise this context sells (revenue = conversions × AOV everywhere) breaks at the first cross-page check.
- **Build sketch**: Extract `mulberry32` + `hashStr` into a shared pure module (e.g. `src/lib/demo/prng.ts`) consumed by all three generators. In `campaigns/sample.ts`, derive period budget envelopes from `performance`: Σ campaign cost/conversionValue over each `CampaignPeriod` scales to the dashboard's same-window totals × the Google channels' cost/revenue shares (channels data is already in `performance.channels`), keeping the per-campaign Spec ratios as relative weights. Not gate-hashed; assert reconciliation in a `test-unit/` test per house convention.

## 5. Add impressions + clicks to the daily series to unlock CTR/CPC KPIs
- **Impact**: 6/10
- **Effort**: 4/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: feature
- **File**: `scripts/generate-data.mjs:86-92`
- **Opportunity**: `DailyPoint` carries only visits/cost/conversions/revenue, so the dashboard and AI grounding cannot speak CPC ("cena za proklik") or CTR — the first two levers any PPC-focused reviewer looks for. The vocabulary already exists everywhere else: the sample campaigns model `impr/ctr/cpc` per campaign, and the Google Ads sync world returns them; the headline dataset is the odd one out.
- **Why valuable**: CPC-down-while-conversions-up is the classic agency proof-point that the current metric set can't express; it also deepens the AI analyst's grounding with standard, expected KPIs.
- **Build sketch**: In the daily loop, derive `clicks` as the paid share of visits (1 − organic visit share, ~0.78) with small jitter and `impressions = clicks / ctr` where CTR improves gently with `t` (consistent by construction, like revenue/cost). Add both as OPTIONAL fields on `DailyPoint` with graceful fallback (harness convention), extend `totalsOf`/`dailyValue`/`meta.ts` with derived `ctr`/`cpc` only when the fields are present, and add KPI tiles in a later step. Re-seed + `seed:check`; no gate-hashed file involved.
