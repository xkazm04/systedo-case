# UAT scorecard — 2026-06-19 (pilot discovery)

**Scope:** pilot validation of the loop — 1 Character × 1 journey on a public surface, no model calls.
**Driver:** Playwright/chromium against the running dev server (:3012). Evidence in `shots/`.

| Character | Journey | Surface | Status |
|-----------|---------|---------|--------|
| Petra (marketing manager) | prove-roi-this-month | /dashboard | **Completed-with-friction** |

## Confirmed findings

| id | type | sev | one-liner |
|----|------|-----|-----------|
| F1 | quality-gap | **major** | Goal-pacing card answers about a *closed past month*, not "this month" — Petra's core question goes unanswered mid-month. |
| F2 | trust | **major** | Per-channel ΔRevenue is identical (+8,9 %) for every channel — column is non-informative *by design* (`ChannelTable.tsx:26-30`). |
| F4 | confusion | polish | PNO "Cíl splněn" vs "pod cílem 15 %" reads as contradictory to a non-expert. |

## Needs verification (appendix)

| id | type | sev | verdict | note |
|----|------|-----|---------|------|
| F3 | quality-gap | minor | uncertain | "Upozornění 175": large count, dates outside the selected window, no prioritization — needs a code check on the anomaly source. |

## What passed (recorded so the scorecard isn't only negative)
- Focused, deltaed headline KPIs (~5 cards) — meets the 5–10 actionable-KPI bar.
- Deltas carry an explicit baseline ("vs předchozí stejně dlouhé období") — clears her "up vs *what*?" peeve.
- Channel breakdown **reconciles** to headline totals — clears her trust bar on levels.
- Auto-insights give real "so what" takeaways.

## Why this validates the approach
- **F1 is invisible to feature/code tests.** Every KPI is technically correct; the dataset is internally consistent; an e2e suite would be green. Yet the product fails the user's actual job ("am I on track *this* month") because of *what it chooses to show*, not a broken assertion. Only a Character with a real trigger surfaces it.
- **The hybrid code-check earned its keep on F2.** Driven naively it looks like a render bug ("all rows +8,9 %?!"). The code cross-check (`ChannelTable.tsx:26-30`) reframes it precisely: intentional in the data model, therefore a *trust/design* gap, not a bug — and gives a concrete, correct fix. That reframing is the difference between an actionable finding and noise.

## Next
- Triage F1/F2 with the owner; F2 has a clean fix (vary channel shares in the seed, or relabel the column).
- Extend the pass: Tomáš × react-to-flagged-campaign on /kampane (deterministic sample), then Eva × the AI brief→article loop (budget for real model calls).
- Resolve the authed-product env questions in `env.md` to cover `/app/[projectId]/*`.
- Once a journey runs clean on a stable path, `/uat promote` it into the regression gate.
