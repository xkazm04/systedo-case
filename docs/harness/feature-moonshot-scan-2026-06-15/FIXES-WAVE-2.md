# Fix Wave 2 — Steering Layer (systedo-case)

> 2 atomic commits. The campaign console goes from diagnosis (triage) to
> prescription (quantified budget moves + projected impact).
> Baseline preserved: 0 TS / 0 lint → 0 / 0. Production build ✓. Deterministic, no AI.

Date: 2026-06-15. Closes the steering theme's grounded core on the campaign console,
where real per-campaign data lives (the dashboard channel simulator was deprioritised
because channel shares are static — see "What remains").

## Commits

| Commit | Fix | Finding |
|---|---|---|
| `6250a44` | `simulateBudgetShift` (pure) | campaign-model-prompts #5 |
| `757ee9b` | `recommendBudgetMoves` + console panel | campaign-console-ui #1 (Critical) |

## What was built

1. **`src/lib/campaigns/simulate.ts`** — `BudgetMove` + `simulateBudgetShift(rows, moves)`:
   reapplies each spend shift at the donor/recipient's *own* current efficiency
   (linear marginal model) and re-runs `aggregate`, so a projected portfolio ROAS/PNO
   is computed the identical way the live totals are. Pure, reconciles by construction.
2. **`src/lib/campaigns/budget-moves.ts`** — `recommendBudgetMoves(rows)`: pairs the
   worst under-target spenders (ranked by *wasted spend* = `cost × (1 − roas/target)`)
   with the best over-performers (best ROAS first), each used once, proposing a tidy
   shift with an estimated value gain. Returns the moves + a `simulateBudgetShift`
   projection. Reuses `TARGET_ROAS` so it can't disagree with the table colours.
3. **`BudgetMoves.tsx`** — a "Doporučené přesuny rozpočtu" panel under the by-type
   breakdown in the console: each move as "Přesunout X Kč z A (ROAS …) → B (ROAS …),
   odhad +Y Kč", a before→after impact strip (ROAS / PNO / value), and an honesty
   caption that it's a linear estimate. A "bez AI · okamžité" badge sets expectations.

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 (per commit) |
| `eslint` | 0 |
| `next build` | ✓ (`/kampane` dynamic) |
| LLM gate | cached pass (no LLM code touched) |

## Patterns established (catalogue, cont.)

12. **Diagnosis → prescription** — a triage layer that classifies should be paired
    with a deterministic recommender that says *how much to move where*; reuse the
    same target constant so advice and colours never disagree.
13. **Recommend → simulate, same math** — a recommendation's projected impact must be
    computed with the live aggregation (`aggregate`), not a parallel formula, so the
    "after" reconciles with how the dashboard would actually total it.
14. **Caption the estimate** — a linear projection is honest only if the UI says so;
    a "bez AI · okamžité" badge + an "ověří další synchronizace" note set expectations.

## What remains (steering theme)

- **Dashboard "Co kdyby?" channel simulator** (dashboard-kpis #4, Critical) —
  deprioritised: the dashboard's channel shares are *static fractions*, so a slider
  reallocation there mirrors totals rather than reflecting real per-channel response
  curves. Worth doing once the dataset carries per-channel daily series (Wave 3 /
  performance-dataset #1).
- **Recommend → simulate → *measure*** (campaign-model #5 full) — persist the projected
  target next to the report and, on the next sync, score advice as met/unmet. Needs
  the persistence + diff history from Wave 3 (`campaign_snapshots`).
- **Autonomous optimization agent** (campaign-console #5, Critical moonshot) — typed
  mutations + apply-through-connector + audit log. Standalone multi-day goal.

Other open waves (INDEX): 3 (persistence), 4 (AI content), 6 (locale), 7 (pipeline/SEO).
Done: Wave 5, Wave 1, Wave 1b, Wave 2.
