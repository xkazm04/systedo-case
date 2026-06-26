# Campaign Console UI — Ambiguity + Business scan
> Context: Client-side Google Ads campaign console — sortable/filterable table with a rule-based triage layer, by-type breakdown, per-campaign + portfolio AI report cards, and a sync/evaluate hook.
> Files analyzed: 9
> Total findings: 5

## 1. Numeric sort buries the worst campaigns — "—" rows sort as 0 (best)
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/components/campaigns/CampaignTable.tsx:308 (root cause src/lib/metrics/ratios.ts:8)
- **Problem/Opportunity**: A campaign that spends with **no revenue** (the "spending without conversions" case triage marks *critical*, triage.ts:113) gets `roas/pno/cpa = 0` because `safe()` returns 0 on a zero denominator. The cells correctly render "—" (CampaignTable.tsx:480/483/486), but the comparator sorts on the raw `a.c[sort.key]` value. So sorting **PNO descending** (worst-first) pushes the most wasteful campaign to the *bottom*, and **ROAS descending** treats it as a tie with the healthiest rows. The sort silently contradicts the badge it sits next to.
- **Why it matters**: The whole table promises "worst spend first," yet its numeric sorts invert the truth for exactly the campaigns a PPC manager must act on — eroding trust in the console's core job.
- **Fix sketch**: In `view.sort` (CampaignTable.tsx:300–311) treat no-data rows (those that render "—": `conversions === 0` for cpa, `roas <= 0`, `pno <= 0`) as a separate bucket that always sinks to the end regardless of `dir`, or substitute a sentinel (`+Infinity` for no-revenue PNO/CPA, `0` for ROAS) before comparing. Pure client change; not gate-triggering.

## 2. Exportable report (CSV/XLSX) of the filtered table + AI findings
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/components/campaigns/CampaignsClient.tsx:140 (sharing is link-only) · src/components/campaigns/CampaignTable.tsx:399
- **Problem/Opportunity**: The only "take it with you" path is **Share report** → a client link/microsite (CampaignsClient.tsx:140–161). Agencies live in spreadsheets and client decks; there is no way to export the numbers, triage severities/reasons, or the AI recommendations. A one-click CSV/XLSX of the *currently filtered + sorted* view is a concrete agency-grade differentiator and a natural extension of the existing "Share" affordance.
- **Why it matters**: Exportable data is table-stakes for PPC tooling and gives the case study a tangible "we hand clients a deliverable" story — clear value, no new backend.
- **Fix sketch**: Add an "Export" button by the count (CampaignTable.tsx:399–404) that serializes `view` (name, type, status, cost, conversions, conv. value, ROAS, PNO, severity, primary triage reason) plus any loaded `reports[id].result` summary/score, formatting numbers/currency via `src/lib/format.ts` for cs-CZ, and triggers a client-side Blob download. Reads only in-memory state — **not gate-triggering**.

## 3. Client trusts the AI report shape — a partial/empty report crashes the card
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/components/campaigns/useCampaigns.ts:131 · src/components/campaigns/ReportView.tsx:82
- **Problem/Opportunity**: The hook stores the response with a blind cast — `json.report as CampaignReport` (useCampaigns.ts:131) — with no runtime check. `ReportView` then unconditionally reads `r.strengths/weaknesses/recommendations` via `.length` and `.map` (ReportView.tsx:82–90, 132, 148, 165) and `copyAllText` spreads them. If the (gated) eval route ever returns a report with a missing/null array — partial generation, a future schema tweak, a trimmed cache entry — the card throws on render and the row's error UI never gets a chance to show.
- **Why it matters**: One malformed payload turns a successful-looking eval into a blank-screen crash, defeating the per-row error handling the rest of the flow carefully built.
- **Fix sketch**: Normalize on the client when storing — in useCampaigns.ts (~line 131) coerce `strengths/weaknesses/recommendations` to `[]` and `score` to a clamped number before `setState`, or guard each array in ReportView with `?? []`. Client-side only — **not gate-triggering** (do NOT add validation inside the hashed analyze route).

## 4. Triage thresholds are undocumented magic numbers (and a duplicated literal)
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/campaigns/triage.ts:162 (also :174) — the engine behind the in-scope banner/badges/needs-attention filter
- **Problem/Opportunity**: The single-snapshot ratios are named + commented (`ROAS_CRITICAL_RATIO = 0.6`, `PNO_CRITICAL_RATIO = 1.6`, triage.ts:14/17), but the **change-rules bury raw literals with no recorded reasoning**: the ROAS-crater test uses inline `* 0.6` (triage.ts:162) and the spend-spike uses `costDelta >= 0.5` and `valueDelta < costDelta * 0.5` (triage.ts:174). Why 50% / 40%? There's no source ("agreed with client"?). Worse, the crater's `0.6` *coincidentally equals* `ROAS_CRITICAL_RATIO` but means something different (share of ROAS *retained* vs share of *target*), inviting a wrong "let's dedupe these" refactor later.
- **Why it matters**: These numbers decide which campaigns scream "critical" to the user; unexplained and un-named, they're un-auditable and a trap for the next editor.
- **Fix sketch**: Extract named constants near triage.ts:14 — e.g. `ROAS_CRATER_RETAINED_MAX = 0.6`, `SPEND_SPIKE_COST_JUMP = 0.5`, `SPEND_SPIKE_VALUE_LAG = 0.5` — each with a one-line rationale, and reference them in the rule `test`s so the literal/intent never drift. Pure refactor; not gate-triggering.

## 5. Filters are neither persisted nor shareable — only sort survives a reload
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/components/campaigns/CampaignTable.tsx:247 (filters) vs :253 (sort is persisted)
- **Problem/Opportunity**: Sort is saved to localStorage and restored (CampaignTable.tsx:143–160, 253–259), but `query`, `typeFilter`, `statusFilter` and `attentionOnly` are plain `useState` (CampaignTable.tsx:247–250) — wiped on every reload and absent from the URL. An agency reviewing the same segment daily must re-apply filters each visit, and can't deep-link a teammate to "underperforming Shopping campaigns."
- **Why it matters**: Persisted + shareable filtered views are a low-cost retention/collaboration win that turns a one-off table into a daily workspace — the kind of stickiness the console is otherwise built for.
- **Fix sketch**: Persist the four filter values alongside sort (reuse the `loadSort`/`useEffect` pattern at CampaignTable.tsx:147 & 253), and/or mirror them into URL query params so a filtered+sorted view is bookmarkable and shareable. Validate on read like `loadSort` does. Client-side only — not gate-triggering.
