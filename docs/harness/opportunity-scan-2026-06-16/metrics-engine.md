# Metrics Analytics Engine — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Budget reallocation simulator — "what-if" on the channel mix
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/lib/metrics.ts (`channelRows`, `ChannelShare`, `Totals`)
- **Opportunity**: The engine already projects the channel mix onto period totals via fixed per-dimension `shares`, but it only ever shows the *current* allocation. There is no function to answer "if I move 15 % of cost from the worst-PNO channel to the best-ROAS channel, what happens to blended PNO/ROAS/revenue?" — the single highest-value question an agency client asks. A pure `simulateReallocation(channels, totals, moves[])` returning a new blended `Totals` + per-channel deltas is a natural extension of the existing share-projection math.
- **Value**: Turns a read-only reporting dashboard into a *decision* tool. This is the headline differentiator for a marketing-analytics pitch: clients pay for "what should I do," not "what happened." It also feeds the AI assistant a concrete, defensible recommendation instead of generic advice.
- **Effort**: M
- **Fix sketch**: Add `simulateReallocation(channels, totals, shifts: {from,to,fraction}[])` that re-derives each channel's cost/revenue under the shifted budget (holding each channel's own ROAS/CR constant), re-sums to a blended `Totals`, and returns `{before, after, perChannelDelta}`. Surface it as a slider UI and pass `after` into `snapshotToPromptText`.

## 2. No trend/slope detection — deltas are point-in-time, not directional
- **Severity**: High
- **Lens**: Both
- **Category**: functionality
- **File**: src/lib/metrics.ts (`evaluatePeriod`, `PeriodResult`, `significanceFor`)
- **Opportunity**: `evaluatePeriod` compares two equal windows (period-over-period), and `significanceFor` tests whether the means differ — but neither captures *within-window trajectory*. A period can be flat-vs-prior yet steadily deteriorating day-by-day (e.g. PNO creeping up across the current window). There is no linear-regression slope or "improving/worsening/stable" trend classification per metric, even though the daily series and `dailyValue` helper are right there.
- **Value**: "Revenue is up 8 % but the trend within the period is down" is exactly the early-warning insight that distinguishes a premium analytics product from a static report. It makes the AI grounding sharper and gives KPI cards a forward-looking badge, increasing perceived intelligence and retention.
- **Effort**: M
- **Fix sketch**: Add `trendOf(points, key): { slopePerDay, direction: "up"|"down"|"flat", r2 }` using a least-squares fit over `dailyValue(p, key)` against day index; classify direction by slope sign weighted against the metric's `goodDirection`. Add to `PeriodResult` and emit a `Trend` line in `snapshotToPromptText`.

## 3. Anomalies are detected but never quantified into a revenue/cost impact
- **Severity**: High
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/lib/metrics.ts (`detectAnomalies`, `Anomaly`)
- **Opportunity**: `detectAnomalies` produces dated spikes/drops/outages with `observed` and `expected`, but stops short of the number that matters: the *monetary* gap (`observed − expected`) summed across flagged days — i.e. "the 14.5. outage cost ~85 000 Kč in lost revenue." The raw material is already on each `Anomaly`; nothing aggregates it into a headline "events cost/gained you X" figure.
- **Value**: Quantified impact is the most shareable, screenshot-worthy output an agency can put in front of a client ("we caught a 120k Kč tracking outage in 24 h"). It directly justifies the agency's retainer and is a strong growth/word-of-mouth hook. Low incremental effort over data already computed.
- **Effort**: S
- **Fix sketch**: Add `anomalyImpact(anomalies): { metric, lostRevenue, extraCost, days }` summing `(observed − expected)` per metric over revenue/cost anomalies, and render a "dopad událostí" callout in both `snapshotToArticle` and `snapshotToPromptText`.

## 4. PNO/efficiency goal pacing exists only for revenue — no efficiency forecast
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/lib/metrics.ts (`monthlyPacing`, `MonthlyPacing`, `data.goals.pno`)
- **Opportunity**: `monthlyPacing` does a sophisticated seasonality-weighted month-end *revenue* projection with a confidence band and goal probability — but the dataset carries a second, equally important goal (`goals.pno`) that gets no pacing treatment. There is no "are we on track to land the month *under the PNO cap*?" forecast, even though the cost and revenue series needed for it are already in scope.
- **Value**: PNO/efficiency is the contractual KPI in Czech performance-marketing engagements (often more binding than absolute revenue). A month-end PNO projection with a "probability of breaching the cap" makes the product speak the agency's actual SLA language and surfaces a budget-throttling decision while there is still time to act.
- **Effort**: M
- **Fix sketch**: Generalise the pacing math into a projected month-end `cost` and `revenue` (reuse `weekdayWeightsFor` for both), then derive `projectedPno = projCost / projRevenue` and a breach probability vs. `goals.pno`. Add fields to `MonthlyPacing` and a pacing line keyed on PNO.

## 5. Channel data is a static share table — no per-channel time series or trends
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: differentiation
- **File**: src/lib/types.ts (`ChannelShare`), src/lib/metrics.ts (`channelRowsCompared`)
- **Opportunity**: `ChannelShare` stores one fixed fraction per dimension, so every channel is assumed to hold a *constant* share of every day. `channelRowsCompared` can therefore only ever report the same proportional delta for two channels that share a dimension — it cannot show that "Sklik's revenue share is eroding week over week" or chart a single channel's trend. The whole channel layer is a snapshot with no real temporal dimension.
- **Value**: Per-channel trajectory is the core of channel-mix optimization and the most common drill-down clients request. Modeling time-varying shares (or a true per-channel daily series) unlocks channel trend charts, per-channel anomaly detection, and a far more credible "shift budget to the rising channel" recommendation — a meaningful step up in product depth and defensibility.
- **Effort**: L
- **Fix sketch**: Extend `ChannelShare` with an optional `dailyShares: Record<dim, number[]>` (or a per-channel `daily` series) in the dataset/seed, then add `channelSeries(channels, daily, channel)` returning a per-day `Totals` so the existing `bucketize`/`trendOf` machinery applies per channel.
