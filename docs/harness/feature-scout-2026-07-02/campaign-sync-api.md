# Feature Scout — Campaign Sync & Evaluation API (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/app/api/campaigns/route.ts, src/app/api/campaigns/analyze/route.ts

## 1. Flag stale reports in the GET state so the UI can say "data changed since this evaluation"
- **Impact**: 8/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/app/api/campaigns/route.ts:41`
- **Opportunity**: Every report is persisted with an `input_hash` (store.ts:194), but `loadState` never compares it to the current `hashEvalInputs` — and `toReport` (store.ts:142-151) even drops the hash. After any sync that changes metrics, the page silently shows an evaluation of *old* numbers, contradicting the analyze route's own promise that "a stored report always matches the data on screen". (Distinct from the gate-locked prior finding #4, which was about what goes *into* the hash; this surfaces the existing hash comparison — all non-hashed files.)
- **Why valuable**: Trust: users act on AI recommendations; a fresh sync with a collapsed campaign under a green week-old report is actively misleading. A stale badge + "re-evaluate" nudge turns the cache from invisible to explainable.
- **Build sketch**: In `loadState`, after `listCampaigns`, compute `hashEvalInputs("overall", null, meta.period, campaigns)` plus one per campaign id, and return a `staleKeys: string[]` (or `stale` per report entry) by comparing against each stored report's `input_hash` — expose the hash from store.ts via `getReportsForPeriod` or a parallel map. Pass through `useCampaigns` state and render a small „Data se od vyhodnocení změnila" badge in the report card (the [CLIENT] hook/component edit → the wave must run a full `next build`).

## 2. Unify manual and cron sync into one shared pipeline (anomalies + activity feed for manual syncs)
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: functionality
- **File**: `src/app/api/campaigns/route.ts:139`
- **Opportunity**: The manual POST sync and `/api/cron/sync` have drifted into two half-pipelines: the cron path runs `evaluateAnomalyAlerts` and writes `recordActivity` timeline entries but still wipes the stored series on a failed fetch (cron/sync/route.ts:59 saves unconditionally — the seriesOk guard was only added to the manual route); the manual path has the series guard but produces no anomaly alerts and no activity entry, so user-initiated syncs are invisible in the agency-facing timeline.
- **Why valuable**: The activity feed is pitched as "a single durable record of what happened" (activity.ts:1-6) — manual syncs missing from it undermines that; and anomaly detection firing only on the hourly cron means a user who just synced sees nothing the inbox will later flag.
- **Build sketch**: Extract a `runTenantSync(connector, tenant, { userId, period, actor })` helper in `src/lib/campaigns` (new non-hashed file): upsert → guarded `saveSeries` (only on fetch success) → `evaluateAndAlert` → best-effort `evaluateAnomalyAlerts` → `recordActivity` with actor "Vy" vs "Automatická synchronizace". Both routes shrink to auth/quota + one call; the cron series-wipe bug disappears as a side effect.

## 3. Add a batch "evaluate everything" endpoint that only pays for stale reports
- **Impact**: 7/10
- **Effort**: 5/10
- **Risk**: 4/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/app/api/campaigns/analyze/route.ts:86`
- **Opportunity**: Evaluating a 10-campaign portfolio today takes 11 separate clicks (overall + each row), each a full request cycle. All the machinery for a safe batch exists — `hashEvalInputs` + `findCachedReport` dedupe, per-call `consume(userId, "aiEval")`, the concurrency slot — but there is no endpoint that walks the portfolio. Built as a NEW sibling route (`analyze/batch/route.ts`) calling the existing `generateCampaignEvaluation` wrapper, so the hashed analyze route and the LLM chokepoint are untouched — no gate run.
- **Why valuable**: This is the power move after every sync: "re-evaluate whatever changed". Combined with idea 1's stale flags it becomes one-click portfolio hygiene, and the cache check means unchanged campaigns cost nothing.
- **Build sketch**: New route, signed-in only (skip the anonymous shared-tenant cost problem): iterate overall + each campaign sequentially; per target compute the hash, return the cached report when it matches, otherwise `consume` quota and evaluate — stop gracefully on quota exhaustion and return partial results `{ done, cached, skipped, remaining }`. Reuse `saveReport`/`getReportHistory` exactly as the single route does. UI: one „Vyhodnotit vše" button in CampaignsClient driving `useCampaigns` ([CLIENT] → full `next build` in the wave).

## 4. Record evaluations in the activity feed and alert on score regressions (via the saveReport seam)
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: automation
- **File**: `src/lib/campaigns/store.ts:172`
- **Opportunity**: A completed AI evaluation never lands in the activity timeline (`ActivityKind` even has a `"report"` kind, used only for sent report emails), and a score collapse — portfolio 78 → 41 between two evaluations — produces no inbox alert; only triage-critical campaigns at *sync* time do. Both can be wired inside `saveReport` (store.ts, non-hashed), so the gate-locked analyze route needs no edit.
- **Why valuable**: The report history already stores the trend; nobody watches it. An inbox entry on a significant drop turns persisted history into proactive monitoring, and feed entries make AI spend auditable ("who ran what, when").
- **Build sketch**: In `saveReport`, after persisting: read the previous history point (reuse the `allReports` filter), and best-effort `recordActivity(tenant, { kind: "report", title: "AI vyhodnocení · skóre N" , … })` plus `recordAlert(tenant, { type: "critical", … })` when the score drops ≥ a threshold (e.g. 15 points) — `recordAlert` is per-tenant inbox-only, so no userId is needed. Wrap both in try/catch like activity.ts does, so logging can never fail the evaluation.

## 5. Store synced state per period so switching 7d/30d/90d is instant and quota-free
- **Impact**: 6/10
- **Effort**: 5/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/app/api/campaigns/route.ts:84`
- **Opportunity**: The store holds exactly one period at a time: `upsertCampaigns` deletes all campaign docs and `saveSeries` overwrites `series/latest`, so flipping the period selector 7d → 30d → 7d costs three full connector round-trips and burns three units of the daily `sync` quota to re-fetch data the app had seconds ago.
- **Why valuable**: Period comparison is a core analyst gesture; on the free plan's small sync limit, browsing periods literally consumes the day's quota. Per-period retention makes the toggle instant and reserves quota for genuine refreshes.
- **Build sketch**: Key stored state by period: campaigns docs gain a `period` field (delete/read filtered by it), series moves to `series/{period}`, and `SyncMeta` keeps a per-period `syncedAt` map alongside the active period. GET accepts `?period=` and serves stored data when present (else the client falls back to a real sync); `useCampaigns.sync(period)` first tries the cheap GET. All in store.ts + route.ts + the hook — non-hashed; keep backward-compat reads for existing un-keyed docs (treat as the meta period). Steps: (1) store schema + compat, (2) GET `?period=`, (3) hook/selector wiring ([CLIENT] → full `next build`).
