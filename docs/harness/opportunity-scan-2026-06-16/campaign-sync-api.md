# Campaign Sync & Evaluation API — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Batch / "evaluate whole portfolio" endpoint to make AI feel instant
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/app/api/campaigns/analyze/route.ts + src/components/campaigns/useCampaigns.ts
- **Opportunity**: Today `POST /analyze` evaluates exactly one scope per request and the UI calls `analyze("campaign", id, ...)` per row. Scoring all campaigns means N sequential round-trips, each gated by `acquireSlot()` and the per-minute `evalPerMin` cap — so a "score everything" action is slow and easily 429s. Add a batch mode (`scope: "batch"` or an `ids: string[]` body) that loops in-process, reuses `findCachedReport` per campaign, and returns a `Record<key, {report, history}>`.
- **Value**: The headline demo moment of this case study is "AI evaluates your Google Ads in one click." A single fast call that lights up every row at once is dramatically more impressive to an agency prospect than watching rows spin one-by-one, and it's the difference between a demo that sells and one that stalls.
- **Effort**: M
- **Fix sketch**: Branch in the existing POST handler on a `batch` flag; iterate `listCampaigns()`, calling `hashEvalInputs`/`findCachedReport`/`generateCampaignEvaluation`/`saveReport` per campaign under one `acquireSlot()`/`releaseSlot()`; count only LLM-served (uncached) items against `evalPerMin`/`evalPerDay` so the cache makes re-runs free.

## 2. Expose the sync-over-sync diff as a standalone changes/history API
- **Severity**: High
- **Lens**: Both
- **Category**: functionality
- **File**: src/app/api/campaigns/route.ts (store.getLatestChanges / campaign_snapshots)
- **Opportunity**: `getLatestChanges()` already diffs the two most recent `campaign_snapshots` into added/removed/changed with per-metric deltas, but it's only emitted as a single embedded blob inside the big GET payload and is hard-capped to the last 2 syncs and 6 items. There is no way to query "what changed between sync X and Y", page the full item list, or pull the snapshot timeline. Add `GET /api/campaigns/changes?since=&until=&limit=` and `GET /api/campaigns/history` over `campaign_snapshots`/`reports`.
- **Value**: "Show me exactly what moved in our account, week over week, with the AI's read on it" is the recurring value an agency client pays for monthly — it turns a one-shot snapshot into an ongoing monitoring story and is the natural hook for a recurring/retainer pitch.
- **Effort**: M
- **Fix sketch**: Generalize `getLatestChanges` to accept explicit `since`/`current` timestamps (it already loads batches by `synced_at`), drop the `slice(0, 6)` cap behind a `limit` param, and add a thin route handler; index already exists (`idx_snapshots_time`).

## 3. Export endpoint (CSV / JSON) for campaigns and AI reports
- **Severity**: High
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/app/api/campaigns/route.ts (new export route)
- **Opportunity**: There is no way to get the synced campaigns or the stored `reports` out of the app — no CSV, no JSON download. Everything is locked in `.data/systedo.db` and only viewable on screen. Add `GET /api/campaigns/export?format=csv|json&scope=campaigns|reports` that streams `listCampaigns()` (with `deriveMetrics`) or the persisted evaluation reports.
- **Value**: Agency clients and their stakeholders live in spreadsheets and slide decks; a one-click "Export to CSV" is table-stakes for any analytics product and a concrete proof-point that this isn't just a pretty mock. It also feeds the "send this to your boss" sharing loop that drives organic referrals.
- **Effort**: S
- **Fix sketch**: New route building a CSV from `listCampaigns()` columns + `deriveMetrics(c)` ratios (and a reports variant flattening `CampaignReportResult.score/verdict`), returned with `Content-Type: text/csv` and a `Content-Disposition: attachment` header; reuse `getReportsForPeriod`/`getReportHistories` for the reports format.

## 4. Scheduled / auto-sync with threshold alerts on the snapshot diff
- **Severity**: Medium
- **Lens**: Both
- **Category**: differentiation
- **File**: src/app/api/campaigns/route.ts (POST sync) + src/lib/campaigns/connector.ts
- **Opportunity**: Sync only happens when a human clicks (UI `sync()` → `POST /api/campaigns`). The plumbing for change detection already exists (`campaign_snapshots` + `getLatestChanges` with its `>= 0.05` delta thresholds), but nothing triggers a sync on a timer or fires when a campaign's cost/ROAS swings hard or a campaign flips to `paused`. Add a token-protected `POST /api/campaigns/sync?token=` for cron, and surface "alert-worthy" changes (e.g. `Math.abs(costDelta) >= threshold`) from the diff.
- **Value**: "We watch your account for you and flag problems automatically" is the single biggest differentiator versus a static dashboard, and it converts a one-time case study into an always-on monitoring product with an obvious recurring-revenue tier.
- **Effort**: M
- **Fix sketch**: Gate a sync route on `process.env.SYNC_CRON_TOKEN` (skip per-IP rate limit for the trusted caller), reuse the existing connector→`upsertCampaigns` path, then compute `getLatestChanges()` and emit/persist items above an env-tunable delta threshold for an email/webhook hook (a no-op stub mirroring `googleAdsProvider`'s "ready seam" pattern).

## 5. Idempotent eval cache is invisible — return and surface cache/cost metadata
- **Severity**: Medium
- **Lens**: Both
- **Category**: monetization
- **File**: src/app/api/campaigns/analyze/route.ts
- **Opportunity**: The route already does the clever thing — `hashEvalInputs` + `findCachedReport` skip the paid LLM call on unchanged inputs and return `cached: true`, and `AiMeta` even carries `estCostUsd`/`usage`. But the savings are never aggregated or shown: there's no "this re-run was free / you've saved $X in AI calls" signal, and `useCampaigns.analyze` doesn't even read the `cached` flag. Add a `GET /api/campaigns/usage` (sum `took_ms`, count cached vs live, sum `estCostUsd`) and pass `cached` through to the client.
- **Value**: Surfacing "served from cache, $0" turns an invisible engineering nicety into a visible trust-and-efficiency selling point — it tells a cost-conscious agency the product won't burn their budget, and gives Systedo a concrete metered-AI usage/billing surface to build a pricing tier on.
- **Effort**: S
- **Fix sketch**: Add a small aggregate query over `reports` (group by `demo`/`model`, sum `took_ms`, and a stored cost column if added) behind a `usage` route; thread the existing `cached: true` field from the analyze response into `useCampaigns` state and render a subtle badge in `ReportView`.
