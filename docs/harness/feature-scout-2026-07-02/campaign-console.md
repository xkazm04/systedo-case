# Feature Scout — Campaign Console UI (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/app/kampane/page.tsx, src/components/campaigns/CampaignsClient.tsx, src/components/campaigns/CampaignTable.tsx, src/components/campaigns/TriageBanner.tsx, src/components/campaigns/ReportView.tsx, src/components/campaigns/ScoreTimeline.tsx, src/components/campaigns/TypeBreakdown.tsx, src/components/campaigns/useCampaigns.ts, tests/kampane-triage.spec.ts

## 1. Add a one-click "Evaluate all flagged" batch queue to the triage banner
- **Impact**: 8/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: automation
- **File**: `src/components/campaigns/TriageBanner.tsx:87`
- **Opportunity**: Triage flags N campaigns and `triageWeight` (triage.ts:238) even documents the order "in which a PPC manager should spend their AI-evaluation clicks" — yet those clicks are still manual, one row at a time. The banner's only action today is "sort by priority"; there is no way to evaluate the whole attention set in one gesture.
- **Why valuable**: Turns the console's core loop (triage → evaluate → act) from N clicks into one, exactly for the rows the product itself says matter most. The per-row busy state and input-hash cache mean it's cheap to re-run.
- **Build sketch**: Add a second banner CTA ("Vyhodnotit označené ({n})") that receives the flagged campaign ids (already computed in `view`/`summary` inside CampaignTable, or recompute via `triage`) sorted by `triageWeight` desc, then runs the existing `analyze("campaign", id, period)` from `useCampaigns` **sequentially** (concurrency 1, stop on the first error/429 to respect the AI rate limiter) — per-row spinners come for free from `analyzing[id]`. Client-only wiring to the existing endpoint; do NOT touch the hashed `/api/campaigns/analyze` route. Skip ids already in `reports` unless the user opts into re-evaluation.

## 2. Show filtered-segment totals in a table footer row
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/campaigns/CampaignTable.tsx:683`
- **Opportunity**: The portfolio KPI cards (CampaignsClient.tsx:285) are always portfolio-wide, but the table can be filtered to "Shopping only" or "needs attention only" — and there is no aggregate anywhere for the filtered `view`. An agency asking "what does the flagged segment cost us?" must export CSV and sum by hand.
- **Why valuable**: Segment totals are the number the user filtered *for*; showing correct re-derived ROAS/PNO (not averages) makes every filter instantly answer a budget question.
- **Build sketch**: After `</tbody>` render a `<tfoot>` row (visible when `filtersActive`, or always with a "Σ" label): call the existing pure `aggregate(view.map(v => v.c))` from `@/lib/campaigns/types` — it re-derives ROAS/PNO from sums, so no drift — and format with the same `fmt.fmtCZK/fmtMultiple/fmtPct` used by the body cells, keeping the `—` convention for zero-denominator cells. Colspan the first two cells, align the rest with the numeric columns.

## 3. Surface triage reasons inline in the expanded row (not only a title tooltip)
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/campaigns/CampaignTable.tsx:559`
- **Opportunity**: The rich, number-grounded diagnoses (`triageResult.reasons` — label + detail like "ROAS spadl z 6,2× na 2,1×…") exist for every flagged row but are exposed only via a native `title` attribute on the severity pill. Touch devices never see them, they can't be copied, and desktop users must know to hover.
- **Why valuable**: The "why is this red?" answer is the console's whole promise; today the deterministic evidence the model itself is fed (report-input.ts `triageLines`) is invisible to most users.
- **Build sketch**: Make the severity pill a button that toggles the existing expanded row (`toggle(c.id)`), and at the top of the expanded cell (CampaignTable.tsx:640, above the AI-report block) render `triageResult.reasons` as a small list — severity-tinted dot (reuse `SEVERITY_BADGE`), `triageReasonLabel(r, locale)` in bold, `r.detail` as text. Keep the `title` as a secondary affordance. Pure presentation of already-computed data; zero new logic.

## 4. Make TypeBreakdown cards click-to-filter the table, with per-type attention counts
- **Impact**: 6/10
- **Effort**: 4/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: integration
- **File**: `src/components/campaigns/TypeBreakdown.tsx:51`
- **Opportunity**: TypeBreakdown already computes per-type ROAS/spend and sits directly above the table that has a `typeFilter` — but the two aren't wired: spotting "Display is under target" gives you no path to its campaigns except manually re-selecting the type in the table's dropdown. The cards also hide triage: a type can look fine on aggregate ROAS while containing 2 critical campaigns.
- **Why valuable**: Connects the console's two main views into one drill-down flow (see problem type → see its campaigns) and stops aggregate cards from masking row-level fires.
- **Build sketch**: Lift `typeFilter` state (with its `loadFilters`/persist effect) from CampaignTable up to CampaignsClient, passing `value` + `onChange` down to both components; each TypeBreakdown card gets an `aria-pressed` click handler that toggles the filter and a small "{n} vyžaduje pozornost" pill computed via the existing `summarize(groupRows, changesById)` per group (pass `changesById` down, as CampaignsClient already builds it). Update `tests/kampane-triage.spec.ts` only if the dropdown markup moves (it shouldn't).

## 5. Reveal the hidden funnel metrics (impressions, clicks, CTR, CPC, conv. rate) in the row detail and CSV
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/campaigns/CampaignTable.tsx:640` (data source: `src/lib/campaigns/types.ts:151`)
- **Opportunity**: `deriveMetrics` computes `ctr`, `cpc`, `convRate` for every row and the AI prompt already consumes CTR (report-input.ts:47), but the console never renders impressions, clicks, or any of these ratios — the table stops at cost/conversions/value/CPA/ROAS/PNO. Diagnosing *why* a campaign underperforms (weak CTR vs. weak conversion rate vs. expensive clicks) is impossible without leaving the app.
- **Why valuable**: Gives the manager the causal layer under the money metrics — the same evidence the AI report reasons from — so the human and the model literally look at the same funnel.
- **Build sketch**: In the expanded row (pairs naturally with idea 3) render a compact funnel strip: `fmt.fmtInt(c.impressions)` → `fmt.fmtInt(c.clicks)` (CTR `fmt.fmtPct(c.ctr, 2)`) → `fmt.fmtInt(c.conversions)` (CR `fmt.fmtPct(c.convRate, 2)`), plus CPC `fmt.fmtCZK(c.cpc)`; all values already exist on the mapped `CampaignRow`. Append the same columns to the `exportCsv` rows (CampaignTable.tsx:396) so the agency deliverable carries the full funnel. Keep the muted "—" convention for zero denominators.
