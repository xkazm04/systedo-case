# Performance Dataset & Seed — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. The dataset never exercises the anomaly engine it was built to feed
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: scripts/generate-data.mjs (daily loop, `jitter()`) → src/lib/metrics.ts `detectAnomalies`
- **Opportunity**: `detectAnomalies` can flag spike / drop / outage / goal-breach, and `snapshotToPromptText` formats them for the AI ("Významné události v období"). But the generator only applies smooth multiplicative `jitter(0.1)` noise — it never injects a discrete cost spike, a revenue collapse, a zero-visit outage, or a PNO breach. So the most impressive analytical feature has almost nothing real to surface, and demo runs read flat.
- **Value**: Seeded, reproducible anomalies are exactly what turns a generic dashboard into "an AI that *notices things for you*" — the core differentiation and the strongest sales moment. It also de-risks the AI demo: the model gets concrete dated events to interpret instead of bland trends.
- **Effort**: S
- **Fix sketch**: After the `daily` loop, deterministically (via the same `rnd`) stamp a handful of fixtures: one Black-Friday cost spike, one tracking-outage day (`visits`/`conversions`≈0), one PNO goal-breach week. Keep them inside `AS_OF − 90d` so all periods see them, and assert in the generator that `detectAnomalies` returns them so data and detector can't drift.

## 2. No device / geo / funnel dimensions — the product can't show what an analytics tool sells
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: src/data/performance.json (`daily` = 4 flat fields) + src/lib/types.ts `DailyPoint`
- **Opportunity**: Every record is `{date, visits, cost, conversions, revenue}` and channels are static period-shares only. There is no mobile-vs-desktop split, no region, and no funnel (impressions → clicks → add-to-cart → orders). A real performance-marketing product lives on exactly these breakdowns ("mobile CR is half of desktop", "Prague over-indexes").
- **Value**: These dimensions are what let a prospect picture *their* account and what justify a premium positioning over a spreadsheet. They also unlock far richer AI narratives ("the PNO rise is mobile-only") with little extra UI.
- **Effort**: M
- **Fix sketch**: Add a `device` share dimension alongside `channels` (and optionally `funnel` ratios `ctr`/`atcRate`), generated with the same share-projection pattern as `channelRows`, so totals still reconcile. Extend `DailyPoint`/`PerformanceData` and one metrics projector; the dashboard can adopt it incrementally.

## 3. Generator is single-scenario hardcoded — no presets to retarget the demo per prospect
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: growth
- **File**: scripts/generate-data.mjs (`mulberry32(20260608)`, inline `DAYS` / `SEASON` / `channels` / `client`)
- **Opportunity**: Seed, client, vertical seasonality and channel mix are all inlined constants producing exactly one "Mionelo, Czech e-shop, agency-improves-PNO" story. There is no way to emit an alternate vertical (B2B lead-gen, services, a different country) or a "before agency / after agency" pair without editing source.
- **Value**: A scenario library turns one case study into a reusable sales-demo engine — pick the preset closest to the prospect's vertical and the whole dashboard + AI demo re-skins. That is a direct conversion lever for the agency using this app to pitch.
- **Effort**: M
- **Fix sketch**: Extract config into named `SCENARIOS` (each = seed + client + SEASON + channels + trend params) and accept `node scripts/generate-data.mjs --scenario=leadgen --out=...`. Keep the current values as the default `baby-eshop` preset so the committed JSON is unchanged.

## 4. No export of the dataset or its snapshot — dead-ends an obvious power-user/share moment
- **Severity**: Medium
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/data/performance.json consumers (src/lib/data.ts, src/app/dashboard/page.tsx); no CSV/download path exists
- **Opportunity**: The JSON is only ever statically imported; there is no "Stáhnout CSV", no `/api/snapshot`, no shareable artefact. Yet `buildMetricsSnapshot` already produces a clean, versioned `MetricsSnapshot` (`SNAPSHOT_SCHEMA_VERSION`) practically begging to be served.
- **Value**: Export/share is table-stakes credibility for an analytics product and a low-cost virality hook (a CSV or a snapshot link a prospect forwards internally). It also makes the case study feel like a tool you'd *use*, not just look at.
- **Effort**: S
- **Fix sketch**: Add a `/api/snapshot?period=` route returning the existing `MetricsSnapshot`, and a dashboard "Stáhnout CSV" button that serialises the current period's `buckets` + channel rows client-side. No new data needed — just expose what `metrics.ts` already computes.

## 5. `meta.asOf` is frozen — the "today" of the demo silently ages
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: scripts/generate-data.mjs (`AS_OF = "2026-05-31"`) → src/lib/metrics.ts `monthlyPacing` (anchors on last data point)
- **Opportunity**: The series ends on a hardcoded date and `monthlyPacing` anchors its forecast on that last point. As real calendar time passes, the demo's "current month" recedes into the past, so the live pacing/forecast band — a headline feature — describes a stale month and can look broken to a visitor in a later month.
- **Value**: A demo that always reads as "this month" keeps the pacing forecast and goal-probability features feeling live, which is the whole point of showing them. Removing the manual-reseed treadmill also lowers maintenance.
- **Effort**: S
- **Fix sketch**: Default `AS_OF` to the last completed month relative to `new Date()` (overridable via `--as-of=` for reproducible builds), and surface `meta.asOf` in the dashboard's "data k …" label so the freshness is explicit and consistent.
