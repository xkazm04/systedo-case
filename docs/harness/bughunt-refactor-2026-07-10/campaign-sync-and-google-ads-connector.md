# Campaign Sync & Google Ads Connector

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. A degraded live→sample sync feeds demo numbers into the change-diff and fires real critical/anomaly alerts

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/campaigns/sync.ts:78` (append) → `:94`/`:107` (alerts); root cause spans `src/lib/campaigns/connector.ts:99-118` and `src/lib/campaigns/store.ts:106`,`:569`
- **Scenario**: A signed-in tenant on the live `googleAdsProvider` hits a transient Google outage during a sync. `googleAdsProvider.fetchCampaigns` (connector.ts:102-107) *catches* the error, sets `degradation.campaigns = true`, and returns `fallback.fetchCampaigns` — i.e. deterministic **sample** campaigns (different ids, different costs from the account's real campaigns). `fetchSeries` does the same (connector.ts:109-118) and, crucially, returns a non-empty sample series **without throwing**. Back in `runTenantSync`: `series` is set and `seriesOk` becomes `true` (sync.ts:58-59) even though the data is demo; `upsertCampaigns` unconditionally appends a `snapshots/{syncedAt}` doc built from the sample campaigns (store.ts:106-116); then `evaluateAndAlert(tenant, userId, sampleCampaigns, indexChanges(getLatestChanges(tenant)))` runs (sync.ts:94-99), and because `seriesOk` is `true`, `evaluateAnomalyAlerts(tenant, userId, sampleSeries)` runs too (sync.ts:105-107). `getLatestChanges` (store.ts:569) then diffs snapshot[now]=sample against snapshot[prev]=live: disjoint campaign ids ⇒ every real campaign shows as `removed`, every sample campaign as `added`, with ±100 % value deltas — and triage escalates those to **critical inbox alerts** on demo data. The `seriesOk` guard the pipeline relies on (sync.ts:103-104 comment) is defeated because the provider swallows the failure and substitutes sample data instead of propagating it.
- **Root cause**: degradation is recorded truthfully on the *source label* / root meta (`degraded`, `source: "sample"`), but the snapshot-append and the two alert steps never consult `connector.degradation`; they treat a degraded sync as an ordinary successful one.
- **Impact**: false CRITICAL alerts derived from demo numbers pushed to the user's inbox; the sync-over-sync change strip shows fabricated add/remove churn; and because the diff marker is folded into `hashEvalInputs` (store.ts:472), the garbage diff can also invalidate/poison the next paid AI evaluation prompt.
- **Fix sketch**: thread `degradation.campaigns` into `runTenantSync`; when the campaign fetch degraded, skip the snapshot append (or tag the snapshot `degraded: true` and have `getLatestChanges`/`listSnapshotSummaries` filter those out via the existing `belongsToPeriod`-style predicate) and skip `evaluateAndAlert`/`evaluateAnomalyAlerts`. Gate the anomaly call on `!degradation.series` rather than `seriesOk`.

## 2. `dateRange` is an inclusive off-by-one that returns days+1 calendar days including a partial "today"

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/google/ads.ts:319-324`
- **Scenario**: `dateRange(days)` computes `end = new Date()` (now) and `start = end - days*86_400_000`, then formats both with `toISOString().slice(0,10)`. Every GAQL query uses `segments.date BETWEEN '{start}' AND '{end}'`, which is **inclusive on both ends**. For `"7d"` (`CAMPAIGN_PERIOD_DAYS["7d"] = 7`) this yields e.g. `2026-07-03 … 2026-07-10` = **8** calendar days, and the last day is *today*, whose metrics are still accumulating. So the "7 dní" trend series returns 8 points and its newest point is a partially-elapsed day that looks like a cliff-drop versus the prior complete days. That partial-today point flows straight into `evaluateAnomalyAlerts(tenant, userId, series)` (sync.ts:107), which can read the normal intraday shortfall as a performance anomaly and raise a spurious alert; it also skews any "last day vs prior" comparison and per-period ROAS. Separately, `start`/`end` are UTC dates while Google Ads `segments.date` is in the **account** timezone (CZ = UTC+1/＋2), so near midnight the window is shifted by a day.
- **Root cause**: treating an inclusive `BETWEEN` as if it were a half-open `[start, end)` window, and anchoring `end` on the current instant rather than the last *complete* day.
- **Impact**: one extra day of data per period, a misleading partial-today data point, and false anomaly alerts on the live path (the sample path is unaffected, so live vs demo disagree on point count).
- **Fix sketch**: set `end` to yesterday (`now - 86_400_000`) and `start = end - (days-1)*86_400_000` for an inclusive window of exactly `days` complete days; format in the account's timezone (or document the exclusion of today explicitly).

## 3. The score-drop critical alert baseline is not period-scoped — switching periods fires a false "AI score dropped" alert

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/campaigns/store.ts:378-379` (baseline) and `:401-414` (alert)
- **Scenario**: `saveReport` picks `previous` as the last stored report filtered only by `scope` + `campaignId` — **not `period`** (store.ts:378-379). It then alerts when `previous.payload.score - response.result.score >= SCORE_DROP_ALERT_POINTS` (15). A user evaluates the overall portfolio for `90d` and scores 82, then re-runs the evaluation for `7d` (a legitimately different, noisier window) and scores 64. `drop = 18 ≥ 15`, neither report is demo, so a **critical inbox alert** "AI skóre kleslo o 18 bodů (82 → 64)" fires — but nothing regressed; the two scores describe different time windows and aren't comparable. The unfiltered `getReportHistory` timeline is intentionally cross-period, but the *regression alert* silently inherited that same filter.
- **Root cause**: the alert reuses `getReportHistory`'s period-agnostic filter, conflating a cross-period timeline read with a like-for-like regression comparison.
- **Impact**: false critical alerts on ordinary period toggles; erodes trust in the alert inbox and can mask genuine regressions in the noise.
- **Fix sketch**: add `&& r.period === period` to the `previous` filter at store.ts:378-379 so the baseline is the last report of the *same scope, campaign, and period*.

## 4. `customerId` is digit-normalized in only 2 of the 7 Ads REST fetchers

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/google/ads.ts:220` (raw) vs `:256` (`.replace(/\D/g, "")`)
- **Scenario**: `fetchAccountDailyRows` (ads.ts:256) and `keyword-planner.ts:65` sanitize `customerId` with `.replace(/\D/g, "")` before embedding it in the request path, but `fetchCampaigns` (:349), `fetchDailySeries` (:220), `fetchCampaignDailySeries` (:278), `fetchCampaignBudgets` (:157) and `pauseCampaign` (:120) interpolate the raw `customerId` straight into the URL. Today the only writer of stored connection ids is `POST /api/campaigns/accounts`, which already strips to digits (route.ts:68), so nothing triggers this now — but the invariant "`customerId` reaching ads.ts is digit-only" is enforced by convention at exactly one call site, not by the client. Any future writer (a bulk MCC import, an admin tool, a restored legacy doc with a dashed `123-456-7890`) would send `customers/123-456-7890/googleAds:searchStream` → a 404 that the connector silently swallows into a permanent, unexplained "degraded to sample" state.
- **Root cause**: the digit-normalization guard lives in the two newest fetchers and the route, not centralized at the client boundary the whole domain trusts.
- **Impact**: none today; a latent silent-failure trap if a non-normalized id ever enters `adsConnections`.
- **Fix sketch**: normalize once at the top of `searchStream` and each mutate/fetch helper (`const cid = customerId.replace(/\D/g, "")`), or normalize in `getConnectedAccount`/`getAdsConnection` so every consumer receives a clean id.

## 5. `fetchDailySeries` and `fetchCampaignDailySeries` duplicate the GAQL body and the per-row metric accumulation

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/google/ads.ts:205-233` and `:262-299`
- **Scenario**: The two functions share an all-but-identical GAQL query (`segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN …`, the second adding only `campaign.id`) and an identical four-line accumulation of a `DailyPoint` — `p.cost += Math.round(num(...costMicros)/1e6); p.conversions += num(...conversions); p.conversionValue += Math.round(num(...conversionsValue))` (ads.ts:226-230 vs :286-290) — plus the same final `[...values()].sort(byDate)`. This is distinct from the 2026-07-09 refactor report's finding #3, which covered only `API_VERSION`/`BASE`/`headers()`/`num()` shared between `ads.ts` and `keyword-planner.ts`; the intra-`ads.ts` series-aggregation duplication was not called out there.
- **Root cause**: the per-campaign variant was added by copy-editing the portfolio variant instead of factoring out the shared date-bucket accumulator.
- **Impact**: a change to the micros→CZK rounding rule, the metric set, or the sort must be made in two places; missing one silently diverges the portfolio trend from the per-campaign sparklines with no compiler signal.
- **Fix sketch**: extract `accumulateDailyPoint(map, dateKey, row)` (the shared `p.cost/conversions/conversionValue` folding) and a `SERIES_METRICS` GAQL fragment; have both functions build their `Map` through the shared accumulator, differing only in the group key (date vs campaign→date).
