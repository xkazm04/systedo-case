# Google Ads Connector & SQLite Store — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Close the live Google Ads seam — turn the demo into a "connect your account" product
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/lib/campaigns/connector.ts (`googleAdsProvider.fetchCampaigns`)
- **Opportunity**: The single well-marked seam in `googleAdsProvider.fetchCampaigns()` currently throws; the env-var contract (`GOOGLE_ADS_ENV`: developer token, client id/secret, refresh token, customer id) and `getConnector()` dispatch are already built. Wiring a GAQL `campaign + metrics` query over the period maps 1:1 onto the existing `Campaign` shape.
- **Value**: This is the difference between a portfolio piece and a sellable SaaS. A prospect connecting their own account during a sales demo sees their real spend and AI verdicts — the highest-conviction conversion event the agency can engineer. The connector interface (`AdsConnector`, `source: "sample" | "google-ads"`) already proves the data is provider-agnostic, so live data flows through every downstream feature (store, diffing, AI eval) with zero UI rework.
- **Effort**: M
- **Fix sketch**: Add the `google-ads-api` client in `googleAdsProvider.fetchCampaigns(period)`, run a GAQL query (`campaign.id/name/advertising_channel_type/status` + `metrics.impressions/clicks/cost_micros/conversions/conversions_value`) bounded by `CAMPAIGN_PERIOD_DAYS[period]`, map `cost_micros / 1e6` into `Campaign.cost`, and reuse the existing throw as the fallback for partial credentials.

## 2. Multi-account / MCC support — the store is hardcoded to a single advertiser
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: src/lib/campaigns/store.ts, src/lib/db.ts (schema), connector.ts
- **Opportunity**: Every store function assumes one global tenant: `upsertCampaigns` does `DELETE FROM campaigns` (wipes all), `sync_meta` is pinned to `id = 1`, and there is no account/customer column. An agency managing dozens of clients under one Google Ads MCC cannot hold two accounts at once.
- **Value**: Agencies — the actual buyer here — live in MCC-land; single-account is a non-starter for them. Adding an `account_id` dimension converts this from a one-client case study into a multi-client console the agency runs as its own internal product, and unlocks per-client billing/seats (monetization). It also future-proofs the AI report cache, which already keys on scope/campaign/period but not account.
- **Effort**: L
- **Fix sketch**: Add `account_id` to `campaigns`, `sync_meta` (drop the `CHECK (id = 1)` for a composite PK), `reports`, and `campaign_snapshots`; thread an `accountId` param through `upsertCampaigns`/`listCampaigns`/`getReportsForPeriod`/`getLatestChanges`; scope the `DELETE FROM campaigns` to `WHERE account_id = ?`; surface MCC customer IDs from `GOOGLE_ADS_CUSTOMER_ID` as a selectable list.

## 3. Data export (CSV / JSON) of campaigns + AI reports — a missing power-user + lead-gen surface
- **Severity**: High
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/app/api/campaigns/route.ts (new `/export` sibling), store.ts
- **Opportunity**: All the data needed for export already lives in the store (`listCampaigns`, `getReportsForPeriod`, `getReportHistories`, `getLatestChanges`) and `withMetrics`/`aggregate` in types.ts derive the ratios — but there is no download endpoint. A marketer cannot pull the synced table or the AI verdicts into a spreadsheet or a client deck.
- **Value**: Export is the #1 power-user ask in analytics tools and a quiet growth lever: an exported CSV/PDF with the AI verdict and the agency's branding travels into the client's inbox and internal decks, doing referral marketing for free. It is also the cheapest credibility signal in a sales demo ("yes, you can take the data with you").
- **Effort**: S
- **Fix sketch**: Add `GET /api/campaigns/export?format=csv|json` that calls `listCampaigns().map(withMetrics)` plus `getReportsForPeriod(meta.period)`, streams a `text/csv` (or JSON) body with `Content-Disposition: attachment`, and reuses the existing `clientIp`/`rateLimit` guard from route.ts.

## 4. Historical snapshot time-travel — the data is captured but only the last two syncs are readable
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/lib/campaigns/store.ts (`campaign_snapshots`, `getLatestChanges`)
- **Opportunity**: `upsertCampaigns` already writes an append-only `campaign_snapshots` row per sync (status/cost/conversions/value with `synced_at`), and `idx_snapshots_time` indexes it — but `getLatestChanges` only ever reads the two newest batches (`ORDER BY synced_at DESC LIMIT 2`). The full history sits on disk, unused, with no "compare to 30 days ago" or trend-over-syncs read path.
- **Value**: The expensive part (durable, indexed capture) is done; the visible feature (pick any two sync dates, or chart cost/ROAS across all syncs) is one query away. Time-travel comparison is exactly the "is this campaign improving?" question agencies answer weekly, and it makes the snapshot table earn its storage instead of being silent overhead.
- **Effort**: M
- **Fix sketch**: Add `listSnapshotDates()` and a parameterized `getChangesBetween(sinceAt, currentAt)` that generalizes the existing `loadBatch`/diff logic in `getLatestChanges`, plus a `getSnapshotSeries(campaignId)` returning every `(synced_at, cost, conversion_value)` for a per-campaign trend.

## 5. Sample-data realism: add seasonality, daily series, and a Sklik/Meta connector profile
- **Severity**: Medium
- **Lens**: Both
- **Category**: feature
- **File**: src/lib/campaigns/sample.ts, connector.ts (`AdsConnector`)
- **Opportunity**: `sampleCampaigns` is well-seeded (mulberry32 + FNV-1a) but flat: metrics scale linearly with `days` and apply only ±5% jitter, so there is no weekly seasonality, no day-by-day series (snapshots only ever capture one point per sync), and exactly one provider profile. For a Czech e-shop (`Mionelo`), Sklik is as relevant as Google Ads, yet `AdsConnector.source` only allows `"sample" | "google-ads"`.
- **Value**: Richer demo data makes the AI evaluation and the change-diff visibly smarter (real-looking weekend dips, a campaign that degrades over time), which is what sells the analytics narrative. A second `source` (Sklik/Meta) — even sample-only — demonstrates the multi-channel story Czech agencies need and proves the connector abstraction generalizes beyond Google, a concrete differentiation talking point.
- **Effort**: M
- **Fix sketch**: In `sample.ts`, emit a per-day metric series (weekday seasonality curve + a slow trend term seeded off the day index) and aggregate to the period; widen `AdsConnector["source"]` to include `"sklik" | "meta"` with a `sampleSklikCampaigns` profile, and have `getConnector()` honor a `CONNECTOR_SOURCE` env hint when live creds are absent.
