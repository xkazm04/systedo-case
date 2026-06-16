# Opportunity Fix Wave 1 — Surface what's already computed

> 3 commits, 5 findings closed (2 found already-implemented).
> Baseline preserved: 0 TS errors / 0 lint errors → 0 / 0.

## Commits

| # | Commit | Findings closed | Files |
|---|---|---|---|
| 1 | `35ee8fb` | significance on channel table; plottable ROAS/AOV/CR; Kč anomaly impact | metrics.ts, TrendChart.tsx, ChannelTable.tsx, DashboardClient.tsx |
| 2 | `8c60865` | hero data-freshness stamp | page.tsx |
| 3 | `02e33e0` | eval-cache visibility | useCampaigns.ts, ReportView.tsx, CampaignsClient.tsx, CampaignTable.tsx |

## What was fixed

1. **Channel significance** — `DeltaBadge` already accepted a `significance` prop but the channel table never passed one. Because each channel projects the totals by a *constant* share, a channel's revenue delta and its significance are mathematically identical to the aggregate, so `result.significance.revenue` drives every row badge + the Celkem footer. Statistical noise now renders muted instead of reading as a real trend.
2. **Plottable ratio metrics** — `dailyValue` already computed ROAS/AOV/CR per day and `totalsOf` derived them per bucket; they were only gated out by `plottable:false` metadata + omission from `TREND_METRICS`. Flipped the flag, added them to the toggle set, and generalized the chart's y-axis zoom (was PNO-only) to all ratio metrics via a new `RATIO_METRICS` set so efficiency movement isn't flat-lined at 0.
3. **Kč anomaly impact** — new pure `anomalyImpact()` sums each flagged day's already-present `observed − expected` into one revenue/cost/net figure (PNO breaches excluded to avoid double-counting). The alerts card now headlines "Odhadovaný dopad: −85 tis. Kč".
4. **Hero freshness** — derived `performance.daily.at(-1).date` and stamped the snapshot card so the static hero reads as live-to-a-date.
5. **Eval cache visibility** — the analyze route already returned `cached:true`; the hook now keeps the flag per key and `ReportView` shows a "Z mezipaměti" note on both portfolio + per-row reports.

## Already-implemented (no work needed — host-first/already-existed catches)

- **AI per-call cost/token telemetry** — already rendered in `ResultMeta` (primitives.tsx:139-173): token totals, `~$cost`, "předplatné · 0 $", and the "Samoopraveno" repaired badge. The *aggregate* spend/observability view is the genuinely-open Wave 4 item (`llm-wrapper.md`).
- **4th eval tool via /api/ai** — the campaign-eval tool (`generateCampaignEvaluation`) is already exposed and persisted through `/api/campaigns/analyze` with input-hash caching. Adding it to `/api/ai` would duplicate that route without user value (the generic route has no synced-campaign context). Deliberately skipped.

## Verification

| Gate | Before | After |
|---|---|---|
| `tsc --noEmit` | 0 errors | 0 errors |
| `eslint .` | 0 errors | 0 errors |
| pre-commit hook (eslint+tsc+LLM gate) | — | passed on all 3 commits |

## Patterns established (catalogue items 1–3)

1. **"Computed-but-discarded" is the cheapest value lever** — before building, grep whether the value already exists. 2 of 7 Wave-1 items were already shipped (cost telemetry, eval tool); 3 of the rest only needed a prop wired or a metadata flag flipped. Render/aggregate beats recompute.
2. **Constant-scaling invariant** — when a derived series is the base series times a constant (channel = total × share), its relative delta and statistical significance equal the base's. Reuse the aggregate figure instead of recomputing per-slice.
3. **Metadata gates hide finished features** — a `plottable:false` flag (not missing math) was the only thing keeping ROAS/AOV/CR off the chart. Audit boolean capability flags for finished-but-disabled features.

## What remains

Wave 2 (ground the AI in deterministic helpers — contains Critical #1) next.
