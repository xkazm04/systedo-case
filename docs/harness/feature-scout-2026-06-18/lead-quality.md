# Feature Scout — Kvalita leadů (`/app/[projectId]/kvalita-leadu`)

> Module: src/components/app/modules/LeadQualityModule.tsx
> Project type: leadgen
> Total: 5 ideas

## 1. CRM webhook + import of lead outcomes (close the feedback loop)
- **Category**: functionality
- **Impact**: 9
- **Effort**: 6
- **Risk**: 4
- **Gap today**: Data is fully static — `page.tsx:15` passes hard-coded `SAMPLE_SOURCES` (sample.ts:16) and the footer literally admits the seam: "Seam: napojit CRM (lead → kvalifikovaný → uzavřený + hodnota)" (LeadQualityModule.tsx:92). There is no ingest path, no API route under `src/app/api/`, no persistence; `qualified/won/revenue` are invented.
- **Proposal**: Add `src/app/api/leads/route.ts` (POST webhook + GET) accepting CRM events `{source, stage: lead|qualified|won, value, ts, externalId}` with idempotency on `externalId`, persisted to the campaigns SQLite store (the only DB seam already in repo). Provide a fallback CSV import (Pipedrive/HubSpot/Raynet export columns) parsed server-side into the same shape. `withMetrics`/`summarize` (compute.ts) consume the aggregated real rows instead of the sample, with a "demo data" badge when empty.
- **User value**: The headline metric (CPQL) becomes real, not illustrative — bid decisions stop relying on form counts and start using actual qualification/close data from the CRM.
- **Fit**: Directly fulfills the registry blurb ("Zpětná vazba z CRM") and the in-code seam; leadgen is the only project type where CRM outcomes exist. Foundation every other idea here depends on.

## 2. Lead → close funnel by source/campaign with stage conversion + velocity
- **Category**: feature
- **Impact**: 8
- **Effort**: 5
- **Risk**: 3
- **Gap today**: The module models only three flat counts per source (`leads`, `qualified`, `won` in sample.ts:5) and derives `qualRate`/`winRate` (compute.ts:24-26). There is no funnel visualization, no per-stage drop-off, no time-to-qualify / time-to-close, and no breakdown by campaign — only by `source` string.
- **Proposal**: Add a stage funnel (Lead → SQL → Opportunity → Won) per source with conversion% and absolute drop-off at each step, plus average days-in-stage (velocity). Extend `LeadSource` with optional `opportunities` and per-stage timestamps, and add `funnelBySource()`/`avgVelocity()` to compute.ts. Render a horizontal funnel + a campaign drill-down (group by a new `campaign` field) reusing the existing table/`Pill` styling.
- **User value**: Shows *where* a cheap source leaks (e.g. lots of leads, dies at SQL stage) so the user fixes the right stage instead of just pausing the source.
- **Fit**: Natural extension of the existing qualification math; complements the NextSteps → Kampaně link (LeadQualityModule.tsx:97) by attributing quality down to the campaign that pays for it.

## 3. Offline-conversion upload back to Google Ads / Sklik (cost-per-SQL bidding)
- **Category**: functionality
- **Impact**: 8
- **Effort**: 7
- **Risk**: 5
- **Gap today**: The whole point of the module — bid on qualified leads, not cheap leads (LeadQualityModule.tsx:50-52) — currently ends as advice. There is no mechanism to push the qualification signal back into ad platforms; the only downstream action is a manual link to the Kampaně module.
- **Proposal**: Generate an offline-conversion export (Google Ads "Offline conversion imports" CSV with GCLID + conversion value = revenue or a qualified-lead flag; Sklik equivalent) so platforms optimize toward qualified/won, not form fills. Requires capturing GCLID/click-id alongside the CRM lead (ties to idea #1's webhook payload). Ship as a downloadable file first (`src/app/api/leads/offline-conversions/route.ts`), with a documented seam for a live API push.
- **User value**: Turns the diagnosis into a closed loop — the platform's smart bidding actually learns from real lead quality, which is the single biggest lever for lowering CPQL.
- **Fit**: This is the literal call-to-action of the module made operational; aligns the leadgen project's spend with qualified outcomes and feeds directly into the Kampaně bidding it already links to.

## 4. Junk / spam lead detection with reasons (beyond the single 35% rule)
- **Category**: feature
- **Impact**: 7
- **Effort**: 5
- **Risk**: 4
- **Gap today**: "Junk" is a single hard-coded threshold — `JUNK_QUAL_RATE = 0.35` flagged only when `spend > 0` (compute.ts:20, 36). The summary card just counts junk *sources* (LeadQualityModule.tsx:38-43); there is no per-lead spam detection, no reason, no detection of fake/duplicate/disposable-email leads that inflate the form count.
- **Proposal**: Two layers. (a) Per-lead spam heuristics on ingested leads: duplicate phone/email, disposable-email domains, sub-minute time-on-form, missing fields — surfaced as a "junk leads" count and reason chips. (b) An optional LLM "junk source diagnosis" tool (new `generateLeadQualityDiagnosis` in `src/lib/ai/tools/`, run through `generateStructured` per the established pattern) that, given a junk source's metrics, returns a Czech root-cause + recommended action. Make the junk threshold project-configurable instead of a constant.
- **User value**: Stops paying for and reporting on garbage leads, and tells the user *why* a source is junk (spam vs. mis-targeting) so the fix is obvious.
- **Fit**: Deepens the module's existing junk concept and the "optimize for quality, not count" thesis; reuses the app's single LLM chokepoint and structured-tool convention.

## 5. Cost-per-SQL alerts + period-over-period trend (CPQL drift watch)
- **Category**: user_benefit
- **Impact**: 7
- **Effort**: 4
- **Risk**: 3
- **Gap today**: The view is a single static snapshot — no time dimension anywhere (`summarize` returns one set of totals, compute.ts:49), no trend, and no alerting. The user cannot see CPQL rising over time or be warned when a source degrades; they must re-open the page and eyeball it.
- **Proposal**: Add period-over-period deltas (this period vs. last) for CPQL, qualification rate, and win rate per source, rendered with the existing `fmtSignedPct` helper (format.ts:124) and tone pills. Layer threshold alerts ("CPQL of source X rose >25% / exceeds target") reusing the campaigns alerting infra already in repo (`src/lib/campaigns/alerts.ts`, `anomaly-alerts.ts`) and the cron digest (`src/app/api/cron/digest/route.ts`) so warnings land without opening the tab.
- **User value**: Catches quality decay early — a source that quietly slid from acceptable to junk — instead of discovering it after a wasted month of spend.
- **Fit**: Adds the missing time axis the module needs once real CRM data flows (idea #1), and plugs into existing alert/digest plumbing rather than inventing new infrastructure.
