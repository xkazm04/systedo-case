# Monthly Report: Live Metrics Ingestion & Tile Model — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Account currency is never captured — non-CZK Ads accounts render real money under "Kč"
- **Severity**: High
- **Lens**: ambiguity
- **Category**: currency-assumption-undocumented
- **File**: src/lib/report-metrics/types.ts:31 (MetricsSyncMeta), src/lib/report-metrics/map.ts:55, src/lib/report-metrics/sync.ts:67
- **Scenario**: A client's Google Ads account bills in EUR or USD. The sync divides `costMicros` by 1e6 — explicitly "micros of the **account currency**" per map.ts's own header — and stores the numbers with no `currencyCode`. Every downstream surface (`ReportFormat: "czk"` tiles in compute.ts, `fmtCZK` in recap-context.ts) hardcodes CZK.
- **Root cause**: `MetricsSyncMeta` records source, customerId, syncedAt, days, rowCount, even timeZone — but not the account's `customer.currency_code`, which the same Google Ads customer resource exposes right next to the `time_zone` the sync already captures. The CZK assumption is implicit and undocumented.
- **Impact**: A EUR account's real spend/revenue is shown to the client as koruna at face value (~25x understatement), on the report explicitly labeled "Živá data" — the one place fabrication was supposed to be impossible. Goals comparison (PNO threshold) still works (ratio), but every absolute tile, the profit grounding, and the AI recap quote wrong-currency figures.
- **Fix sketch**: Capture `customer.currency_code` alongside `pickTimeZone` at ingestion into `meta.currencyCode` (additive-optional like `timeZone`). In `resolveReportDataset`/`buildLiveDataset`, either surface it into `data.client.currency` and thread it to formatters, or — minimum honest step — refuse the "Živá data" label (or banner a warning) when `currencyCode` is present and differs from "CZK".

## 2. buildLiveDataset carries the sample spine's `meta` (disclaimer/asOf/days/seed) and `client.currency` into the live dataset
- **Severity**: High
- **Lens**: ambiguity
- **Category**: sample-provenance-leak
- **File**: src/lib/report-metrics/build.ts:38
- **Scenario**: A project syncs real Ads data. `buildLiveDataset` spreads `base = getProjectDataset(project)` and deliberately neutralizes `channels: []` and `events: undefined` — but `PerformanceData` also contains `meta: { disclaimer, asOf, days, seed }` and `client.currency`, all of which pass through untouched from the illustrative sample spine.
- **Root cause**: The header comment carefully enumerates why `channels` and `events` must not appear under the "Živá data" label and why `goals` may stay — but `meta` and `client` were never audited by that reasoning. `meta.asOf`/`meta.days` now describe the *sample* series' span, not the synced rows' span, and `meta.disclaimer` is the sample-data disclaimer riding on real data.
- **Impact**: Any consumer that reads `data.meta.asOf`/`days` for date-range labels or `meta.disclaimer` for footer text shows sample-era provenance on a live report (or a "this is illustrative" disclaimer on real numbers — the exact confusion the whole A1 seam exists to prevent). `meta.seed` implies determinism the live series doesn't have.
- **Fix sketch**: In `buildLiveDataset`, overwrite `meta` from the rows: `asOf` = last row date, `days` = rows.length, `disclaimer` = live-data wording (or ""), and drop/zero `seed`. Extend the header comment's per-field audit to cover `meta` and `client` so the next field added to `PerformanceData` gets the same scrutiny.

## 3. SYNC_DAYS = 400 comment contradicts the 700-day history gate — live projects silently never get the 12-month/YoY grounding
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: contradictory-constants
- **File**: src/lib/report-metrics/sync.ts:23-24, src/lib/report/recap-context.ts:65-82
- **Scenario**: A maintainer reads sync.ts: "400d covers the 365d report plus its prior-year delta." But a 365-day window plus an equal-length prior window for a year-over-year delta needs ~730 days. recap-context.ts knows this — `HISTORY_MIN_DAYS = 700` plus the `snap.truncated` guard — so `historyGroundingText` returns "" for every live-synced project, forever (400 < 700; only the ~730d sample spine clears it).
- **Root cause**: The SYNC_DAYS rationale conflates "the 12m tiles' period-over-period delta on shorter windows" with the 12m *YoY* comparison; the two files encode incompatible arithmetic about the same window with no cross-reference from sync.ts's side.
- **Impact**: Not a correctness bug (the gate protects honesty), but a silent feature cliff: the richer year-trajectory narrative is exclusive to demo data, and the misleading comment invites someone to "fix" the recap gate down to 400 instead of raising SYNC_DAYS — which would re-fabricate YoY claims from a 200d-vs-200d split.
- **Fix sketch**: Either raise SYNC_DAYS to ~740 so live accounts with enough history unlock the YoY grounding, or correct the sync.ts comment to state explicitly: "400d supports the 365d tiles' PoP deltas only; the 12m YoY grounding (recap-context HISTORY_MIN_DAYS=700) is intentionally out of reach on live data."

## 4. Corrupted stored blob silently degrades the report to sample data — no log, no signal, in both backends
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-failure-swallow
- **File**: src/lib/report-metrics/store.local.ts:19-21, src/lib/report-metrics/store.firestore.ts:18-22, src/lib/report-metrics/resolve.ts:37-38
- **Scenario**: A blob is truncated or hand-edited (or a future shape change breaks parsing). `JSON.parse` fails → both backends return `null` → `isLiveMetrics(null)` is false → the report quietly reverts to the illustrative sample dataset. `resolveReportDataset`'s catch also maps genuine store errors to the same `null`. Nothing is logged anywhere on this path (contrast sync.ts, which does `console.error`).
- **Root cause**: "Degrade to sample, never break the report" is applied uniformly, but *data corruption* and *never synced* are collapsed into one indistinguishable `null` with zero observability.
- **Impact**: A client who synced real data suddenly sees demo numbers with the "illustrative" framing and no explanation; the operator has no log line to distinguish "blob corrupt" from "never synced", and `hasSyncedMetrics` flips Settings/Overview labels back too, erasing the evidence a sync ever happened.
- **Fix sketch**: In both backends' catch (and resolve.ts's), `console.error("[report-metrics] unparseable blob for %s", projectId, err)` before returning null. Optionally return a tri-state (`null | "corrupt" | ReportMetrics`) so the UI can prompt "znovu synchronizovat" instead of silently pretending nothing was there.

## 5. Zero-row sync keeps the previous blob alive — undocumented keep-last-known-good with no recovery path
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: undocumented-tradeoff
- **File**: src/lib/report-metrics/sync.ts:64-66
- **Scenario**: A previously-synced client pauses all campaigns (or the linked account is emptied/migrated). The next sync fetches 0 rows, `persistMetrics` returns `{ ok: false, error: "Google Ads nevrátil… žádná data" }` and — crucially — writes nothing. The old series stays stored, `syncedAt` never advances, and the report remains "Živá data" on months-old numbers with only the >7d stale banner as a hint.
- **Root cause**: Treating "0 rows" as a sync *failure* is defensible (protects against a transient API returning empty wiping good data), but the trade-off is nowhere stated: neither the `persistMetrics` doc ("The ONE place the sync meta is stamped") nor `SyncResult` distinguishes "fetch broke" from "account genuinely has no data in the window", and there is no path for the stored series to ever reflect the latter (clearReportMetrics exists but nothing calls it on this branch).
- **Impact**: Cron re-syncs fail forever for a dormant account; the client-facing report presents stale spend/revenue as live indefinitely, and the operator's only recovery is discovering the manual clear. The error copy also misleads the cron caller into treating a legitimate empty account as a broken integration.
- **Fix sketch**: Document the keep-last-known-good decision at the `rows.length === 0` branch, add a distinct `SyncResult` classification (e.g. `emptyWindow: true`), and let the caller decide: manual sync can offer "smazat starou řadu" (clearReportMetrics), and the cron can stop counting an empty-window response as a hard failure.