# Feature + Moonshot Scan — Google Ads Connector & SQLite Store

> Context: ctx_1781547850573_tn8c452
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Wire the live Google Ads API behind the existing seam (GAQL adapter)
- **Severity**: High
- **Lens**: feature-scout
- **Category**: integration
- **Effort**: M (1-3d)
- **File**: `src/lib/campaigns/connector.ts:48` — `googleAdsProvider.fetchCampaigns`
- **Scenario**: The connector already declares the five `GOOGLE_ADS_*` env vars, detects them via `hasGoogleAdsCredentials()`, and switches `getConnector()` to the live provider — but `fetchCampaigns()` only throws a (well-written) Czech "not wired yet" error. For a case study demonstrating a *real* marketing-analytics product, the single most credibility-defining move is making the seam actually pull live data, even if behind a feature flag the reviewer never trips.
- **Opportunity**: Implement the body with the official `google-ads-api` client (or a thin REST/GAQL fetch to avoid a native dep, staying in the project's zero-dependency spirit). Run a GAQL query over `campaign` + `metrics` (`impressions`, `clicks`, `cost_micros`, `conversions`, `conversions_value`) for the requested `CampaignPeriod`, map `cost_micros → cost` (÷1e6) and `advertising_channel_type → CampaignType`, returning the exact `Campaign[]` shape the store already persists. The sample provider stays the keyless default, so nothing breaks without credentials.
- **Impact**: Turns "ready seam" into a genuinely dual-mode product. A live demo with the recruiter's own Google Ads account becomes a 30-second flip of `.env.local`, and the deterministic sample still guarantees a working demo for everyone else.
- **Implementation sketch**: Add `mapChannelType(raw): CampaignType` and `centsFromMicros(n)` helpers in `connector.ts`; build the GAQL string parameterised by `CAMPAIGN_PERIOD_DAYS[period]` for the `segments.date DURING` clause; OAuth-refresh using `GOOGLE_ADS_REFRESH_TOKEN`/`CLIENT_ID`/`CLIENT_SECRET`; surface partial-failure as the same 502 the POST handler in `src/app/api/campaigns/route.ts:47` already renders. Keep the throw as the fallback when a field is unmapped.

## 2. Time-series metric snapshots in SQLite (history beyond AI reports)
- **Severity**: Critical
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/lib/campaigns/store.ts:53` — `upsertCampaigns`; `src/lib/db.ts:17` — `SCHEMA`
- **Scenario**: `upsertCampaigns` runs `DELETE FROM campaigns` then re-inserts, so the store only ever holds the *latest* sync. Yet the AI side already proves the value of history: `reports` is append-only and powers `getReportHistory`/`getReportHistories` trend sparklines. The campaign metrics themselves — the thing every trend chart actually wants — are thrown away on each sync. The app shows "score over time" but cannot show "ROAS over time" from its own data.
- **Opportunity**: Add an append-only `campaign_snapshots(synced_at, period, campaign_id, impressions, clicks, cost, conversions, conversion_value)` table written inside the *same* transaction as the existing replace, plus a `getCampaignHistory(campaignId)` / `getPortfolioHistory(period)` reader that mirrors the `getReportHistory` pattern. The "current" `campaigns` table stays as the fast latest-state view; snapshots become the time machine.
- **Impact**: Unlocks real metric trend lines (spend, ROAS, CPA over weeks of re-syncs) using only data the app already fetches — the single highest-leverage addition to the store, and it makes the AI evaluations far stronger because the model can be fed "last sync vs this sync" deltas.
- **Implementation sketch**: Extend `SCHEMA` in `db.ts` with the snapshot table + index on `(campaign_id, synced_at)`; inside `upsertCampaigns`' existing `BEGIN/COMMIT` block insert one snapshot row per campaign using the `new Date().toISOString()` already computed for `sync_meta`; add `ReportHistoryPoint`-style `MetricHistoryPoint` to `ai-types`/`types.ts` and reader functions next to `getReportHistory` in `store.ts:237`.

## 3. Multi-account / MCC support with a per-account synced state
- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: feature
- **Effort**: M (1-3d)
- **File**: `src/lib/db.ts:31` — `sync_meta` (singleton `id=1`); `src/lib/campaigns/connector.ts:41` — `GOOGLE_ADS_CUSTOMER_ID`
- **Scenario**: The whole store assumes one account: `sync_meta` is pinned to `id=1` via a `CHECK (id = 1)`, `upsertCampaigns` does a global `DELETE FROM campaigns`, and the env exposes a single `GOOGLE_ADS_CUSTOMER_ID`. Real Google Ads work — and the e-shop story the sample tells — almost always spans several accounts under a manager (MCC) account. An agency-grade case study that handles exactly one account understates the product.
- **Opportunity**: Add an `account_id` dimension: an `accounts` table (id, name, source), `account_id` columns on `campaigns`/`sync_meta`/`reports`, and an account selector in the connector (`getConnector(accountId)`), with the sample provider emitting 2-3 distinct Mionelo-style accounts. Scope every read/write by the active account.
- **Impact**: Demonstrates agency-scale thinking (manage a portfolio of clients), and makes the "by-type" and AI-evaluation features compose into cross-account roll-ups — a credible upsell narrative for the marketing product.
- **Implementation sketch**: Relax the `sync_meta` `CHECK` to a per-account row; thread an `accountId` param from `src/app/api/campaigns/route.ts` POST body through `getConnector`, `upsertCampaigns`, `listCampaigns`, `getSyncMeta`; replace the global `DELETE FROM campaigns` with `DELETE ... WHERE account_id = ?`; seed multiple accounts in `sample.ts` by salting the FNV seed with the account id (`hashStr(\`${accountId}:${period}\`)`).

## 4. Pluggable connector framework — Sklik & Meta behind one registry (moonshot)
- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: L (>3d)
- **File**: `src/lib/campaigns/connector.ts:16` — `AdsConnector` interface + `getConnector()`
- **Scenario**: `AdsConnector` is already a clean, platform-agnostic interface (`source`, `label`, `fetchCampaigns`) and `getConnector()` already does environment-driven provider selection. That is 80% of a connector *platform* — but today it hard-codes exactly two Google branches. The Czech market the case study targets lives on **Sklik** (Seznam) as much as Google, and performance teams want **Meta** too. The ideal end state: the dashboard is channel-agnostic and the AI assistant reasons across every paid platform at once.
- **Opportunity**: Promote `getConnector()` into a small registry: a `connectors/` folder where each platform (`google-ads`, `sklik`, `meta`) exports an `AdsConnector` plus a `detect()` predicate, and a `getConnectors()` that returns *all* credentialed providers. Normalise every platform's metrics into the existing `Campaign` shape (the `source` field already distinguishes them), persist with a `source` column already present in `sync_meta`, and let `aggregate()`/`groupByType()` in `types.ts` roll up cross-platform spend unchanged.
- **Impact**: Category-defining — turns a "Google Ads dashboard" into an omni-channel paid-media cockpit with one normalised model and one AI evaluator. The force multiplier is that every downstream feature (by-type breakdown, AI reports, the future snapshots/history) works for *any* added platform for free.
- **Implementation sketch**: Define `interface AdsProvider extends AdsConnector { detect(): boolean }`; move `sampleProvider`/`googleAdsProvider` into `connectors/google.ts`, add `connectors/sklik.ts` (sample-first, same throwing live seam) and `connectors/meta.ts`; add a `PLATFORM` union to `types.ts` and a `platform` column to `campaigns`; have `getConnectors()` map the registry through `detect()`; extend the POST route in `src/app/api/campaigns/route.ts` to loop providers and merge results before `upsertCampaigns`.

## 5. Scenario-injecting sample provider → a continuous "what-if" simulation lab (moonshot)
- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: `src/lib/campaigns/sample.ts:70` — `sampleCampaigns`; `src/lib/campaigns/store.ts:53` — `upsertCampaigns`
- **Scenario**: `sampleCampaigns` is already a tuned, seeded simulation — a believable Mionelo story where brand Search is hyper-efficient and Video/Demand Gen run below `TARGET_ROAS`. It is static: the same period always yields the same numbers. Combined with the (proposed) snapshot history and the existing AI evaluator, this provider is one step from being a **synthetic marketing environment** the AI can be tested and showcased against — a self-driving "optimisation lab" rather than a frozen demo.
- **Opportunity**: Make the sample provider scenario- and time-aware: accept a `scenario` ("baseline", " q4-peak", "ios-tracking-loss", "budget-cut") and a virtual "as-of" date that shifts the seed, so successive syncs produce an evolving story with planted anomalies (a Performance Max ROAS collapse, a Search CPC spike). Pair it with a tiny scheduler that auto-syncs + auto-evaluates, so the AI assistant narrates the unfolding scenario over time — a living demo that runs itself.
- **Impact**: Transforms the case study from a static screenshot into a **provably-working AI agent loop** (detect anomaly → evaluate → recommend), the most persuasive possible proof for a marketing-analytics product, and a reusable harness for regression-testing the AI evaluator against known-bad data.
- **Implementation sketch**: Add `sampleCampaigns(period, opts?: { scenario?: Scenario; asOf?: string })` that salts the mulberry32 seed with `scenario`+`asOf` and applies per-scenario multipliers onto the `SPECS` profiles; thread `scenario` through the connector and the POST body in `src/app/api/campaigns/route.ts`; reuse the snapshot table from idea #2 as the scenario's timeline; add a lightweight `scripts/auto-sync.mjs` (cron-style) that hits the sync + analyze routes so the loop runs unattended.
```