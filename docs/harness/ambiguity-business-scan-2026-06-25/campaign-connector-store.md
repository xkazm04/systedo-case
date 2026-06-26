# Google Ads Connector & SQLite Store — Ambiguity + Business scan
> Context: the campaign data layer — Google Ads connector (deterministic sample provider + a live-credentials seam), the per-tenant report/snapshot store, and the local `node:sqlite` handle.
> Files analyzed: 4 (connector.ts, sample.ts, store.ts, db.ts) + types.ts read for types
> Total findings: 5

## 1. The "SQLite campaign store" is dead schema — the real store is Firestore, but db.ts still claims otherwise
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/lib/db.ts:1-8, 21, 24-79
- **Problem/Opportunity**: `db.ts`'s header (lines 1-8) states it "persist[s] synced Google Ads data and AI evaluation reports to a file", and it defines `campaigns`, `reports`, `sync_meta`, `campaign_snapshots` tables (+ `idx_reports_lookup`, `idx_snapshots_time`) and one `MIGRATIONS` entry `ALTER TABLE reports ADD COLUMN input_hash`. But `campaigns/store.ts` actually persists all of this to **Firestore** (header line 1, `firestore.collection("tenants")`). Git confirms the move (`9e66ed9 feat(campaigns): per-user Firestore persistence`), and no raw SQL anywhere outside db.ts references those four tables — they are leftover schema. The stale comment is what made even this scan's own brief call the layer a "node:sqlite store that persists synced campaigns and AI reports."
- **Why it matters**: A reader gets two contradictory mental models (Firestore vs SQLite) for where campaign data lives, and the dead `reports` table makes the lone migration permanently throw-and-swallow (db.ts:130-136), masking the very thing it's swallowing.
- **Fix sketch**: In `db.ts`, delete the dead `campaigns`/`reports`/`sync_meta`/`campaign_snapshots` tables + their indexes and the now-orphaned `MIGRATIONS` entry (keep `users`/`projects`/`rate_limits`, which are live). `CREATE TABLE IF NOT EXISTS` removal won't drop existing rows in `.data/systedo.db`, so it's commit-safe. Rewrite the header to state SQLite backs only rate-limits + LOCAL_DB users/projects, and that campaigns/reports live in Firestore (point to `campaigns/store.ts`).

## 2. Live Google Ads errors have no fallback — one transient API failure 500s the whole premium dashboard
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/lib/campaigns/connector.ts:45-56, 90-93
- **Problem/Opportunity**: `googleAdsProvider.fetchCampaigns/fetchSeries` (lines 49-54) call `adsFetchCampaigns`/`adsFetchDailySeries` with no error handling, and `resolveCampaignContext` (lines 90-93) hands back that connector once a token exists. The sample provider is the documented safe default, yet the moment a user connects a real account, any expired token / quota / GAQL error propagates uncaught to the route. The live-credentials seam is the natural premium/agency hook, but it's currently the most fragile path.
- **Why it matters**: The differentiator vs a static portfolio is "connect your real Google Ads account" — and right now that path is strictly less reliable than the demo, which erodes exactly the trust a paid live tier needs.
- **Fix sketch**: Wrap the live calls so a fetch failure degrades to `sampleProvider(...)` (or returns a typed `{ source, live: "unavailable", reason }` the UI can surface as a banner) rather than throwing; log the underlying error server-side. Add one test that simulates `adsFetchCampaigns` rejecting and asserts the connector still returns sample data with a degraded flag.

## 3. No `busy_timeout` — concurrent writers hit SQLITE_BUSY and throw instead of waiting
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/db.ts:119
- **Problem/Opportunity**: WAL is enabled (`PRAGMA journal_mode = WAL`) but no `busy_timeout` is set. `node:sqlite` is synchronous; the cron sync route, a concurrent request, the rate-limit writer, and the schema re-apply on HMR (db.ts:128-138) can all touch the file at once. Without a busy timeout, a contending write throws `SQLITE_BUSY` immediately instead of briefly waiting — the classic "DB locked" edge the happy path ignores.
- **Why it matters**: An intermittent, hard-to-reproduce 500 on the rate-limiter or local-mode writes under light concurrency, with no recorded decision that "we accept lock failures."
- **Fix sketch**: Add `db.exec("PRAGMA busy_timeout = 5000;")` immediately after the WAL pragma (db.ts:119), so contended writes retry for up to 5s before failing. One line; document the chosen value.

## 4. Tenant key is built twice and its components are interpolated into a Firestore path unsanitized
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/campaigns/connector.ts:64-72, 87-88; src/lib/campaigns/store.ts:34-36
- **Problem/Opportunity**: `resolveTenant` (lines 70-71) and `resolveCampaignContext` (lines 87-88) compute the identical `u_${userId}_proj_${projectId}_${customerId}` formula independently — two sources of truth. If one drifts, the read path and the sync path target different tenants and data silently "disappears." Separately, that string is passed straight to `firestore.collection("tenants").doc(tenant)` (store.ts:34-36); a `projectId`/`customerId` containing `/` would be reinterpreted by Firestore as a nested sub-collection path, an unguarded seam.
- **Why it matters**: Divergent tenant keys cause silent, confusing data loss; an unsanitized path component is a cheap-to-close defense-in-depth gap precisely where the brief asks "is the live seam safe?".
- **Fix sketch**: Extract one `tenantKey(userId, projectId?, customerId?)` helper and call it from both functions. Inside it, assert each component matches `^[A-Za-z0-9_-]+$` (or strip `/`) before building the path, throwing on violation.

## 5. Snapshots and reports grow unbounded and every read scans the whole collection — no retention
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: src/lib/campaigns/store.ts:8-10, 57, 164-167, 234-249
- **Problem/Opportunity**: Each sync appends a snapshot (line 57) and each evaluation `add()`s a report (line 196), forever. `findCachedReport`, `getReportsForPeriod`, `getReportHistory*` all call `allReports` (lines 164-167), which fetches the **entire** reports collection and filters in code. The header's "per-tenant collections are small" (lines 8-10) is an undocumented assumption that decays for any active tenant — read cost and Firestore bill climb with every sync/eval.
- **Why it matters**: It's both a reliability cliff (cache lookups get slower the more you've used the product) and a real product/data-retention story agencies expect — "keep N months of history" is a tier knob, not just cleanup.
- **Fix sketch**: Add a `pruneTenant(tenant, keepDays)` (delete snapshots/reports older than a cutoff) invoked from the cron sync, and switch `findCachedReport`/`getReportsForPeriod` to a bounded `where(period==)`/`orderBy(created_at desc).limit()` query instead of `allReports`. Expose `keepDays` as a per-plan retention setting to turn the fix into a feature.
