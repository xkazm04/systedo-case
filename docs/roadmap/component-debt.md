# Component-size debt — post-launch refactor backlog

Finding from the 2026-08-04 `/mvp` launch-readiness run: **98 `.tsx` components
exceed 200 LOC** (99 at the 2026-08-04 re-count after the i18n extraction pass)
against the repo convention of keeping components under 200 LOC (see
`AGENTS.md`). This is quality debt, not a launch blocker — nothing here gates
the release. Priority: **post-launch**, opportunistic (split a file when you
are already editing it), largest-first when scheduled deliberately.

> **Re-measured 2026-08-28 at `ship/adamant-marketing`: 106 `.tsx` files over
> 200 LOC**, after the three `/lp` landing variants (1126 / 525 / 412) were
> deleted outright rather than split — see
> [`landing-variants-retired.md`](./landing-variants-retired.md). The number went
> UP by 8 across the intervening three weeks even with the largest file in the
> repo removed, which is the useful reading of this table: opportunistic splitting
> has not been keeping pace with new surface. Re-measure before quoting it.

## Top 10 offenders

| LOC | Component |
| --- | --- |
| 1034 | `src/components/ai/AdGenerator.tsx` |
| 977 | `src/components/app/modules/CatalogManagerModule.tsx` |
| 944 | `src/components/ai/CreativeStudio.tsx` |
| 943 | `src/components/campaigns/CampaignTable.tsx` |
| 869 | `src/components/app/modules/SpeedLeadModule.tsx` |
| 856 | `src/components/app/modules/MonthlyReport.tsx` |
| 849 | `src/components/app/modules/CompareSeoTable.tsx` |
| 781 | `src/components/app/twin/TwinOutbox.tsx` |
| 778 | `src/components/ai/ContentBriefGenerator.tsx` |
| 758 | `src/app/design-system/page.tsx` |

(LOC re-measured 2026-08-28; re-measure again before starting a split — several
of these files are actively edited. `LandingNewWorld.tsx` (1126) headed this
table until it was retired with the rest of `/lp`; `DistributionModule.tsx` has
since dropped below the top ten.)

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
