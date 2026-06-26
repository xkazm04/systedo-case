# Trend Chart & Channel Breakdown — Ambiguity + Business scan
> Context: Dependency-free SVG trend chart (switchable metrics + faint previous-period overlay) plus a channel-mix table that reconciles to headline totals.
> Files analyzed: 3 (TrendChart.tsx, ChannelTable.tsx, dashboard-comparison.spec.ts) + 6 adjacent type/format modules read for grounding
> Total findings: 5

## 1. Every channel row shows the identical revenue delta (constant-share projection)
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: M
- **File**: src/components/dashboard/ChannelTable.tsx:113 (and src/lib/metrics/channels.ts:60)
- **Problem/Opportunity**: `channelRowsCompared` projects every channel as a fixed share of the period totals, so each row's `delta.revenue = rel(total.revenue*share, prevTotal.revenue*share)` algebraically reduces to the aggregate revenue delta — the `share` cancels. Result: the per-row `DeltaBadge` (ChannelTable.tsx:113-121) renders the *exact same* percentage for Sklik, Google Ads, Heureka, organic and the Total footer (ChannelTable.tsx:138-145). The `channels.ts:46` comment even advertises a differentiated example ("Sklik obrat +18 %") that the math can never produce. The constant-share assumption is documented in code (ChannelTable.tsx:51-55) but never surfaced to the viewer.
- **Why it matters**: This is the centerpiece of a marketing-agency case study; a prospective client who notices five identical +12,4 % badges immediately reads the data as synthetic, undermining the credibility the demo is built to project.
- **Fix sketch**: Either (a) honest-minimal — drop the per-row revenue `DeltaBadge` and keep only the footer total, since per-row carries zero extra information; or (b) higher-fidelity — give channels independent share drift over time in the seed data (`src/lib/project-data/*` / `data.ts`) so `channelRowsCompared` yields genuinely different per-channel deltas. Not gate-triggering (no LLM files touched).

## 2. Turn the hover tooltip into an "Vysvětlit tento bod" entry point to the AI assistant
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/components/dashboard/TrendChart.tsx:380
- **Problem/Opportunity**: The tooltip already assembles everything a "why did this happen?" question needs — the bucket date, the metric value (`tipBucket[metric]`), the period-over-period delta (`cmpDelta`, TrendChart.tsx:181), and any anomaly reason (`activeAnomaly` / `anomalyReason`, TrendChart.tsx:172/189). The app's headline differentiator is its AI marketing assistant, yet this rich, in-context data point is presently read-only.
- **Why it matters**: A single in-tooltip action that hands the hovered point to the existing assistant converts a passive chart into the product's flagship workflow ("proč obrat 12. 5. spadl?"), which is exactly the differentiation a marketing agency wants to showcase.
- **Fix sketch**: Add a small pointer-enabled "Vysvětlit" button in the tooltip (the wrapper is currently `pointer-events-none`, TrendChart.tsx:383) that routes a prefilled question to the existing assistant UI rather than calling the model directly — this keeps it out of the hashed LLM files. If it instead posts to `src/app/api/ai/route.ts`, it becomes **gate-triggering**.

## 3. Component assumes a non-empty series; an empty `data` array throws on render
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/components/dashboard/TrendChart.tsx:180
- **Problem/Opportunity**: `active = hover ?? n - 1` (TrendChart.tsx:171), `tipBucket = data[active]` (174) and `curVal = tipBucket[metric]` (180) run on *every* render, not just on hover. When `data` is empty, `n-1` is `-1`, `data[-1]` is `undefined`, and line 180 throws. This is reachable: `evaluatePeriod` caps the window to `Math.floor(n/2)` (series.ts:83), so a very short seed makes `result.points` — and therefore `buckets` — empty. `dataMin = Math.min(...domainValues)` also silently becomes `Infinity` for an empty series (TrendChart.tsx:120). The "data is non-empty" precondition is undocumented.
- **Why it matters**: A hard render crash with no guard is a latent footgun the moment the dataset, period config, or a future data source shrinks below the window — and it fails on the dashboard's main visual, not gracefully.
- **Fix sketch**: Early-return a muted empty-state placeholder when `n === 0` (right after `const n = data.length;`, TrendChart.tsx:85), and document the non-empty precondition in the props JSDoc. Not gate-triggering.

## 4. The comparison tooltip shows a previous value but never says which date it is
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/components/dashboard/TrendChart.tsx:406
- **Problem/Opportunity**: The overlay's whole purpose is period-over-period comparison, but the tooltip's "Předchozí 1,2 mil." row (TrendChart.tsx:403-419) gives no date for that prior value. The overlay is index-aligned, so point *i* of the current series sits over point *i* of the previous window — meaning the comparison date is knowable (the chart already receives `compare` buckets, each carrying `.date`, TrendChart.tsx:60), it just isn't shown. The user is left to infer "compared to when?".
- **Why it matters**: An unlabeled comparison value is ambiguous and erodes trust in the delta; making the reference date explicit turns a vague number into a verifiable one — exactly what an analytics tool should do.
- **Fix sketch**: When `cmpVal !== undefined`, render the matching `compare[active]?.date` via `fmtX`/`fmtDateShort` next to the "Předchozí" label (TrendChart.tsx:405-408). Mind the cs-CZ JSX quote rule if any literal quotes are added. Not gate-triggering.

## 5. `pnoTone` color bands rest on undocumented magic multipliers (1.05 / 1.6)
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/components/dashboard/ChannelTable.tsx:32
- **Problem/Opportunity**: `pnoTone` (ChannelTable.tsx:30-37) decides whether a channel's PNO renders green / neutral / coral using `goal * 1.05` ("on plan" tolerance) and `goal * 1.6` ("over budget"). These thresholds encode a real business judgement — a 5 % tolerance band and a 60 %-over "bad" line — with no recorded reasoning and no configurability. The same `1.6` magic number is independently reused as `gaugeMax` in DashboardClient.tsx:242, so the two can silently drift apart.
- **Why it matters**: A color that tells a client "this channel is over budget" is a meaningful signal; the cutoff that triggers it being an unexplained literal makes the rule hard to defend, tune, or keep consistent across the dashboard.
- **Fix sketch**: Lift the two multipliers into named, commented constants (e.g. `PNO_TOLERANCE = 1.05`, `PNO_ALERT = 1.6`) — ideally co-located with the goal config so the gauge and the table share one source of truth — and add a one-line rationale. Not gate-triggering.
