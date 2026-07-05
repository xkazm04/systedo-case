---
character: Ondřej (performance ad-ops manager)
goal: "Find the budget moves that lift the portfolio, see the projected impact, apply them as a governed change-set I can approve and revert, all audited."
promotion: discovery
seed: authed local mode → demo-eshop → Campaigns (/kampane) with sample sync → Budget Moves, Control Plane, Alerts, Activity
references:
  - https://support.google.com/google-ads/answer/2375454 — safe budget-management bar
---

## Trigger (why now)
Weekly reallocation. Ondřej needs to move spend from under-performers to winners before the week runs, but only if he can see the projected impact and undo it if it backfires — with a log for the client.

## Definition of done (his POV)
- Budget-move recommendations with a credible *projected* portfolio ROAS/PNO lift (a model, not a vibe).
- A governed flow: bundle → simulate → approve → apply → revert, with policy guardrails.
- A per-change audit / activity trail (who/what/when), and deduped, ranked, actionable alerts.
- The whole thing faster *and* safer than his manual Google Ads edits.

## Out of scope
- Applying changes to a real Google Ads account (simulated/local apply is fine for the flow).

## Discovery hints
Entry: /kampane → sync sample data → Budget Moves / Control Plane / Alerts / Activity. Don't script — judge whether recommendations carry a real projection, whether apply is reversible and audited, and whether alerts are noise or signal.

## Frozen happy path
_(filled in on `promote`)_
