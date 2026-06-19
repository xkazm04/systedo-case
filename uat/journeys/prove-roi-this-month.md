---
character: Petra (marketing manager)
goal: "Are we on track to this month's revenue goal — and if not, where's the problem?"
promotion: acceptance
seed: seeded performance dataset (npm run seed if needed); /kampane synced via sample provider for the channel/campaign drill-down
references:
  - https://funnel.io/blog/choose-the-right-dashboard-marketing-metrics — actionable KPI bar
---

## Trigger (why now)
It's mid-month and Petra has a leadership check-in this afternoon. She opens the app to find out, fast, whether the spend is paying off and what she'll say.

## Definition of done (her POV)
- Within ~1 minute she can state: are we **ahead or behind** the month's revenue goal, and by how much (pacing/forecast).
- She can name **which channel(s) or campaign(s)** are driving or dragging the result.
- She leaves with **one defensible decision or talking point** ("hold", "shift budget from X", "the dip is seasonal").
- Nothing on the way made her distrust the numbers (headline vs breakdown reconcile).

## Out of scope
- Editing campaigns or budgets (that's Tomáš's job).
- Authed `/app/[projectId]` tools.

## Discovery hints
Entry point: `/dashboard`. Likely drills into the trend chart, goal-pacing card, and the channel table; may cross to `/kampane` for the campaign-level "why". Do NOT script it — let Petra hunt for the "so what" and note every place she has to work for it.

## Frozen happy path  (acceptance gate, 2026-06-19)
Surface: `/dashboard` (seeded performance dataset). Steps:
1. Open `/dashboard`.
2. Read the headline KPI row (Návštěvy, Náklady, Konverze, Hodnota konverzí, PNO) — each with a period-over-period delta.
3. Read the monthly goal-pacing card.
4. Read the channel breakdown table.
5. Read the auto-insights ("Co stojí za pozornost").

Acceptance (must hold on re-run):
- ≤ ~8 headline KPI cards, each showing a delta against an explicit baseline ("srovnání s předchozím … obdobím").
- Channel table totals reconcile to the headline (Náklady, Hodnota konverzí, PNO, ROAS).
- At least one actionable auto-insight is present.

Known accepted frictions (do not re-raise as new): **F1** (goal-pacing shows the latest *complete* month, not live current-month — the forecast path is only exercised with mid-month data) and **F2** (per-channel ΔRevenue is uniform by data-model design). Tracked in `findings.json`.
