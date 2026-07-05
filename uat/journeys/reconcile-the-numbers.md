---
character: Lenka (marketing data analyst)
goal: "Verify that every load-bearing metric reconciles across every surface — one definition, consistent period/currency, honest sample-vs-live labeling — so I can sign off."
promotion: discovery
seed: authed local mode → demo-eshop → trace shared concepts across Performance (/vykon), Campaigns (/kampane), Profit (/zisk), LTV (/ltv), Inventory (/sklad-sezonnost)
references:
  - https://hbr.org/2013/03/keep-up-with-your-quants — single-source-of-truth / metric-governance bar
---

## Trigger (why now)
A leadership review is coming and Lenka has to sign off that the dashboard numbers are right. She refuses to present a figure another surface in the same tool contradicts.

## Definition of done (her POV)
- Each shared metric (ROAS/PNO, revenue, margin/COGS, AOV) has one definition and agrees across every surface that shows it.
- Currency, period semantics and labels are consistent across modules; a period change means the same thing everywhere.
- Sample-vs-live data is labeled honestly and consistently on every surface.
- She can sign off without re-exporting everything to a spreadsheet.

## Out of scope
- Wiring real Google Ads / accounting data (the question is internal *consistency*, sample data is fine).

## Discovery hints
This is the reconciliation sweep made personal. Entry: pick a metric (ROAS/PNO, revenue, margin) and trace it across /vykon, /kampane, /zisk, /ltv, /sklad-sezonnost — assert they agree. Don't script — the findings are the *contradictions between* surfaces (same metric two values, margin defined multiple ways, unlabeled sample data, period mismatches), not any single page's correctness.

## Frozen happy path
_(filled in on `promote`)_
