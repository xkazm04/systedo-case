---
character: Petra (marketing manager)
goal: "Are we on track to this month's revenue goal — and if not, where's the problem?"
promotion: discovery
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

## Frozen happy path
_(filled in on `promote`)_
