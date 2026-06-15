# Feature + Moonshot Scan — Performance Dataset & Seed

> Context: ctx_1781547850490_32bksvy
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Per-channel daily series instead of static fractional shares

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `scripts/generate-data.mjs:92-113` (`channels` array) + `src/lib/metrics.ts:259-281` (`channelRows`)
- **Scenario**: Today channels are a single fixed split (`visit/cost/conv/rev` shares) applied uniformly to whatever period is selected (`channelRows` multiplies the period totals by a constant share). That means every channel's PNO/ROAS/CR is *identical in every period*, never moves over time, and shows no seasonality — a marketer reading the case study immediately notices Heureka and Meta have suspiciously frozen efficiency, which undercuts the "real account" story.
- **Opportunity**: Generate a true per-channel daily series in the seed: give each channel its own base trajectory, seasonality response, and maturation curve (e.g. Meta prospecting CR drifts, Google Nákupy scales with the shopping season, organic grows as brand awareness compounds). Persist `daily` per channel (or a `byChannel` map keyed by date), keep the *sum* reconciling to the existing headline `daily` so nothing else breaks.
- **Impact**: Unlocks per-channel trend charts, channel-level period deltas, and "which channel improved/regressed" narratives — the single most credibility-defining upgrade for a marketing case study, and it feeds the AI snapshot (`snapshot.ts:57-62`) much richer material to reason about.
- **Implementation sketch**: In `generate-data.mjs`, replace the flat `shares` block with a `CHANNELS` config carrying per-channel `{visitsBase, crBase, aovBase, pnoBase, seasonResponse, trend}`; inside the day loop compute each channel's row, push to a `channelDaily` array, and rescale the global `daily` to equal the channel sum (preserving the internal-consistency invariant from lines 5-9). Extend `PerformanceData.channels` in `types.ts` with an optional `daily?: DailyPoint[]`, and add a `channelTotals(channel, days)` helper in `metrics.ts` that prefers real series over the share projection.

## 2. Inject realistic events & anomalies (campaigns, outages, Black Friday, tracking gaps)

- **Severity**: High
- **Lens**: feature-scout
- **Category**: feature
- **Effort**: M (1-3d)
- **File**: `scripts/generate-data.mjs:57-90` (day loop) + new `events` array in `dataset` (lines 115-139)
- **Scenario**: The series is monotonically smooth — visits grow ~70%, CR creeps up, PNO falls — with only ±10% jitter (`jitter(0.1)`). There is no Black Friday spike, no tracking outage, no budget-cap plateau, no promo-driven AOV jump. A performance dashboard whose chart never has a *story beat* looks synthetic, and there is nothing for the AI assistant to "discover."
- **Opportunity**: Add a declarative `EVENTS` table to the seed (date range, type, magnitude, channel scope) — e.g. `black-friday` revenue spike, `tracking-outage` conversions drop to ~0 for 2 days, `new-campaign-launch` cost step-up, `stockout` conversion dip. Apply them as multipliers in the day loop and emit a committed `events: [...]` array in the JSON so the dashboard can render annotation markers and the AI can reference them.
- **Impact**: Turns a flat line into a believable account history with cause-and-effect, and creates the raw material for anomaly-detection, annotations, and a far smarter AI analysis ("náklady vzrostly kvůli spuštění PMax 12. listopadu").
- **Implementation sketch**: Define `EVENTS` near the `SEASON` constants; in the loop look up active events for `date` and fold their multipliers into `visits`/`cr`/`aov`/`pno` before rounding. Add `events` to the `dataset` object (lines 115-139) and to `PerformanceData` in `types.ts`. Surface a thin `eventsInRange(start,end)` accessor in `metrics.ts` for the chart and `snapshotToPromptText` to consume.

## 3. Anomaly & insight detection layer over the daily series

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: automation
- **Effort**: M (1-3d)
- **File**: `src/lib/metrics.ts` (new `detectAnomalies` / `insights` near `evaluatePeriod:90`) consuming `performance.daily`
- **Scenario**: All analysis is period-vs-previous-period deltas (`evaluatePeriod`, `delta` in `PeriodResult`). There is no detection of *individual* unusual days, no "your PNO breached the 15% goal on 6 of the last 30 days," no streaks, no best/worst day. The richest signal in 730 daily points is left unused, and the AI snapshot only ever sees aggregates (`snapshot.ts:24-39`).
- **Opportunity**: Build a pure `insights(daily, goals)` function that scans the series for z-score outliers, goal breaches vs `goals.pno`, record highs/lows, and momentum streaks, returning typed `Insight[]`. Render them as an "Upozornění / Insighty" strip on the dashboard and feed the top few into the AI prompt so analysis cites concrete days.
- **Impact**: A self-explaining dashboard that surfaces the "so what" automatically — a clear power-user/credibility feature — and it composes naturally with idea #2 (events explain the anomalies it finds).
- **Implementation sketch**: Add `export interface Insight { date; metric; kind; severity; message }` and `detectInsights(daily, goals)` to `metrics.ts` (rolling mean/stddev over a trailing window, reuse `weekdayWeights` pattern at `metrics.ts:150` for seasonality-adjusted baselines). Wire results into `DashboardClient.tsx` and append the top 3 to `snapshotToPromptText` (`snapshot.ts:41`).

## 4. Pluggable data source: swap the static seed for a live ingestion seam

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: L (>3d)
- **File**: `src/lib/data.ts:1-7` (static `import dataset from "@/data/performance.json"`) + `scripts/generate-data.mjs` (becomes one provider)
- **Scenario**: The dataset is a build-time static import — `performance` is hard-bound to one committed JSON. That is perfect for a demo but is a dead end: there is no seam to point the exact same dashboard/AI/campaign surfaces at a *real* Google Ads / GA4 / Sklik account. The case study can only ever show Mionelo.
- **Opportunity**: Introduce a `PerformanceSource` interface (`getPerformance(): Promise<PerformanceData>`) with two implementations: `SeedSource` (today's JSON) and a `LiveSource` that normalizes a real GA4/Google Ads export or CSV into the same `PerformanceData` shape. The generator becomes a "synthetic provider"; everything downstream (`metrics`, `snapshot`, `gemini`) stays untouched because the contract is the typed shape in `types.ts`.
- **Impact**: Converts a one-client portfolio piece into a runnable mini-product — a prospect could drop in their own export and instantly get the dashboard + AI analysis on *their* numbers. That is the difference between "look what I built" and "try it on your account," the strongest possible moonshot for a job-application case study.
- **Implementation sketch**: Create `src/lib/sources/index.ts` exporting `getPerformance()` selecting by env (`PERF_SOURCE=seed|live`); move the current import behind `SeedSource`; add a `LiveSource` that maps a Google Ads/GA4 CSV (date, channel, cost, conversions, revenue) into `DailyPoint[]` + `ChannelShare[]`, validating each `share` dimension sums to ~1 exactly as the seed already asserts (`generate-data.mjs:108-112`). Keep `performance` export for back-compat but mark it the seed default.

## 5. Parameterized multi-account scenario engine (the seed as a fixture factory)

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: feature
- **Effort**: L (>3d)
- **File**: `scripts/generate-data.mjs` (whole file — currently hard-codes one client, seed `20260608`, one trajectory)
- **Scenario**: The generator bakes in one persona: Mionelo, 730 days, fixed growth/CR/PNO trajectories and a single channel mix. To tell a *different* story (a struggling account where PNO is rising, a B2B account with weekday peaks, a tiny startup with thin data) you would have to fork the whole script. The "reproducible fixture" idea is half-built — it has a seed but no parameters.
- **Opportunity**: Refactor the generator into a `generateDataset(profile)` function taking a scenario config: client identity, `seed`, `days`, trajectory targets (start/end CR, PNO, growth), seasonality archetype, channel-mix preset, and an `events` list (from idea #2). Ship 3-4 named scenarios ("rostoucí e-shop", "ozdravný plán", "sezónní špička") writeable to separate JSONs, letting the dashboard offer a scenario switcher — and giving any future tests a deterministic fixture factory.
- **Impact**: Turns one static dataset into a showcase of *range* — the dashboard and AI can be demoed across success, turnaround, and crisis stories from the same code, dramatically widening what the case study proves. It is also the foundation for golden-master snapshot tests of `metrics.ts`.
- **Implementation sketch**: Extract everything below the config block (`generate-data.mjs:54-160`) into `export function generateDataset(profile)`; define a `PROFILES` map and a CLI arg (`node scripts/generate-data.mjs ozdravny`) selecting one; emit to `src/data/performance.<profile>.json`. Add a `scenarios` registry the dashboard reads, and have `data.ts`/the new `PerformanceSource` (idea #4) resolve the active scenario. Keep the default profile byte-identical to today's output so the committed JSON does not drift.
