---
character: Tomáš (PPC specialist)
goal: "Where is money leaking right now — and let me act on the worst campaign first."
promotion: discovery
seed: /kampane synced from the deterministic sample provider (always contains rule-breachers: a paused-but-spending Video campaign + several far-below-target prospecting campaigns)
references:
  - https://www.designrush.com/agency/paid-media-pay-per-click/trends/ppc-tracking — what a real specialist triages on
---

## Trigger (why now)
Start of the day. Tomáš opens the campaign console to catch anything that leaked spend overnight before he reallocates budget.

## Definition of done (his POV)
- He can immediately see **the portfolio needs attention** and **which campaigns** — sorted worst-first.
- For the worst one, he understands **why it's flagged** (a rule/number he recognizes), not just that it is.
- He can get an **AI evaluation that references the actual campaign numbers** and would inform a real decision.
- He leaves knowing the **next action** for that campaign (pause, cut budget, fix copy) — and trusts the flag enough to take it.

## Out of scope
- Actually pushing changes back to Google Ads (no live write path).
- Generating new ad copy (separate journey on `/ai-asistent`).

## Discovery hints
Entry point: `/kampane` (sync the sample data first). Likely uses the attention banner, priority sort, per-row severity, and the per-campaign AI report card. Do NOT script it — let Tomáš try to trust-but-verify a flag and note where the reasoning is thin or ungrounded.

## Frozen happy path
_(filled in on `promote`)_
