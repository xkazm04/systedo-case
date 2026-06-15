# Fix Wave 1 — Analytics Core (systedo-case)

> 5 findings closed across 5 atomic commits. The pure analytics engine now detects
> anomalies, scores delta significance, compares channels over time, forecasts with
> a confidence band, and exposes one canonical MetricsSnapshot contract — wired into
> the AI grounding.
> Baseline preserved: 0 TS / 0 lint → 0 / 0. Production build ✓. Dashboard renders
> identically (pure additions + server-side wiring only).

Date: 2026-06-15 · The convergent theme of the scan: `detectAnomalies` was
independently proposed by 5 contexts. Wave 1 builds that primitive and the
analytics contract the other waves lean on.

## Commits (atomic, per finding)

| Commit | Fix | Finding |
|---|---|---|
| `e2420fc` | detectAnomalies — de-seasonalised spike/drop/outage + PNO goal-breach | metrics-engine #3, trend-chart #5 (Critical) |
| `5a5a54d` | statistical significance on every delta | metrics-engine #2 |
| `6f0d779` | channelRowsCompared — per-channel period deltas | metrics-engine #1, trend-chart #2 |
| `b773895` | forecast confidence band + goal probability | metrics-engine #4 |
| `3d3354b` | MetricsSnapshot contract + richer AI grounding | metrics-engine #5 (Critical) |

## What was built (all pure, in `src/lib/metrics.ts`)

1. **`detectAnomalies(daily, goals, opts?)`** — de-seasonalises each additive metric
   by its weekday weights, then flags days beyond a z threshold from a trailing
   rolling baseline as `spike | drop | outage`, plus `goal-breach` for PNO days
   actually driven by a cost spike / revenue collapse (not normal variance).
   Generalised `weekdayWeights` → `weekdayWeightsFor(daily, key)`.
2. **Delta significance** — `evaluatePeriod` now returns
   `significance: Record<MetricKey,"strong"|"weak"|"noise">` from a two-sample
   normal-approx of the daily values (per-day value derived for every metric incl.
   ratios). So "+6 % on 7 noisy days" reads differently from "+6 % on 90 days."
3. **`channelRowsCompared(channels, current, previous)`** — channel rows carrying a
   per-metric `delta` (optional field on `ChannelRow`; existing `channelRows`
   callers untouched). `rel()` factored to module scope.
4. **Forecast band** — `monthlyPacing` adds `projectionLow`/`projectionHigh` (P10/P90)
   and `goalProbability` (normal CDF) from the de-seasonalised daily-revenue σ scaled
   by √daysRemaining. The `willHitGoal` boolean becomes a probability + a band.
5. **`MetricsSnapshot` contract** — `buildMetricsSnapshot(data, period)` bundles
   totals, deltas + significance, buckets, compared channels, anomalies, and the
   pacing band into one versioned (`schemaVersion`) artefact. **Wired into
   `snapshot.ts`**, so the AI analysis prompt now carries per-delta significance,
   channel movement, the month-end projection range + goal probability, and the top
   dated anomalies — concrete, confidence-aware events instead of period averages.

## Verification

| Gate | Before | After |
|---|---|---|
| `tsc --noEmit` | 0 | 0 (checked per commit) |
| `eslint` | 0 | 0 |
| `next build` | ✓ | ✓ |
| LLM gate | cached pass | cached pass (no LLM code touched) |
| Existing Playwright e2e | n/a (not run) | unaffected — no UI behavior change |

## Patterns established (catalogue, cont.)

5. **Convergent-primitive first** — when N contexts independently propose the same
   helper (`detectAnomalies` ×5), build the primitive once in the pure layer and let
   every consumer share it, rather than N bespoke versions.
6. **De-seasonalise before judging** — any per-day anomaly/σ over this series must
   divide out `weekdayWeightsFor` first, or weekend lows read as drops.
7. **Significance over raw deltas** — a delta without a confidence signal over-claims;
   carry `strong|weak|noise` so UI/AI can mute noise.
8. **One snapshot contract** — consumers (dashboard, AI, future export) should read a
   single versioned `MetricsSnapshot`, not each re-derive totals/insights, so they
   reconcile by construction.

## What remains — Wave 1b (UI surfacing)

The analytics core is built and consumed by the AI grounding, but the **dashboard UI
does not yet render** the new signals. Deferred, low-risk, additive UI work:
- `TrendChart.tsx`: draw anomaly markers (reuse the hover-marker style) + reason in
  the tooltip; an "Upozornění" feed in the side rail.
- `KpiCard.tsx` / `DeltaBadge.tsx`: dim the delta pill when `significance === "noise"`.
- `ChannelTable.tsx`: a delta column using `channelRowsCompared` + the existing
  `DeltaBadge`.
- `GoalPacing.tsx`: shade the `projectionLow..projectionHigh` band + a `goalProbability`
  readout.
- Optionally port the UI's inline `buildInsights` into the engine as structured data.

Other open waves (per INDEX): 2 (steering), 3 (persistence), 4 (AI content), 6
(locale), 7 (pipeline/SEO). Wave 5 (API hardening) already done.
