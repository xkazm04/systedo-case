# Component-size debt — post-launch refactor backlog

Finding from the 2026-08-04 `/mvp` launch-readiness run: **98 `.tsx` components
exceed 200 LOC** (99 at the 2026-08-04 re-count after the i18n extraction pass)
against the repo convention of keeping components under 200 LOC (see
`AGENTS.md`). This is quality debt, not a launch blocker — nothing here gates
the release. Priority: **post-launch**, opportunistic (split a file when you
are already editing it), largest-first when scheduled deliberately.

## Top 10 offenders

| LOC | Component |
| --- | --- |
| 1126 | `src/components/brand/variants/LandingNewWorld.tsx` |
| 977 | `src/components/app/modules/CatalogManagerModule.tsx` |
| 970 | `src/components/app/modules/DistributionModule.tsx` |
| 966 | `src/components/ai/AdGenerator.tsx` |
| 940 | `src/components/campaigns/CampaignTable.tsx` |
| 904 | `src/components/ai/CreativeStudio.tsx` |
| 856 | `src/components/app/modules/MonthlyReport.tsx` |
| 834 | `src/components/app/modules/CompareSeoTable.tsx` |
| 800 | `src/components/app/modules/SpeedLeadModule.tsx` |
| 764 | `src/components/app/twin/TwinOutbox.tsx` |

(LOC as measured at the /mvp scan; re-measure before starting a split — several
of these files are actively edited.)

## Recommended split pattern: presentational + data-hook pairs

The codebase already has the target shape — `src/components/campaigns/`
pairs `CampaignsClient.tsx` with `useCampaigns.ts` / `useAuthedResource.ts`,
and `speed-lead/` splits panels + `useLeadSla.ts` / `useSnippetLibrary.ts`.
Apply the same decomposition to each offender:

1. **Extract the data hook** — fetch/mutate/derive state moves to a
   `use<Thing>.ts` colocated next to the component. The hook owns loading,
   error and quota (`AiError`) state; the component receives plain props.
2. **Extract presentational sub-components** — each visually distinct section
   (table, panel, editor row, empty state) becomes its own `<200 LOC` file in
   a folder named after the module (the `speed-lead/` folder is the
   precedent). Keep the colocated `T = { cs, en }` dict with the component
   that renders the strings — do not centralize translations while splitting.
3. **Keep the module entry file as composition only** — the original filename
   stays as the public entry (module registry / imports unchanged), reduced to
   layout + wiring. No behavior change, no new abstractions: a split PR should
   be reviewable as pure motion.

One offender per PR, `npm run check` + `test:unit` green, no visual diff.

## Why post-launch

Large components are a maintenance and review-cost problem, not a user-facing
one. The /mvp value lens ranks launch rails (legal, analytics, feedback,
onboarding fallback) above mechanical refactors — same reasoning that kept the
~50-file Button migration deliberate rather than big-bang. Burn this list down
as prep work whenever a feature touches one of the offenders.
