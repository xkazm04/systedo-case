# Fix Wave 1b — Surface Analytics in the Dashboard UI

> 5 atomic commits. Everything Wave 1 built is now visible on `/dashboard`.
> Baseline preserved: 0 TS / 0 lint → 0 / 0. Production build ✓. `/dashboard` still
> prerenders statically. The dashboard-comparison Playwright selectors are intact
> (markers are `<rect>`, so the one pinned dashed overlay path is unaffected).

Date: 2026-06-15. Closes the "built-but-unwired" gap left by Wave 1 — the analytics
core was wired into the AI grounding but not yet rendered for a human.

## Commits

| Commit | What |
|---|---|
| `b293fc4` | KpiCard/DeltaBadge: dim noise-significant deltas (muted, not green/red) |
| `1011d97` | ChannelTable: "Změna obratu" column via channelRowsCompared + DeltaBadge |
| `066a6c3` | GoalPacing: P10–P90 confidence whisker + "X% šance na splnění" readout |
| `0d88b70` | TrendChart: diamond anomaly markers (favourable/coral) + tooltip reason |
| `b07374e` | DashboardClient: "Upozornění" anomaly feed in the side rail |

## What it looks like now

- **KPI cards** — a delta the engine judged statistically insignificant renders muted
  with a "v rámci běžného kolísání" tooltip, instead of a confident green/red pill.
- **Channel table** — a new column shows each channel's period-over-period revenue
  movement (and the portfolio total in the footer), so the table reads for momentum.
- **Goal pacing** — the forecast now shows a confidence interval (whisker + projection
  dot on the gauge axis) and a goal-attainment probability, not a single certain point.
- **Trend chart** — anomalous days carry a diamond marker (brand if the move is
  favourable for that metric, coral if not) with the reason in the hover tooltip.
- **Side rail** — an "Upozornění" feed lists the most severe flagged days (date,
  metric, reason), with a count badge: the dashboard tells you what changed.

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 (per commit) |
| `eslint .` | 0 |
| `next build` | ✓ (`/dashboard` static) |
| dashboard-comparison.spec selectors | preserved (legend / single dashed path / tooltip "Předchozí") |

## Patterns established (catalogue, cont.)

9. **Wire what you build, same wave or the next** — pure analytics with no surface is
   the "built-but-unwired" anti-pattern; a follow-up UI pass (1b) is the discharge.
10. **Markers as shapes, not styled lines** — when a test pins a specific stroke style,
    add new overlays as a different primitive (`<rect>` diamonds) so selectors hold.
11. **Show uncertainty, not just point estimates** — a forecast band + probability reads
    as honest where a single number reads as a (false) promise.

## What remains
- Other open waves (per INDEX): 2 (steering), 3 (persistence), 4 (AI content), 6
  (locale), 7 (pipeline/SEO). Done so far: Wave 5, Wave 1, Wave 1b.
- Optional: port the side-rail `buildInsights` (still inline JSX in DashboardClient)
  into the engine as structured data, per metrics-engine.md #5.
