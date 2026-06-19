---
character: Tomáš (PPC specialist)
goal: "Where is money leaking right now — and let me act on the worst campaign first."
promotion: acceptance
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

## Frozen happy path  (acceptance gate, 2026-06-19)
Surface: campaigns module — validated on `/app/demo-eshop/kampane` (LOCAL_DB + DEV_AUTH; `npm run seed:local` first). The public `/kampane` is the auth-free equivalent. Steps:
1. Open the campaigns module; click "Synchronizovat z Google Ads" (deterministic sample).
2. Confirm the attention banner: "N kampaní vyžaduje pozornost · X kritických · Y ke sledování".
3. Click "Seřadit podle priority"; confirm the first data row is a "Kritické" campaign (worst-first).
4. Click "Analyzovat" on the top critical; confirm the AI report.

Acceptance (must hold on re-run):
- Banner counts reconcile with the triage rules (critical + warning = "vyžaduje pozornost").
- After priority sort, row 1 is "Kritické".
- The AI report cites the campaign's actual numbers and scores ≤ 50 for a critical (the "critical ≤ 50" guardrail).

Known accepted friction: **FT1** (default sort is cost-desc; worst-first needs the sort click — the frozen path includes it).
