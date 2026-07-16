# Metrics & Analytics Engine — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. Snapshot anomalies/trends are full-series while everything else is period-windowed — and the AI grounding already misreads them as "in period"
- **Severity**: High
- **Lens**: ambiguity
- **Category**: snapshot-period-scope-mismatch
- **File**: src/lib/metrics/snapshot.ts:119
- **Scenario**: `buildMetricsSnapshot` windows totals, deltas, buckets and channels to `period.days`, but `anomalies: detectAnomalies(data.daily, …)` and `trends: detectTrends(data.daily, …)` run over the WHOLE series. A consumer that treats the snapshot as "the state of this account for a period" (its own doc comment, snapshot.ts:41) will quote months-old events. This is not hypothetical: the AI grounding in `src/lib/snapshot.ts:279-289` takes the top-5 by |z| unfiltered and headlines them "Významné události v období" — a 7-day snapshot can ground the model on a spike from last quarter presented as this week's event. Meanwhile `snapshot-to-article.ts:189` DOES filter by `windowStart` — two consumers, two interpretations of the same field.
- **Root cause**: `MetricsSnapshot.anomalies`/`trends` carry no documentation that they are full-series (unlike `truncated`/`coverage`, which are carefully annotated), so each consumer guesses the scope.
- **Impact**: The "single artefact so dashboard, AI grounding and export reconcile by construction" contract is silently broken — the grounding text can assert an in-period anomaly that never happened in the period, which is exactly the class of falsehood the snapshot exists to prevent.
- **Fix sketch**: Either filter anomalies/trends to the period window inside `buildMetricsSnapshot` (with an opt-out if the full feed is wanted), or document the fields as full-series and fix the grounding writer to filter like `snapshot-to-article` does. One line of JSDoc plus one `.filter(a => a.date >= windowStart)` in lib/snapshot.ts is the minimal honest version.

## 2. Ratio-anomaly baseline mixes non-present days in as zero ratios, corrupting mean/std for sporadically-tracked paid traffic
- **Severity**: High
- **Lens**: ambiguity
- **Category**: baseline-zero-pollution
- **File**: src/lib/metrics/anomalies.ts:118-126
- **Scenario**: A dataset starts carrying impressions/clicks midway (paid channel launched, or the connector backfills only recent days), or the paid channel runs on some days only. The scored day is presence-gated (`if (!spec.present(daily[i])) continue;` line 120), but the baseline `adj.slice(i - window, i)` is NOT — absent days enter as `ctr(0,0) = 0` / `cpc(cost,0) = 0`. The code comment (lines 103-106) only reasons about the all-or-nothing case ("a series that never carried the pair yields an all-zero series … flags nothing"); the partial-coverage case is unhandled and undocumented.
- **Root cause**: `safe()` maps "no denominator" to 0, so "not measured" and "measured as zero" are indistinguishable downstream; the baseline window treats both as observations. The weekday weights (`weekdayWeightsOf`, line 117) are polluted the same way — absent days drag their weekday's average toward 0.
- **Impact**: A baseline of, say, 14 real CTR days + 14 zero placeholder days has roughly half the true mean and a wildly inflated std → every real day near launch reads as a huge spike (false "spike" anomalies in the feed and in the AI grounding), and once std is inflated, genuine CTR collapses stay under the z bar (masked drops). Money figures aren't hit (ratio anomalies don't feed `anomalyImpact`), but the alert feed loses credibility.
- **Fix sketch**: Build the ratio baseline from present days only: `const base = []; for (j = i-window; j < i; j++) if (spec.present(daily[j])) base.push(adj[j]);` and require a minimum present-count (e.g. ≥ ⌈window/2⌉, weekday-balanced if possible) before scoring; compute `weekdayWeightsOf` over present days for the same reason.

## 3. `AnomalyImpact.count` is documented as "days" but counts anomalies — a bad day is double-counted
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: doc-semantics-mismatch
- **File**: src/lib/metrics/anomalies.ts:170, 184-202
- **Scenario**: A single outage day typically fires BOTH a revenue drop and (often) a cost anomaly for the same date. `anomalyImpact` increments `count` once per revenue anomaly and once per cost anomaly, yet the interface doc promises "count of days carrying a monetary effect". A UI string like "dopad ≈ −85 tis. Kč za 3 dny" (the "3 upozornění → dopad" headline this function exists for, per its own JSDoc) reports 3 when the damage happened on 2 calendar days.
- **Root cause**: The loop keys on anomaly records, not distinct dates; nothing dedupes `a.date`.
- **Impact**: The headline overstated the number of affected days exactly on the worst days (the ones where cost and revenue both anomalied), which is when the number is most likely to be read and repeated to a client. Small, but it is a stated contract violated in the common case.
- **Fix sketch**: `const days = new Set<string>();` add `a.date` for revenue/cost anomalies and return `count: days.size` — or, if the anomaly count is the intended semantic, fix the doc comment to say "monetary anomalies", and rename to `anomalyCount` at the next schema bump.

## 4. Gappy-month pacing prescribes averaging over days that are already in the past
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: hidden-assumption-gap-days
- **File**: src/lib/metrics/pacing.ts:106-107, 138-143
- **Scenario**: The code deliberately counts `daysElapsed` as PRESENT days so a gappy month "doesn't read as further along than its data supports" (documented, lines 102-105). But the complement `daysRemaining = daysInMonth − daysElapsed` then silently counts the missing INTERIOR days — calendar days already behind "today" (the latest point) — as days still to come. On the 25th of a 30-day month with 5 interior gaps, `daysRemaining` is 10 while only 5 future days exist.
- **Root cause**: One variable serves two meanings: "days not yet covered by data" (right for the projection's weight ratio) and "future days you can still act on" (what `requiredDailyRevenue = max(0, goal − mtd) / daysRemaining` and `impliedExtraDailySpend` claim to be). The trade-off is documented for `daysElapsed` but its knock-on effect on the prescription fields is not.
- **Impact**: The steering numbers understate the true required daily pace and the extra spend needed (dividing the shortfall by phantom days), so an account that is recoverable-only-with-effort reads as comfortably recoverable — the opposite bias from the one the `daysElapsed` fix was protecting against. If gaps mean "data not yet synced" the projection side is fine, but the prescription is still wrong until the gaps fill.
- **Fix sketch**: Derive `futureDays = daysInMonth − dayOfMonth(last.date)` and use it for `requiredDailyRevenue`/`recentDailyRevenue`/`impliedExtraDailySpend`, keeping present-count `daysElapsed` for prorating/weights; or at minimum document on `daysRemaining` that interior gaps inflate it and the prescription fields inherit that.

## 5. Metric metadata copy and formatter fallback quietly break the en locale
- **Severity**: Low
- **Lens**: ui
- **Category**: i18n-inconsistency
- **File**: src/lib/metrics/meta.ts:26-28, 131
- **Scenario**: Two related seams in the locale story. (a) The Czech description for AOV reads `"Average order value = obrat / konverze."` — the only cs description that opens in English (compare `pno`: "Podíl nákladů na obratu…"); a Czech user hovering the AOV KPI tooltip sees mixed-language copy. (b) `format`/`formatCompact` take an OPTIONAL `Formatters` and silently fall back to the cs-CZ instance; any call site iterating `METRICS` that forgets to thread `useFormatters()` renders Czech digit grouping / "Kč" placement inside an otherwise-English UI, and nothing flags it — the fallback is invisible in types and at runtime.
- **Root cause**: (a) copy drift; (b) the backward-compatible default parameter makes "locale not plumbed" indistinguishable from "locale intentionally Czech".
- **Impact**: Minor but user-visible polish loss exactly on the surfaces (KPI cards, chart axes, tooltips) the meta module exists to keep consistent; new call sites will keep regressing silently.
- **Fix sketch**: Reword the cs AOV description ("Průměrná hodnota objednávky = obrat / konverze."); for the fallback, keep the default but add a lint-friendly wrapper (e.g. export `formatMetric(meta, v, formatters)` with a required `Formatters` for UI code, leaving the defaulted method for the cs-only snapshot/article writers), so forgetting the locale becomes a type error in components.
