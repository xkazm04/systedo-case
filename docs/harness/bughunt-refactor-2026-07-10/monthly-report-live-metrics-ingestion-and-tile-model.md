# Monthly Report: Live Metrics Ingestion & Tile Model

> Total: 5
> Critical: 0 · High: 3 · Medium: 2 · Low: 0
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

## 1. "Živá data" report splices real daily totals onto sample channel mix, goals & demo story-events

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/report-metrics/build.ts:23`
- **Scenario**: A project links Google Ads and syncs. `buildLiveDataset` builds the live `PerformanceData` as `{ ...base, daily }` where `base = getProjectDataset(project)` (the illustrative sample spine) and only `daily` is replaced by real rows. Everything else on `base` survives: `channels` (illustrative `ChannelShare` fractions), `goals` (sample `pno` / `monthlyRevenue`), `meta.asOf`, and the authored `events` calendar ("Black Friday — špička poptávky", etc.). Downstream, `buildSnapshot` → `channelRows(base.channels, totals)` (`src/lib/metrics/channels.ts:20-49`) multiplies the client's REAL total revenue/cost by sample channel proportions, so the recap's `Výkon podle kanálů` block (`src/lib/snapshot.ts:153-160`) and the goal-pacing lines emit fabricated per-channel splits and a fabricated marketing goal — all under the "Živá data · Google Ads" honesty label. The account-level Ads sync (`map.ts`) has no per-channel data at all, yet the report presents a confident channel breakdown.
- **Root cause**: The seam assumes "only the daily series is client-specific; the rest of `PerformanceData` is safely reusable structure." That is false for `channels`, `goals` and `events`, which are illustrative sample content, not neutral scaffolding.
- **Impact**: A client-facing monthly report and its AI recap present invented per-channel revenue/PNO/ROAS and demo marketing goals as the client's live reality — the exact fabrication the module's own header comments forbid.
- **Fix sketch**: In `buildLiveDataset`, neutralize the fields the sync can't substantiate: derive `channels: []` (and have `snapshot`/report tiles suppress the channel block when empty) or attach a real channel split only when the sync provides one; recompute/blank `goals` and drop `events` for live datasets. Add a `synthetic: boolean` flag on `PerformanceData.meta` so consumers can hide illustrative sub-sections under a live label.

## 2. `historyGroundingText` fabricates a "12-month / meziročně" figure on every live sync (SYNC_DAYS=400 < 730)

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/report/recap-context.ts:49`
- **Scenario**: `historyGroundingText` fires whenever `data.daily.length >= HISTORY_MIN_DAYS` (300, line 41) and calls `buildSnapshot("12m", "previous", data)`, then hardcodes the sentence "Delší horizont (12 měsíců): obrat {current.revenue} ... meziročně". Live syncs cap the window at `SYNC_DAYS = 400` (`src/lib/report-metrics/sync.ts:16`, whose comment wrongly claims "400d covers the 365d report plus its prior-year delta" — a 365d current + 365d prior needs 730). With ~400 daily points, `evaluatePeriod`'s "previous" branch caps the span to `Math.floor(n/2) = 200` (`src/lib/metrics/series.ts:150`): a 200-day-vs-200-day comparison with `truncated = true`. `historyGroundingText` ignores `truncated`/`baseline`, so it presents a ~6.5-month revenue total as the "12měsíční obrat" and a 200d-vs-preceding-200d delta as "meziročně" (year-over-year). This wrong annual figure and delta are injected into the recap grounding via `src/app/api/ai/route.ts:217`.
- **Root cause**: The 300-day gate and the "meziročně / 12 měsíců" wording assume the dataset always spans ≥730 days (true for the 730-point sample spine), but the live path is capped at 400 and the function never checks `snap.truncated` or `snap.baseline`.
- **Impact**: Every live-synced project's client recap narrates a fabricated annual revenue total and a mislabeled year-over-year change — a wrong, load-bearing number in a client-facing report.
- **Fix sketch**: Raise `HISTORY_MIN_DAYS` to ~700, or (better) have `buildSnapshot` return `truncated`/`baseline` to the caller and make `historyGroundingText` return `""` (or reword to the actual span, e.g. "posledních N měsíců vs. předchozích N") when `snap.truncated` or `snap.baseline !== "yoy"`. Also raise `SYNC_DAYS` to 730 and fix its comment.

## 3. Unlinked project silently syncs the user's *other* connected Ads account (cross-client leak)

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/report-metrics/sync.ts:28-37`
- **Scenario**: `resolveCustomerId(project, userId)` returns the project's own `adsCustomerId` if set, else falls back to `getAdsConnection(userId).customerId` — the user's single active connected account. For an agency user managing several client projects where only project A is linked, running the sync on unlinked project B (which has no `adsCustomerId`) resolves to A's connected customer id and stores A's account data as B's live metrics (`saveReportMetrics(project.id, { meta:{ customerId: A }, rows })`). Project B's report then shows "Živá data · Google Ads · účet A" — a different client's real spend and revenue — and every other unlinked project of that user resolves to the same account, so they all show identical numbers.
- **Root cause**: The connection model conflates "the user's one connected Google account" with "this project's ad account." The fallback was meant as a convenience but there is no guard that the resolved account actually belongs to the project.
- **Impact**: One client's real Google Ads figures surface inside another client's report — a data-isolation breach in a multi-client (agency) product, with the honest-looking live label making it credible.
- **Fix sketch**: Drop the `getAdsConnection` fallback in `resolveCustomerId` — require `project.adsCustomerId` for a report-metrics sync and return the "K projektu není napojený účet Google Ads" error otherwise. If the fallback must stay, verify the connected account is explicitly assigned to this project before syncing.

## 4. Google Ads account currency is silently treated as CZK

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/report-metrics/map.ts:46`
- **Scenario**: `mapAdsRowsToMetrics` computes `cost = Math.round(a.costMicros / 1_000_000)` and stores `revenue` raw, in the account's currency's major unit, with no currency recorded (`MetricsSyncMeta`, `src/lib/report-metrics/types.ts:22-32`, has `source`/`customerId`/`syncedAt`/`days`/`rowCount` but no `currency`). `buildLiveDataset` keeps `base.client.currency` (the sample's "CZK"), and the report/recap format every value with `fmtCZK` and compare it against CZK-denominated `goals`. A EUR or USD Ads account (common for CZ agencies with cross-border clients) yields cost/revenue numbers ~25× too small when read as CZK, a meaningless PNO-vs-goal, and "Kč" labels on non-CZK money.
- **Root cause**: The sync assumes every Ads account bills in CZK; the currency field on `customer.currencyCode` is never fetched or propagated.
- **Impact**: Silently wrong money in the client report whenever the linked account isn't CZK — no error, just wrong numbers under a live label.
- **Fix sketch**: Fetch `customer.currencyCode` in `fetchAccountDailyRows`, store it on `MetricsSyncMeta`, and set `data.client.currency` from it in `buildLiveDataset`; format with a currency-aware formatter (or reject/convert non-CZK accounts explicitly rather than mislabeling).

## 5. Relinking or clearing the Ads account does not clear stored live metrics — stale account's data persists

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/report-metrics/resolve.ts:34-43`
- **Scenario**: `resolveReportDataset` returns the persisted `report_metrics` rows as "live" whenever `isLiveMetrics` holds (`rows.length > 0`), independent of the project's current `adsCustomerId`. `PATCH /api/projects/[id]` (`src/app/api/projects/[id]/route.ts:26`) lets the user change `adsCustomerId` to a different account, or clear it, and never calls `clearReportMetrics`. So after a user re-points a project from account A to account B (before/without a successful re-sync), the report keeps serving A's synced rows with `meta.customerId = A`, while Settings shows B — the label and the numbers disagree and the data is the old account's. `DELETE` likewise leaves an orphaned `report_metrics` row.
- **Root cause**: The metrics store's lifecycle isn't coupled to the account-link lifecycle; "has synced rows" is treated as permanent truth rather than being invalidated when the underlying account changes.
- **Impact**: A project can display another (previous) account's real data as its current live report indefinitely if the fresh sync is never run or fails; project deletion leaks metric blobs.
- **Fix sketch**: In the PATCH handler, when `adsCustomerId` changes or is cleared, call `clearReportMetrics(id)`; also call it in the DELETE path. Alternatively, in `resolveReportDataset`, treat stored metrics as live only when `metrics.meta.customerId` matches the project's current normalized `adsCustomerId`.
