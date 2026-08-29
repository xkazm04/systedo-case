# WP F1 — Channel ledger: per-source report sections, Sklik report sync, union campaigns read
card #1 (read side) · XL → this WP is L · gate: contract · wave 0 · ADR-0010 governs

## Goal
A project with both a Google Ads link and a Sklik link resolves a live report dataset whose
`channels` has two real rows ("Google Ads", "Sklik") and whose `channelDaily` has one point per
platform per day; a single-source project resolves a dataset **byte-identical** to today
(fixture-pinned). The campaigns console reads the union of the project's per-account tenants,
each row tagged with `source`.

## Non-goals
- NO Sklik mutation, no `AdsMutator`, no change to `src/lib/campaigns/mutations.ts` (S1).
- NO campaign-type segmentation (`advertising_channel_type`) on the Google read; platform is the
  only channel dimension this WP adds. Do not touch the GAQL SELECTs in `src/lib/google/ads.ts`.
- NO new sqlite table. The report-metrics blob is extended additively; `db.ts` is untouched.
- NO UI redesign: `/zisk`, `/vykon`, `/mesicni-report` light up through the resolver alone. The
  only UI edit allowed is (a) the `sklikLinked` toggle in `ProjectSettings.tsx` and (b) a source
  chip on the campaigns table row if it is ≤ 15 lines.
- Do not edit `vercel.json`, `modes.ts`, cascade registries, sast allowlist.

## Seams
- `src/lib/report-metrics/types.ts:28` — `MetricsSource = "google-ads"` → `"google-ads" | "sklik"`.
- `src/lib/report-metrics/types.ts` `ReportMetrics` — add `sources?: Partial<Record<MetricsSource, ReportMetricsSection>>`
  where `ReportMetricsSection = { meta: MetricsSyncMeta; rows: MetricRow[] }`. Top-level `meta`/`rows` keep
  meaning "the primary section" (Google when present, else Sklik) so every legacy reader works.
- `src/lib/report-metrics/sync.ts` — `persistMetrics` is the ONE stamping site. Extend it to write
  into `sources[source]` AND refresh the top-level primary; add `syncReportMetricsFromSklik(project, userId)`
  reusing `fetchSklikSeries` (`src/lib/sklik/adapter.ts:110-131`) via `new SklikClient(httpSklikTransport(), token)`
  with the per-user connection's money mode (`halereConfirmed ? "halere" : "czk"`, see
  `src/lib/campaigns/connector.ts` `resolveSklik`). Map `DailyPoint` → `MetricRow`
  (`visits = clicks`, `revenue = conversionValue`, `clicks`, `impressions`). `customerId` for the
  Sklik section = `"sklik"`. `currencyCode` = `"CZK"`, `timeZone` omitted.
- `src/lib/report-metrics/resolve.ts` — after `isLiveMetrics`, call a new pure
  `blendSections(metrics)` (new file `src/lib/report-metrics/blend.ts`) that returns
  `{ rows, channels, channelDaily, sources: MetricsSource[], mixedCurrency: boolean }`.
  Pass `channels`/`channelDaily` into `buildLiveDataset` (new optional 4th arg). `ResolvedDataset.source`
  widens to `"sample" | MetricsSource | "multi"`; add `sources?: MetricsSource[]`.
- `src/lib/report-metrics/build.ts:64` — `channels: []` becomes `channels: opts?.channels ?? []`,
  `channelDaily: opts?.channelDaily` (only when provided; absent → byte-identical).
- `src/lib/report-metrics/store.ts` — `hasSyncedMetrics` unchanged; add `getReportSection(projectId, source)`
  and `clearReportSection(projectId, source)` (clearing the last section clears the blob).
- `src/lib/projects/types.ts` `Project` + `ProjectPatch` + `normalizeProjectPatch` — `sklikLinked?: boolean`
  (additive; both stores persist it; sqlite: `projects` table uses a JSON/`data` column? **Check** — if a
  column is needed, that IS a `db.ts` migration: stop and report as a seam request instead of adding it).
- `src/app/api/projects/[id]/route.ts` PATCH whitelist — accept `sklikLinked`.
- `src/components/app/modules/ProjectSettings.tsx:91-95` — toggle "Načítat data ze Skliku do tohoto projektu".
- `src/app/api/cron/sync/route.ts:65-125` — beside the Google `reportDue` branch: if `linked?.sklikLinked`
  and the user has a Sklik connection and the Sklik section is due (`isResyncDue` on that section's
  `syncedAt`), call `syncReportMetricsFromSklik`. Never throws (classified result).
- `src/lib/campaigns/provider-precedence.ts` — `chooseAdsSource` → keep the function (tests pin it) but
  add `chooseAdsSources(f): AdsSourceChoice[]` returning the SET (`["google-ads","sklik"]` when both;
  `["sample"]` when none). Document that `chooseAdsSource` is now "the primary".
- `src/lib/campaigns/connector.ts:382` — `resolveSklik` drops `if (connection) return null;` ONLY when
  called for the Sklik target. Implement by adding `resolveCampaignContextForSource(userId, projectId,
  projectType, source: AdsSource)` that resolves exactly one named provider into its own tenant
  (`…_{customerId}` for google, `…_sklik` for sklik); `resolveCampaignContext` keeps its first-wins
  behaviour for every existing caller. Add `resolveProjectTenants(userId, projectId) → { tenant, source }[]`.
- `src/lib/cron/pairs.ts` / `planSyncTargets` — a user with BOTH connections gets an ADDITIONAL
  per-project Sklik target (`customerId: null, source: "sklik"`) for projects with `sklikLinked`.
  Read the existing rule and extend it minimally; pin the single-source cases.
- `src/lib/campaigns/types.ts:162` — `Campaign.source?: AdsSource` (import type from connector or move
  `AdsSource` into types.ts and re-export from connector — prefer the move, keep the export).
- `src/lib/campaigns/sync.ts:105` — stamp `source` on each campaign before `upsertCampaigns`.
- `src/lib/campaigns/store.ts` (public surface) — `listCampaignsForProject(userId, projectId, period)`:
  union over `resolveProjectTenants`, tags rows lacking `source` with their tenant's `SyncMeta.source`.
- `src/app/app/[projectId]/kampane/**` + its data hook — switch the page's read to the union;
  `page.tsx:19,22` description drops "Google Ads".

## Data contract
```ts
// report-metrics/types.ts (additive)
export type MetricsSource = "google-ads" | "sklik";
export interface ReportMetricsSection { meta: MetricsSyncMeta; rows: MetricRow[] }
export interface ReportMetrics {
  meta: MetricsSyncMeta;  // primary section's meta (legacy shape)
  rows: MetricRow[];      // primary section's rows (legacy shape)
  sources?: Partial<Record<MetricsSource, ReportMetricsSection>>;
}
// blend.ts (pure)
export interface Blended {
  rows: MetricRow[];                 // per-day sum across sections (same currency only)
  channels: ChannelShare[];          // one per platform, from section totals
  channelDaily?: ChannelDailyPoint[];// one per platform per day (whatever PerformanceData.channelDaily's shape is — read src/lib/types.ts:78-85 and match it exactly)
  sources: MetricsSource[];
  mixedCurrency: boolean;            // true → rows/channels are the PRIMARY section only
}
```
Legacy-read rule: a blob without `sources` reads as `{ sources: { [meta.source]: { meta, rows } } }`.
Primary = `sources["google-ads"] ?? sources["sklik"]`. Writing a section rewrites top-level `meta`/`rows`
from the primary.

## Invariants
- ADR-0001: both report-metrics backends store the same JSON; no schema change → nothing to migrate.
- ADR-0002 / ADR-0010: every tenant in a union comes from `buildTenantKey(sessionUserId, …)`; the union
  never spans users. `resolveTenant` (single) is untouched for its existing callers.
- Honest labels: a section is "live" only with rows (`isLiveMetrics` rule applies per section).
  `mixedCurrency` must reach `ResolvedDataset` so the report can refuse a blended total.
- Cache Components: no `export const dynamic|runtime` anywhere.
- Money: Sklik rows are native CZK (÷100 only under `halere` mode, exactly as the adapter does).

## Build steps
1. `types.ts` + `blend.ts` (pure) + `test-unit/report-metrics-blend.test.mjs`: legacy blob → one section;
   two same-currency sections → summed rows + 2 channels + channelDaily; mixed currency → primary only.
2. `store.ts` section accessors; `sync.ts` `persistMetrics` writes sections; `syncReportMetricsFromSklik`.
   Extend `test-unit/report-metrics.test.mjs`: a Google-only blob written by the new code equals the old
   shape plus `sources` (assert the top-level fields are unchanged).
3. `resolve.ts` + `build.ts` wiring; fixture-pin single-source resolve output (deep-equal before/after —
   write the "before" fixture from current `master` FIRST, commit it in your report as evidence).
4. `Project.sklikLinked` + PATCH whitelist + Settings toggle (cs/en `T` in the component).
5. Cron branch for the Sklik section.
6. `provider-precedence.ts` set function + tests; `connector.ts` per-source resolver +
   `resolveProjectTenants`; `pairs.ts` extra target; `Campaign.source` stamp; `listCampaignsForProject`;
   console read switch.
7. `npx tsc --noEmit && npm run test:unit && npx eslint <touched files>`; report.

## Gates
`npx tsc --noEmit` · `npm run test:unit` (all; the new tests + `campaigns-tenant-keys`, `cron-sync-plan`,
`report-metrics`, `report-shared-fetch`, `sklik-adapter` must stay green) · `npx eslint <files>`.
Do NOT run `next dev`. `npm run build` is run by the Director.

## Acceptance
- Fixture test: dual-section blob → `resolveReportDataset(...).data.channels.length === 2`.
- Fixture test: single-section blob → deep-equal to the pre-change resolve output.
- `chooseAdsSources({both})` → `["google-ads","sklik"]`; `planSyncTargets` for a dual user with one
  `sklikLinked` project yields exactly one extra Sklik target.
- Unit test count goes up by ≥ 6; zero existing tests modified except to widen a type.

## Hotspot requests
None expected. If `Project.sklikLinked` needs a sqlite column, STOP at step 4 and write the exact
`db.ts` migration as a seam request in your report; continue with steps 5–7 using an in-memory stub
only if the type-level change compiles without the column (it should, if projects store JSON).

## Rollback
Revert the commits; blobs with `sources` still read (legacy readers ignore unknown keys). The
`sklikLinked` flag is inert without the code.
