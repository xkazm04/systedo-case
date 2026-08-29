# WP W1-D — Ads-performance diagnosis kind
card #23 · L · gate: contract (new `DiagnosisKind`, new llm-tool + golden) · wave 1 · **modes.ts owner**

## Goal
A tenant whose only live data is Ads (Google and/or Sklik, synced campaigns) gets a persisted
"Diagnóza výkonu reklam" — from the weekly digest (passive) AND on demand from Výkon — instead of the
current silent nothing (`runTenantDiagnoses` only knows the lead-source arm and exits at
`digest-run.ts:76`). Acceptance: `planDigestDiagnoses` returns `runAds: true` for an Ads-live /
leads-sample tenant (pinned), the tool passes the static LLM gate with a golden + CHANGELOG row, and
the Výkon page renders the new panel behind the same lifecycle (new → acknowledged → resolved).

## Non-goals
- No new store or migration (`diagnoses` is a per-project blob; kinds are keyed inside — ADR-0001
  "nothing migrates", `types.ts:22-23` blesses extending the tuple).
- No campaign mutations, no change-set creation from the diagnosis (link to `/kampane` only).
- No Sklik-specific prompt engineering: the diagnosis reads the UNION (`listCampaignsForProject`)
  and names the platform per row; W1-G makes the console union-aware in parallel — do not touch
  `src/app/api/campaigns/**` or `src/components/campaigns/**`.
- Do not edit `src/lib/ai/tools/{lead-source,cohort,local}-diagnosis.ts` prompts or any other golden.

## Seams
- Kinds/model: `src/lib/diagnoses/types.ts:24` (`DIAGNOSIS_KINDS`), `:58-76` (per-kind interfaces + union),
  `:167/:183/:198` (sanitizers), `:220-224` (`DIAGNOSIS_METRIC_KEY_BY_KIND`), ternaries at `:278-283`,
  `:289-295`, `:325-329` (turn them into kind-keyed maps while you are there — same behaviour, pinned).
  `DiagnosisMetricKey` at `src/lib/ai-types.ts:153` gains `"pno"`.
- Digest: `src/lib/diagnoses/digest-plan.ts:13-43` (`planDigestDiagnoses`, NOTE_*), `digest-run.ts:41-45`
  (`DigestDiagnosisResult`), `:57-101` (`runTenantDiagnoses`; ads arm mirrors `:79-96` incl.
  `durableGuard("cron:digest-diagnosis")` + `refundIfDemo` + `refundGlobalSpend`), `:103-126`
  (`persistLeadSource` → generalise to `persistDiagnosis(kind, …)`). Cron `src/app/api/cron/digest/route.ts:40-49`
  (`renderDiagnosis` gains an ads branch), `:94-95` (campaigns already listed), `:162-191` (alert `href` →
  `/app/${project.id}/vykon` when only ads ran), `:199-201` (`resolveReportDataset` already resolved here).
- Request builder: NEW `src/lib/diagnoses/ads-request.ts` (pure, client-safe) — mirrors
  `lead-source-request.ts:97` `seedToRequest`; server resolver added to `resolve-request.ts` (`:82` shape) and
  `src/app/api/ai/grounding.ts:334-356` (`resolveAdsDiagnosis` with the tenancy check).
- Tool: NEW `src/lib/ai/tools/ads-diagnosis.ts` copying `lead-source-diagnosis.ts`: system `:31-48` shape with
  `antiFabrication`, prompt with `dataProvenanceLine(req.sample)`, schema `:115-137` shape, validator `:204-217`,
  tail-free `baseAdsDiagnosis` + `demoAdsDiagnosis` (`:223-281` split). Tag `// llm-tool: ads-diagnosis`
  within 2 lines of `generateStructured(`.
- Mode: `src/app/api/ai/modes.ts:407-419` (copy the `lead-source-diagnosis` entry → `"ads-diagnosis"`), deps in
  `ModeDeps` `:178+` and `dispatch.ts:118` real deps; intent validator beside `validation.ts:977-995`.
- Gate: `test-llm/registry.mjs:711-734` entry shape (system + schema VERBATIM from production),
  `npm run llm:new -- --id ads-diagnosis --label "Diagnóza výkonu reklam" --file src/lib/ai/tools/ads-diagnosis.ts`,
  BYOM row `src/lib/llm/keys/types.ts:188-209`, `npm run llm:eval:update -- --reason "…"` (CHANGELOG row with
  `—` as `from`), `npm run llm:gate:check`, `npm run test:llm:coverage`.
- Data: `listCampaignsForProject(userId, projectId, "30d")` (`src/lib/campaigns/store.ts:49-66`; rows carry
  `source`), `withMetrics`/`aggregate` (`campaigns/types.ts`), `triage(c, changesById[c.id])`
  (`campaigns/triage.ts`), `getLatestChanges` + `indexChanges` (as `digest/route.ts:121`),
  `resolveReportDataset(project)` for the daily series/PNO/`mixedCurrency`. Periods are `7d|30d|90d`.
- UI: `src/app/app/[projectId]/vykon/page.tsx` (23 LOC) → `DashboardClient.tsx` mounts sections in order
  (`AlertsPanel :219`, `InsightsPanel :228`). NEW `src/components/dashboard/vykon/AdsDiagnosisPanel.tsx`
  (≤200 LOC) copies `LeadSourceDiagnosisPanel.tsx` (lifecycle from `DiagnosisTracking.tsx`,
  `useAiTool("ads-diagnosis")`, `useDiagnosisPersistence`), mounted after `AlertsPanel`, lazy via `next/dynamic`.
  Server load: `latestDiagnosis(projectId,"ads")` + `listDiagnoses(projectId,"ads")` in `vykon/page.tsx`
  (inside the existing async boundary), passed as props.
- Tests to extend: `diagnoses-digest-plan`, `diagnoses-state` (fixtures per kind), `diagnoses-outcome`,
  `bench-diagnoses-engine-02` (metric key ↔ kind), `ai-mode-table`, `diagnoses-provenance-prompt`.

## Data contract
```ts
// src/lib/ai-types.ts (additive)
export type DiagnosisMetricKey = "ltvCac" | "qualRate" | "coverage" | "pno";
export interface AdsDiagnosisCampaign { id: string; name: string; platform: "google-ads" | "sklik"; type: string;
  cost: number; conversions: number; conversionValue: number; roas: number; pno: number; ctr: number;
  severity: "critical" | "warning" | "ok"; budgetPerDay?: number; deltaCostPct?: number; deltaConvPct?: number }
export interface AdsDiagnosisRequest {
  period: "30d"; currency: string; mixedCurrency?: boolean;
  totals: { cost: number; conversions: number; conversionValue: number; roas: number; pno: number };
  prior?: { cost: number; conversions: number; conversionValue: number };   // previous window from the daily series when available
  platforms: Array<{ platform: "google-ads" | "sklik"; cost: number; roas: number; campaigns: number }>;
  worst: AdsDiagnosisCampaign[];   // ≤6, by wasted spend (cost with pno above target / zero conversions)
  best: AdsDiagnosisCampaign[];    // ≤3
  targetPno?: number;              // from cost model / goals when present
  sample?: boolean; refine?: string;
}
export const ADS_DIAGNOSIS_CAUSES = ["waste-zero-conv","budget-misallocation","efficiency-drift","tracking-gap","platform-imbalance","healthy"] as const;
export interface AdsDiagnosisResult { summary: string; likelyCause: (typeof ADS_DIAGNOSIS_CAUSES)[number];
  recommendation: string; severity: "high" | "medium" | "low"; affectedCampaignIds: string[] }  // ids coerced to the request set
```
Digest plan: `DigestDiagnosisPlanInput` gains `adsLive: boolean; adsHasSignal: boolean` (≥1 campaign with
cost > 0 in the window); `DigestDiagnosisPlan` gains `runAds`; notes `NOTE_ADS_NO_LIVE = "ads: no live basis"`,
`NOTE_ADS_NO_SIGNAL = "ads: no spend to diagnose"`. Existing lead behaviour and note order byte-identical
(the 4 existing tests pass unmodified). Snapshot key for outcome: `pno` (lower is better — `outcome.ts`
`compareOutcome` must treat `pno` as inverse; pin it). Stored kind: `"ads"`, cap via `capPerKind`.
Spend: ONE `durableGuard` unit per diagnosis; the digest runs the ads arm only when `runAds`, and both arms
may run for a tenant that has both (two units).

## Invariants
- ADR-0003: the only provider call is `generateStructured` in the new tool file.
- Anti-fabrication: the prompt carries only pre-computed numbers + provenance; `affectedCampaignIds` normalised
  to the request's ids (unknown ids dropped; empty allowed).
- Mixed currency: when `resolveReportDataset` says `mixedCurrency`, `platforms[]` is reported per platform and
  `totals` is the PRIMARY platform only, stated in the prompt (never summed across currencies — ADR-0010).
- Origin: `"digest"` only from the server path (`bench-diagnoses-engine-01` stays green).

## Build steps
1. `types.ts` kind + maps + sanitizer + metric key; `outcome.ts` inverse-metric; tests (`diagnoses-state`,
   `diagnoses-outcome`, `bench-02`) extended — red then green.
2. `ads-request.ts` + `test-unit/diagnoses-ads-request.test.mjs` (worst/best selection, platform split,
   mixed-currency rule, delta from daily series; ≥10 assertions).
3. Tool + registry entry (scaffold with `llm:new`, then paste production system/schema verbatim) + BYOM row +
   `llm:eval:update --reason` + `npm run llm:gate:check` green.
4. Mode + grounding resolver + validator; `ai-mode-table` test extended.
5. `digest-plan` + `digest-run` + cron `renderDiagnosis`/href; `diagnoses-digest-plan` test extended (≥3 new).
6. Výkon panel + page load; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/diagnoses src/lib/ai/tools/ads-diagnosis.ts src/app/api/ai "src/app/app/[projectId]/vykon" src/components/dashboard/vykon/AdsDiagnosisPanel.tsx src/app/api/cron/digest test-llm/registry.mjs` ·
`npm run test:unit` · `npm run llm:gate:check` · `npm run test:llm:coverage`.
Do NOT run `npm run test:llm` (real models) — the Director does on landing.

## Acceptance
- `planDigestDiagnoses({ leadSourcesLive:false, hasLeadSeed:false, adsLive:true, adsHasSignal:true })` →
  `{ runLead:false, runAds:true, notes:[NOTE_COHORT_NO_LIVE, NOTE_LEAD_NO_LIVE] }` (pinned).
- `npm run llm:gate:check` exit 0 with 22 registered tools; CHANGELOG has an `ads-diagnosis | — | <hash>` row.
- ≥20 new assertions total.

## Hotspot requests
- `src/app/api/ai/modes.ts`, `dispatch.ts`, `test-llm/registry.mjs`, goldens, `src/lib/llm/keys/types.ts` BYOM row:
  OWNED by W1-D this wave — edit directly.
- `context-map.json` new files (Director). `docs/testing/llm-quality-matrix.md`: note the new tool has no baked
  quality score yet (reporting rung) — one line, you may edit.

## Rollback
Revert; stored `"ads"` items are ignored by old code (`sanitize` drops unknown kinds); the golden + CHANGELOG
row must be reverted together with the registry entry or `llm:gate:check` reports a stale golden.
