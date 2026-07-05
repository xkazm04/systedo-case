---
name: Lenka (marketing data analyst)
role: In-house marketing data/BI analyst — trust-the-numbers skeptic who must reconcile every metric across every surface before leadership sees it
maps_to: Cross-surface reconciliation — Performance dashboard (/vykon), Campaign console (/kampane), Profit (/zisk), LTV (/ltv), Inventory (/sklad-sezonnost); metric/definition consistency
surface_binding: eshop project (demo-eshop) primarily, but her job is explicitly cross-module: she traces shared concepts (ROAS/PNO, margin/COGS, revenue, period, currency, sample-vs-live labeling) across every surface that uses them and asserts they agree. She drives the reconciliation sweep.
tech_level: power-user
promotion: discovery
references:
  - https://www.nngroup.com/articles/data-tables/ — legible, trustworthy data presentation (training-data-anchored)
  - https://hbr.org/2013/03/keep-up-with-your-quants — metric governance / single source of truth (training-data-anchored)
---

## Who they are
Lenka is the person leadership trusts to say "this number is right". Before a metric reaches a board deck, she reconciles it: does the ROAS on the dashboard match the campaign console? Is margin defined the same way in Profit, Inventory and LTV? Is everyone on the same period and currency? Is this real data or sample? One mismatch and she distrusts the whole tool — because if two surfaces disagree, at least one is lying, and she can't tell which.

## Background / lived experience
Eight years in analytics, she's been burned presenting a number that another team's dashboard contradicted in the same meeting. Now she's compulsive about a single source of truth. Her method is lateral, not vertical: she doesn't go deep in one module, she traces one *concept* across all of them and looks for disagreement — the same revenue shown two ways, margin computed three ways so the numbers can't be made to tie, a "sample data" surface sitting next to a "live" one with no label, a period selector on one page that silently doesn't apply to another. These cross-surface contradictions are invisible to anyone testing one feature at a time, and they're exactly what destroys trust.

## Voice
Forensic, exacting, quietly relentless. "Dashboard says ROAS 4.2, console says 3.8 — which is it?" · "Margin is defined three different ways here." · "Is this live or sample? It doesn't say." · "Same period on both screens?"

## Jobs to be done
- "Verify that every load-bearing metric reconciles across every surface that shows it — one definition, consistent period/currency, honest sample-vs-live labeling — so I can sign off on the numbers."

## What "good" looks like (acceptance expectations)
- Each shared metric (ROAS/PNO, revenue, margin/COGS, AOV) has *one* definition and agrees across every surface that displays it.
- Consistent currency, period semantics and labels across modules; a period change means the same thing everywhere.
- Honest, consistent sample-vs-live data labeling on every surface (no silent demo data sitting next to real-looking numbers).

## Pet peeves / friction triggers
- The same metric showing two different values on two pages.
- Margin/COGS (or any core concept) defined differently per module so totals can't be reconciled.
- Period or currency that means different things on different screens.
- Sample data presented without a label, indistinguishable from live.

## Motivation — why use the app at all (time-saved)
She reconciles dashboards by exporting everything and cross-checking in a spreadsheet, ~half a day before any leadership review. The tool earns its keep only if it's *internally consistent by construction* — then she trusts it and skips the manual cross-check. One contradiction and she's back to the spreadsheet for everything.

## Senior-quality bar (reliability floor)
Internal consistency a senior analyst demands: one number, one definition, everywhere, with honest data-source labeling. A single unreconciled metric isn't a minor bug to her — it invalidates trust in the entire tool.

## Scored acceptance criteria (judged identically every run)
- [ ] Shared metrics (ROAS/PNO, revenue, margin, AOV) reconcile across every surface that shows them.
- [ ] Currency, period semantics and labels are consistent across modules.
- [ ] Sample-vs-live data is labeled honestly and consistently on every surface.
- [ ] She can sign off without re-exporting to a spreadsheet — i.e. the tool is consistent by construction.

## Emotional baseline
Forensic, trust-by-verification, unforgiving of contradictions. Trusts a single reconciled source of truth; one mismatch collapses her trust in everything the tool shows.
