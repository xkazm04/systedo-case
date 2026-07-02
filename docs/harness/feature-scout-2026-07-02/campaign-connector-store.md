# Feature Scout — Google Ads Connector & SQLite Store (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/lib/campaigns/connector.ts, src/lib/campaigns/sample.ts, src/lib/campaigns/store.ts, src/lib/db.ts
>
> Note: the 2026-06-25 scan's findings 1–4 for this context are verified fixed in current source
> (live-fetch fallback, `buildTenantKey` sanitizer, `busy_timeout`, rewritten db.ts header);
> finding #5 (report/snapshot retention+pruning) is the known deferred bigger-build and is NOT
> re-proposed here.

## 1. Tell the truth when a "live" sync actually served sample data
- **Impact**: 8/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT] (only the optional banner step; the data-layer change is server-only)
- **Category**: user_benefit
- **File**: `src/lib/campaigns/connector.ts:57`
- **Opportunity**: The 06-25 fix made `googleAdsProvider` silently degrade to `sampleProvider` on any live-fetch error — but the fallback is invisible: the sync route still persists `{ source: connector.source }` = `"google-ads"` (`src/app/api/campaigns/route.ts:122`), so a tenant whose token expired sees deterministic Mionelo demo numbers labeled "Google Ads · živá data". The degradation half of the original fix sketch was never built.
- **Why valuable**: Mislabeling demo data as a client's live account data is the single fastest way to burn the trust the paid live tier depends on — an agency making budget decisions must know the numbers on screen are a fallback.
- **Build sketch**: Give the provider a per-request outcome: have `googleAdsProvider`'s catch blocks record `degraded = true` + the error class on a small context object returned from `resolveCampaignContext` (or return `{ data, degraded }` from the two fetch methods). In the sync route, persist `degraded` + `degradedReason` into the sync meta (`upsertCampaigns` meta arg, `store.ts:69`) and set `source: "sample"` when everything fell back; `getSyncMeta`/`loadState` already ship meta to the client. Optional step 2 [CLIENT]: a one-line warning banner in `CampaignsClient.tsx` ("Živá data dočasně nedostupná — zobrazujeme poslední ukázková data"), which then requires a full `next build`.

## 2. Sync daily budgets and flag budget-capped winners
- **Impact**: 8/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: [CLIENT] (table column step); extending the AI evaluation prompt with budget is [GATE] — explicitly out of scope here
- **Category**: feature
- **File**: `src/lib/google/ads.ts:268`
- **Opportunity**: The app can already *mutate* budgets (`applyBudgetShift` in `mutations.ts:102` reads them via `fetchCampaignBudgets`, `ads.ts:150`) but the synced `Campaign` model has no budget at all — users can shift money between campaigns without ever seeing what the current budgets are, and nothing detects the classic "winner starved by its budget" situation.
- **Why valuable**: "Which profitable campaign is capped by budget?" is the highest-leverage question in Ads management; surfacing daily budget + pacing turns the existing budget-shift mutation from a blind lever into an informed one.
- **Build sketch**: Add `campaign_budget.amount_micros` to the existing `fetchCampaigns` GAQL SELECT (`ads.ts:268-281` — the campaignBudget join is already parsed in `SearchRow`), map to an OPTIONAL `budgetPerDay?: number` (CZK) on `Campaign` (`types.ts:105`) per the proven optional-field+fallback convention. Give each sample `Spec` a derived plausible budget (e.g. `clicks×cpc×1.15`) so demo mode shows it too. Then compute pacing = `cost / (days × budgetPerDay)` in a pure helper (unit-tested in `test-unit/`), and flag rows with `roas ≥ TARGET_ROAS && pacing ≥ 0.95` as "omezeno rozpočtem". Do NOT feed it into the AI prompt (`campaign-eval.ts` is HASHED — gate-locked follow-up).

## 3. Per-campaign daily series for table sparklines
- **Impact**: 7/10
- **Effort**: 5/10
- **Risk**: 3/10
- **Flags**: [CLIENT] (CampaignTable renders the cell; alternatively keep the sparkline in a server-rendered SVG per the hand-rolled `<svg>` convention)
- **Category**: feature
- **File**: `src/lib/campaigns/connector.ts:29`
- **Opportunity**: `fetchSeries` only produces *portfolio* totals (the per-campaign fetch is deliberately date-aggregated, `ads.ts:203-233`), so the campaign table shows a single period-total per row with no shape — you can't see whether a campaign's spend spiked yesterday or has been flat for 30 days.
- **Why valuable**: A per-row sparkline is the standard "scan for trouble" affordance in every Ads tool; it also gives the change-diff panel visual corroboration.
- **Build sketch**: Add `fetchCampaignSeries(period): Promise<Record<string, DailyPoint[]>>` to `AdsConnector`. Live: one extra GAQL query with `campaign.id, segments.date, metrics.*` grouped in code (reuse `searchStream` + the `byDate` fold from `fetchDailySeries`). Sample: reuse `sampleSeries`'s per-`(seedKey, period, date)` seeding but per `Spec` (`sample.ts:148-184`). Persist next to the existing single-doc series (`store.ts:109` `series/latest` — 7 campaigns × 90 points fits one doc comfortably) with the same "only overwrite on success" rule the sync route already applies. Render as a pure-points-serializer SVG cell.

## 4. Let sample data drift over time so re-syncs actually change
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: functionality
- **File**: `src/lib/campaigns/sample.ts:121`
- **Opportunity**: `sampleCampaigns` seeds on `${seedKey}:${period}` only, so re-syncing the same period returns byte-identical campaigns — which means `getLatestChanges` (`store.ts:282`) always diffs two identical snapshots and the whole "Co se změnilo" panel, the newly-critical alerting, and the snapshot history are permanently dead for every anonymous/sample tenant, i.e. exactly the case-study audience. (Distinct from the deferred dataset-seed "config-driven demo engine" — that concerns `scripts/generate-data.mjs`/the dashboard dataset, not this file.)
- **Why valuable**: The change-diff and alert features are the product's "we tell you when something breaks" pitch; today no demo visitor can ever see them fire.
- **Build sketch**: Fold a coarse time bucket into the seed — e.g. `hashStr(`${seedKey}:${period}:${isoWeek}`)` — plus a small per-campaign drift factor, keeping output deterministic *within* the bucket so `hashEvalInputs` report caching (`store.ts:214`) still holds between same-week syncs and only invalidates when the data genuinely "moves". Tune drift amplitude so at least one campaign crosses the 5% change threshold (`store.ts:323`) week-over-week; add a unit test asserting (a) same-bucket stability and (b) cross-bucket difference. `sampleSeries` already seeds per-date and needs no change.

## 5. Sync all connected accounts, not just the active one
- **Impact**: 7/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: none
- **Category**: automation
- **File**: `src/lib/campaigns/connection.ts:55`
- **Opportunity**: `connection.ts` is explicitly built for agencies ("An agency connects many accounts (MCC) and switches between them") and tenants are already keyed per `customerId` (`buildTenantKey`, `connector.ts:80`), but both the cron and manual sync resolve only `getAdsConnection` = the *active* account. Switching accounts lands the user on a stale or empty tenant until the next manual sync — the multi-account half of the feature was never finished.
- **Why valuable**: For the agency persona, account switching should be instant (data already warm) and alerts should cover *all* client accounts, not just the one that happens to be selected.
- **Build sketch**: In the cron fan-out (`src/app/api/cron/sync/route.ts:39-88`), iterate `listConnectedAccounts(userId).accounts` instead of the single active connection, building each connector with that account's `customerId` (add an optional `customerId` override parameter to `resolveCampaignContext`, defaulting to the active account — no caller changes elsewhere). Each account already gets its own tenant via `buildTenantKey`, so storage/read paths need zero changes; keep the existing per-target try/catch and `maxDuration = 300` budget, and dedupe alert evaluation per tenant exactly as today.
