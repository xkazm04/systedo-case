# Feature Scout — CAC → LTV (`/app/[projectId]/ltv`)

> Module: src/components/app/modules/LtvModule.tsx
> Project type: app
> Total: 5 ideas

## 1. Retention/survival curve per cohort (visual + table expansion)
- **Category**: feature
- **Impact**: 8
- **Effort**: 4
- **Risk**: 2
- **Gap today**: The full retention curve already exists in the data (`sample.ts:20-25` `retention: number[]`) and is even extrapolated to 12 months inside `compute.ts:27 survivalCurve`, yet the UI throws all of it away and shows a single **M3** column (`LtvModule.tsx:63,75` → `r.m3`). Users see "61 %" with no shape of decay.
- **Proposal**: Render each cohort's survival curve — either a small inline sparkline per row, or a triangular **cohort retention heatmap** (rows = cohort months, columns = M0…M11, cell shading = % retained), with observed months solid and extrapolated months hatched/lighter so the modeled tail is visually honest. Expose the existing `survivalCurve` output from `withMetrics` instead of discarding it.
- **User value**: Lets a founder see *where* churn happens (early drop-off vs long-tail bleed) — the single most actionable retention signal — instead of one opaque M3 number.
- **Fit**: Pure presentation over data the module already computes; matches the table-centric, server-rendered style and the "ne jen registrace" promise of deeper cohort insight.

## 2. Payback & CAC by acquisition channel (blended vs paid split)
- **Category**: functionality
- **Impact**: 9
- **Effort**: 6
- **Risk**: 4
- **Gap today**: CAC is **blended-only** — `sample.ts` carries one `spend`/`signups` per cohort and `compute.ts:40` computes `cac = spend/signups`; the KPI is literally labeled "Blended CAC" (`LtvModule.tsx:24`). There is no per-channel CAC, no organic/paid split, and no per-channel payback, even though the app has rich channel data (`src/lib/metrics/channels.ts ChannelRow`).
- **Proposal**: Extend the `Cohort` shape with an optional channel breakdown (`{ channel, spend, signups }[]`) and surface paid-only CAC alongside blended CAC, plus a per-channel LTV:CAC and payback table/bar. Reuse the channel color + ROAS conventions from `ProfitModule.tsx:142-167`. Where channel data is absent, fall back to today's blended view.
- **User value**: Answers the real budget question — "which channel actually pays back, and how fast?" — so spend moves to channels with sub-12-month payback instead of being averaged into a misleading blended number.
- **Fit**: Directly extends the registry promise (CAC + payback + LTV:CAC) and naturally links to Kampaně via `NextSteps`, mirroring ProfitModule's "přesunout rozpočet" flow.

## 3. Adjustable LTV horizon + projection slider with confidence band
- **Category**: feature
- **Impact**: 7
- **Effort**: 4
- **Risk**: 3
- **Gap today**: The LTV horizon is a hard-coded constant `LTV_HORIZON = 12` (`compute.ts:6`), the footer text statically claims "počítáno na 12 měsíců" (`LtvModule.tsx:89`), and the geometric tail ratio is silently clamped to `[0.8, 0.98]` (`compute.ts:30`) with no user control or sensitivity view. The module is a static server component with zero interactivity.
- **Proposal**: Promote LtvModule to a client component with a horizon toggle (12 / 24 / 36 months) and an optional churn-assumption slider that re-runs `survivalCurve` live (the ProfitModule pattern: `useState` + `useMemo` recompute, `ProfitModule.tsx:26-32`). Show LTV and LTV:CAC recomputing in place, with a low/expected/high band from min/max clamp ratios so the projection's uncertainty is explicit.
- **User value**: Lets users stress-test unit economics ("are we healthy only because we assumed a 12-month life?") and see how payback math changes under conservative vs optimistic retention — far more trustworthy than one fixed number.
- **Fit**: Adopts the exact live-recompute interaction already established in ProfitModule; turns a static readout into a power-user modeling tool while reusing all existing pure math.

## 4. Target LTV:CAC alerts + AI cohort diagnosis
- **Category**: user_benefit
- **Impact**: 7
- **Effort**: 5
- **Risk**: 4
- **Gap today**: The only "intelligence" is a single binary health note keyed off `avgLtvCac >= 3` (`LtvModule.tsx:19,49-52`) and a per-row tone threshold (`ratioTone`, lines 6-10). There's no per-cohort flagging of *which* cohorts breach the target, no trend ("ratio is sliding month over month"), and no AI narrative — despite the app's `generateStructured` LLM wrapper (`src/lib/llm/index.ts:129`) used by other modules.
- **Proposal**: Add explicit alert rows: highlight cohorts under the 3× target or with payback ">12 měs.", and detect a declining LTV:CAC trend across cohorts (e.g. Dub→Čvn slipping). Optionally add an "AI rozbor kohort" panel that feeds the computed `CohortMetrics[]` to `generateStructured` and returns a short Czech diagnosis (which cohort/lever to fix first), matching the AI-insight pattern used elsewhere.
- **User value**: Converts a passive table into "here's the problem cohort and what to do about it" — exactly what a non-analyst SaaS operator needs.
- **Fit**: Builds on the existing health-note seam and the project's single server-side LLM wrapper; consistent with the Czech, advisory tone of the current note.

## 5. Cohort-vs-cohort trend & exportable cohort report
- **Category**: feature
- **Impact**: 6
- **Effort**: 3
- **Risk**: 2
- **Gap today**: Cohorts are shown as independent rows (`LtvModule.tsx:70-84`) with no month-over-month delta and no NextSteps cross-link (every richer module ends with `NextSteps`, e.g. `ProfitModule.tsx:191`). There's also no way to take the cohort data out of the screen for a board deck / investor update.
- **Proposal**: Add a delta column or mini-trend showing how CAC, LTV and LTV:CAC move newest-vs-oldest cohort (reuse `fmtSignedPct`/`fmtSignedInt` from `format.ts`), a summary "trend" pill (improving/worsening), and a "Stáhnout report" action exporting the cohort table (CSV/printable). Close with a `NextSteps` link to Kampaně/Zisk.
- **User value**: Surfaces whether unit economics are getting better or worse over time — the question investors actually ask — and lets the user share it in one click.
- **Fit**: Low-risk reuse of existing formatters and the standard `NextSteps` wiring; rounds the module out to match the connected-flow convention of its siblings.
