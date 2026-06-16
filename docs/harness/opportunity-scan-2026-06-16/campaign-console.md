# Campaign Console UI — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Trend-based triage rule is half-wired — prior-window deltas exist but no rule reads them
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/lib/campaigns/triage.ts (RULES), src/components/campaigns/ChangeStrip.tsx, src/lib/campaigns/types.ts (ChangesSummary)
- **Opportunity**: The triage `RULES` array only inspects a single snapshot (status, ROAS, conversions). The code comment at line 75 explicitly anticipates "a drop vs the prior window, once that data is wired" — and that data IS already wired: `ChangesSummary` carries `roasBefore`/`roasAfter`/`valueDelta` per campaign and is rendered in `ChangeStrip`. No triage rule consumes it, so a campaign whose ROAS cratered 4.0×→1.2× since last sync shows no severity badge until it crosses an absolute threshold.
- **Value**: "Sudden drop" is the single most valuable PPC alert (it catches a broken feed or budget cap days before an absolute-threshold rule would). It is also the clearest demo moment — the case study can show the console catching a *regression*, not just a steady-state laggard, which is what differentiates a console from a static report.
- **Effort**: M
- **Fix sketch**: Thread the matching `ChangeItem` into `triage(c, change?)`, add a `roas_dropped` warning/critical rule keyed on `change.roasAfter / change.roasBefore < 0.7`, and surface the delta in the rule `detail` so the badge tooltip reads "ROAS spadl o 40 % od minulé synchronizace".

## 2. No bulk "Vyhodnotit vše / jen rizikové" action — every AI report is a manual per-row click
- **Severity**: High
- **Lens**: Both
- **Category**: functionality
- **File**: src/components/campaigns/CampaignTable.tsx, src/components/campaigns/CampaignsClient.tsx, src/components/campaigns/useCampaigns.ts (analyze)
- **Opportunity**: `analyze` already tracks busy state per key independently, and the triage layer already knows exactly which campaigns `needsAttention`. But the only way to populate reports is to click "Analyzovat" on each row one at a time. There is no "evaluate all needs-attention campaigns" button, no select-checkbox column, and no queue.
- **Value**: A 20-campaign portfolio means 20 clicks and 20 waits to get a complete picture — friction that hides the product's best feature. A one-click "evaluate the N flagged campaigns" turns the triage count in the banner into an actionable batch, dramatically raising the demo's perceived intelligence and the real tool's daily-use stickiness.
- **Effort**: M
- **Fix sketch**: Add a `analyzeMany(ids: string[])` to `useCampaigns` that fans out `analyze("campaign", id, period)` with a small concurrency cap; wire a "Vyhodnotit rizikové (N)" button into `TriageBanner` / the table toolbar that passes `view.filter(needsAttention).map(c => c.id)`.

## 3. No portfolio export (CSV / shareable report) — reports die inside expandable rows
- **Severity**: High
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/components/campaigns/CampaignsClient.tsx, src/components/campaigns/CampaignTable.tsx, src/components/campaigns/ReportView.tsx
- **Opportunity**: A grep of the codebase shows export/CSV/download exists nowhere; the only "take it with you" affordance is the per-card `copyAllText` clipboard string in `ReportView`. There is no "export table to CSV", no "copy portfolio summary", and no print/PDF view. An agency's entire deliverable to a client is a *document*, yet this console can produce none.
- **Value**: Export is the bridge from "internal tool" to "client deliverable" — it is also the natural monetization seam (a free console, paid white-labeled/scheduled report). For the case study it answers the implicit client question "what do I actually hand to Mionelo?" Without it the console looks like a viewer, not a reporting product.
- **Effort**: M
- **Fix sketch**: Add a `toCsv(view)` helper over the already-derived `view` rows (name, type, cost, ROAS, PNO, severity, score) and a "Exportovat CSV" button in the table toolbar using a Blob download; reuse the `copyAllText` pattern from `ReportView` to build a portfolio-wide markdown summary button next to the "Vyhodnotit portfolio" action.

## 4. Filters reset every visit — no saved views / presets despite sort already persisting
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: feature
- **File**: src/components/campaigns/CampaignTable.tsx (query / typeFilter / statusFilter / attentionOnly state, SORT_STORAGE_KEY)
- **Opportunity**: Sort state is lovingly persisted to `localStorage` (`SORT_STORAGE_KEY`, `loadSort`), but the four filter dimensions (`query`, `typeFilter`, `statusFilter`, `attentionOnly`) are plain `useState` that vanish on reload. There is no concept of a named saved view (e.g. "Jen PMax pod cílem", "Aktivní nákupní"), which is the standard power-user feature for any recurring filtered table.
- **Value**: A PPC manager returns to the same 2–3 lenses daily; re-applying them each visit is needless friction, and saved views are a low-cost retention/"power-user" hook. The inconsistency (sort sticks, filters don't) also reads as unfinished.
- **Effort**: S
- **Fix sketch**: Persist the filter quad under a `campaigns.table.filters` key with the same try/catch `loadSort`/effect pattern; optionally promote to a small `views: {name, filters}[]` list rendered as preset chips in the toolbar next to "Zrušit filtry".

## 5. The score timeline is per-card only — no portfolio "are our optimizations working?" rollup
- **Severity**: Medium
- **Lens**: Both
- **Category**: differentiation
- **File**: src/components/campaigns/ScoreTimeline.tsx, src/components/campaigns/CampaignsClient.tsx (histories), src/components/campaigns/ReportView.tsx
- **Opportunity**: `ScoreTimeline` renders a sharp trend per scope, and `histories` is already keyed by every campaign id plus `"overall"`. But the trend is only visible after expanding one report card. There is no at-a-glance portfolio health trajectory on the main view — e.g. a compact sparkline + "průměrné skóre portfolia 58 → 67 za 30 dní" strip near the KPIs — even though all the data to compute it already lives in `histories`.
- **Value**: "Are the optimizations working?" (the exact question `ScoreTimeline`'s own header poses) is the agency's retention argument to its client and the case study's strongest proof-of-value. Surfacing the aggregate trajectory up top turns a buried chart into the headline narrative of measurable improvement.
- **Effort**: M
- **Fix sketch**: Derive a portfolio score series by averaging per-campaign `histories` points by date (or reuse the `"overall"` history when present), render a condensed `ScoreTimeline` variant in a KPI-adjacent strip in `CampaignsClient`, and label the latest delta with the existing `deltaTone` helper.
