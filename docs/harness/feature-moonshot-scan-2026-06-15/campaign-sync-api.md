# Feature + Moonshot Scan — Campaign Sync & Evaluation API

> Context: ctx_1781547850579_ctxgz9c
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Evaluation cache + fingerprint dedupe (don't re-spend tokens on unchanged data)

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: src/app/api/campaigns/analyze/route.ts:47 (POST), src/lib/campaigns/store.ts:157 (saveReport / getReportsForPeriod)
- **Scenario**: A user clicks "Vyhodnotit" on the same campaign three times in a row without re-syncing. Each click fires `generateCampaignEvaluation`, burns an LLM call (Claude CLI / Gemini), waits ~seconds, and appends a near-identical report row. The trend timeline then shows three meaningless dots at the same score for the same data window — visual noise that misrepresents "history."
- **Opportunity**: Compute a deterministic fingerprint of the exact inputs an evaluation depends on — `scope`, `campaignId`, `period`, and a hash of the campaign metric tuples (`impressions, clicks, cost, conversions, conversionValue`) for the in-scope campaign(s). Before calling the model in the analyze route, look up the newest stored report carrying that fingerprint; if present and the data hasn't changed since `syncedAt`, return it with a `cached: true` flag instead of regenerating. A `?force=1` query param bypasses the cache for a deliberate re-run.
- **Impact**: Eliminates wasted LLM spend and latency on repeat clicks (the single most common interaction here), and keeps the trend timeline honest — one point per genuinely distinct data state. Directly serves the "evaluation caching/versioning" goal.
- **Implementation sketch**: Add an `input_hash TEXT` column to the `reports` table in `db.ts:38` SCHEMA (additive, `CREATE TABLE IF NOT EXISTS` is fine for fresh dbs; add a guarded `ALTER TABLE` for existing ones). Add `hashEvalInputs(scope, campaignId, period, campaigns)` in `store.ts` (use `node:crypto` `createHash("sha1")` over the canonical metric tuples). In `analyze/route.ts`, after loading `campaigns`/`meta`, call a new `findCachedReport(scope, campaignId, period, hash)`; short-circuit if hit. Persist the hash in `saveReport`. Return `{ report, history, cached }`.

## 2. Incremental, non-destructive sync with change diffing & history

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: src/lib/campaigns/store.ts:53 (upsertCampaigns), src/app/api/campaigns/route.ts:33 (POST)
- **Scenario**: `upsertCampaigns` runs `DELETE FROM campaigns` then re-inserts the whole set every sync (store.ts:60). Despite the function being named "upsert," there is no upsert and no memory of the previous state — so the app can never answer "what changed since last sync?" (a campaign paused, spend jumped 40%, a new campaign appeared). The GET payload is always a flat current snapshot; the connector comment even calls campaign ids "stable across periods," yet nothing exploits that stability.
- **Opportunity**: Turn the destructive replace into a true diff: compare the incoming set against the persisted set by `id`, classify each as added / removed / changed (with per-metric deltas), and write a `campaign_changes` audit row per sync. Surface a `changes` block in the GET/POST `loadState()` payload (counts + the per-campaign deltas for the latest sync) so the dashboard can show "od poslední synchronizace: 2 kampaně pozastaveny, náklady +12 %."
- **Impact**: Unlocks the entire "what changed" product surface — change badges, sync diff summaries, and grounding for the AI (the model can be told what moved, not just current totals). Converts a meaningless "upsert" into real, persisted change history.
- **Implementation sketch**: Keep the existing campaigns table as "current," add a `campaign_changes (sync_id, campaign_id, kind, field, old REAL, new REAL, synced_at)` table in `db.ts` SCHEMA. In `upsertCampaigns` (store.ts:53), before the DELETE, `SELECT` the existing rows into a `Map<id, Campaign>`, diff against the incoming array, and insert change rows inside the same transaction. Add `getLatestChanges()` to store.ts and fold it into `loadState()` in `route.ts:19`.

## 3. Sync & evaluation status visibility (staleness + last-sync surfacing)

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: S (<1d)
- **File**: src/app/api/campaigns/route.ts:19 (loadState), src/lib/campaigns/store.ts:130 (getSyncMeta)
- **Scenario**: `getSyncMeta` already stores `syncedAt` and `source`, and the connector exposes a human `label` ("Google Ads · ukázková data" vs "živá data"), but `loadState()` returns only the raw `meta` with no derived freshness. A reviewer of the case study can't tell at a glance whether they're looking at 5-minute-old or 5-day-old data, whether it's sample or live, or whether the on-screen reports are stale relative to the latest sync (a report generated before the last sync still shows as "current").
- **Opportunity**: Enrich the GET payload with derived status: `ageMs` / `isStale` (e.g. older than the period window), the connector `label`, and per-report `staleVsSync` flags (report `createdAt` < `meta.syncedAt`). This makes the API self-describing so the UI can render a freshness chip and a subtle "report predates last sync — re-evaluate?" hint without client-side guessing.
- **Impact**: Cheap, high-polish credibility win for a portfolio piece — the dashboard visibly "knows" how fresh and how live it is, and nudges the user to re-evaluate stale reports. Reinforces the demo-vs-live transparency the codebase already values (`meta.demo`).
- **Implementation sketch**: In `route.ts`, extend `loadState()` to include `connector.label` and `connector.source` from `getConnector()`, compute `ageMs = Date.now() - Date.parse(meta.syncedAt)` and `isStale`, and tag each report in `getReportsForPeriod` with `staleVsSync = report.createdAt < meta.syncedAt`. No schema change — all derivable from existing columns.

## 4. Scheduled / webhook-driven autonomous sync (the API stops being click-only)

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: src/app/api/campaigns/route.ts:33 (POST), src/lib/campaigns/connector.ts:64 (getConnector)
- **Scenario**: Today the only way data enters SQLite is a human POSTing `/api/campaigns` from the dashboard. Both routes are also fully unauthenticated and `force-dynamic`, so the moment this is fronted by real Google Ads credentials it's a single endpoint anyone can hammer. There is no concept of "the data keeps itself fresh" — the core promise of a "marketing-analytics product" is a system that watches your accounts, not a button you remember to press.
- **Opportunity**: Add a thin automation layer on top of the existing sync+eval pipeline: (a) a protected `/api/campaigns/sync` cron route (Vercel Cron / external scheduler) guarded by a `CRON_SECRET` bearer token that calls the same `connector.fetchCampaigns` → `upsertCampaigns` path on a schedule; (b) when the diff from idea #2 detects a material change (spend spike, status flip, new campaign), auto-trigger a fresh portfolio evaluation and persist it. This is the seed of an "always-on" agent: data refreshes itself and re-evaluates only when something actually moved (caching from idea #1 prevents waste).
- **Impact**: Transforms a manual demo into a credible product narrative — "Systedo continuously ingests your Google Ads data and flags problems before you notice." It's the smallest believable step from case study toward a real monitoring service, and it hardens the now-exposed write endpoints with auth.
- **Implementation sketch**: Add `src/app/api/campaigns/sync/route.ts` (GET for cron) checking `Authorization: Bearer ${process.env.CRON_SECRET}` before reusing the POST body of `route.ts`. Factor the sync body of `route.ts:43-55` into a shared `runSync(period)` in store/connector land. After `upsertCampaigns`, if `getLatestChanges()` (idea #2) reports material deltas, call `generateCampaignEvaluation({ scope: "overall", ... })` + `saveReport`. Add a `vercel.json` cron entry. Add the same bearer guard to the existing POST handlers.

## 5. Multi-account ingestion service — from single seam to a live ingestion platform

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: L (>3d)
- **File**: src/lib/campaigns/connector.ts:64 (getConnector), src/lib/campaigns/store.ts (whole single-tenant store), src/lib/db.ts:17 (SCHEMA)
- **Scenario**: The entire data layer is hard single-tenant: `sync_meta` is pinned to `id = 1` (store.ts:81, db.ts:31 `CHECK (id = 1)`), `getConnector()` returns one provider from one set of `GOOGLE_ADS_*` env vars (connector.ts:64), and `campaigns` has no account dimension. The architecture is one customer, one Google Ads login, one snapshot — fine for a case study, a dead end for a product. Yet the connector is already a clean `AdsConnector` interface with a `source`/`label` and a deliberate `googleAdsProvider` seam, and reports already carry `scope`/`campaignId` — most of the abstraction needed already exists.
- **Opportunity**: Generalize the single seam into a multi-account ingestion service: an `accounts` table (per Google Ads customer id + OAuth refresh token, encrypted), `account_id` foreign keys threaded through `campaigns`, `sync_meta`, and `reports`, and a `getConnector(accountId)` that resolves per-account credentials. The sync/eval routes take an `accountId`, and the scheduled sync (idea #4) fans out across every connected account. The endgame: a single API surface that ingests many clients' Google Ads (and later Sklik — `PLATFORMS` already lists `sklik`) campaigns, diffs them over time, and serves AI evaluations per account — a real agency-grade monitoring backend.
- **Impact**: Category-defining: moves the product from "one demo dashboard" to "the ingestion + evaluation backend an agency runs across its whole client book." Every other idea (cache, diff history, scheduled sync) compounds per-account. This is the platform play the connector interface was quietly designed to allow.
- **Implementation sketch**: Phase 1 — add `accounts (id, customer_id, label, source, encrypted_refresh_token, created_at)` to `db.ts` SCHEMA and an `account_id` column (default a single bootstrap account for backward-compat) on `campaigns` / `sync_meta` / `reports`; drop the `CHECK (id = 1)` constraint on `sync_meta` and key it by `account_id`. Phase 2 — change `getConnector()` in connector.ts to `getConnector(account)` reading per-account creds, and parameterize every store.ts query by `accountId`. Phase 3 — add `accountId` to `EvaluationRequest`/`validateEvaluationRequest` (ai-types.ts:287) and the sync body, then have the cron route iterate `listAccounts()`. Encrypt refresh tokens with `node:crypto` AES-GCM keyed off an env secret.
