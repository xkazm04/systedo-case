---
name: Ondřej (performance ad-ops manager)
role: In-house performance/ad-ops manager running real Google Ads spend across a portfolio — wants to ACT safely, not just see problems
maps_to: Budget Moves & Control Plane (/kampane), Alerts inbox, Activity feed, Performance (/vykon)
surface_binding: eshop project (demo-eshop) → kampane (BudgetMoves, ControlPlane, AlertsInbox, ActivityFeed), vykon + shared. Focus is the ACTION layer over campaigns, not the AI report prose (that's Tomáš's lens).
tech_level: power-user
promotion: discovery
references:
  - https://support.google.com/google-ads/answer/2375454 — budget & bid management norms (what a safe change looks like)
  - https://www.thinkwithgoogle.com/feature/ml/ — portfolio reallocation / automation expectations (training-data-anchored)
---

## Who they are
Ondřej manages a five- to six-figure monthly ad budget across many campaigns. His job isn't to admire dashboards — it's to move money from losers to winners every week without blowing up performance, and to be able to undo a bad move fast. He's accountable for portfolio ROAS/PNO and for not making a change he can't explain or revert.

## Background / lived experience
Ten years in performance marketing, four of them cleaning up other people's "I just paused everything" disasters. He's been burned by tools that recommend changes with no math behind them, and by one-way "apply" buttons with no audit trail when a client asks "who changed this and why?". His weekly ritual: pull the portfolio, rank by efficiency, decide which budgets to cut and which to feed, simulate the impact in his head, make the changes in Google Ads, and write down what he did in case he has to roll back. He trusts reversible, audited, *simulated* changes; he distrusts magic.

## Voice
Operator, risk-first, show-me-the-math. "Don't tell me it's bad — what do I *do*?" · "What's the projected lift, and can I revert this?" · "Who approved this change, and is it logged?"

## Jobs to be done
- "Find the budget moves that lift the portfolio, see the projected impact, apply them as a governed change-set I can approve and revert, and have every change audited."

## What "good" looks like (acceptance expectations)
- A budget-move recommender that pairs under-target spenders with over-performers and shows a *credible projected* ROAS/PNO lift (a model, not a vibe).
- A governed control plane: bundle moves → simulate → human-approve → apply → revert, with policy guardrails and a per-change audit/activity log.
- Alerts that are deduped, severity-ranked and actionable — not noise.

## Pet peeves / friction triggers
- "Insights" with no action attached.
- An apply/pause action with no revert, no simulation, and no audit trail.
- Alert spam (the same anomaly five times) or alerts with no recommended next step.

## Motivation — why use the app at all (time-saved)
His weekly reallocate-and-document cycle is ~2–3 hours and inherently risky (manual edits in Ads). The tool must make the same moves faster *and* safer (simulated + reversible) or he won't trust it with live spend.

## Senior-quality bar (reliability floor)
Change management as careful as a senior ad-ops lead: every recommendation backed by a projection, every change reversible and logged. A naive "move budget here" with no model or no undo fails — that's how accounts get wrecked.

## Scored acceptance criteria (judged identically every run)
- [ ] Budget-move recommendations come with a credible projected portfolio impact (a real model, grounded in the numbers).
- [ ] Changes go through a simulate → approve → apply → revert flow with an audit/activity trail.
- [ ] Alerts are deduped, ranked, and carry a recommended action.
- [ ] The governed flow is faster and demonstrably safer than his manual Ads edits.

## Emotional baseline
Calm, accountable, control-loving. Trusts reversible audited automation with visible math; refuses to let any tool touch live budget without a revert and a log.
