# Monthly Report: Live Metrics Ingestion & Tile Model

> Context #41 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 2, Medium: 1, Low: 1)
> Files read: 10

## 1. Two disagreeing definitions of "live data" mislead the user about report honesty

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/lib/report-metrics/resolve.ts:27-44`
- **Scenario**: `resolveReportDataset` (this file) declares a project "live" only once it has actually synced rows in `report_metrics` (`metrics.rows.length > 0`) — the honest signal the Monthly Report and AI recap use to show "Živá data · Google Ads" vs. an illustrative-sample disclaimer (`src/components/app/modules/MonthlyReport.tsx:207-214`). But `src/lib/project-data/source.ts:32-37` (`projectDataSource`) declares a project "live" the instant `project.adsCustomerId` is set — i.e. the account is *linked*, never mind whether a sync has ever run. Linking (`PATCH /api/projects/[id]`, `src/app/api/projects/[id]/route.ts:16-57`) and syncing (`POST /api/projects/[id]/metrics/sync` → `syncReportMetricsFromAds`) are two separate, non-atomic actions — nothing triggers a sync when an account is linked. So immediately after a user links Google Ads, `ProjectSettings.tsx:129-140` and `ContentEngine.tsx:185` show a green "Projekt používá živá data z Google Ads." pill via `projectDataSource`, while the actual Monthly Report the client receives is still built from `getProjectDataset` (sample) via this file's fallback branch (line 43). The two surfaces of the same app tell the user opposite things about the same project at the same moment.
- **Root cause**: `project-data/source.ts` was written first as a forward-looking "sketch" (its own header comment: "Live wiring sketch... at which point only the resolver below changes") for exactly this feature. When the real resolver (`resolve.ts`, this file) was later built with the correct synced-vs-sample signal, the sketch file was left in place and wired into three client components instead of being retired.
- **Impact**: Users are told a project has live data before it does, undermining the app's own "never fabricate" / "honest živá data label" design intent (see this file's and `types.ts`'s header comments). A support conversation ("my report still shows demo numbers even though Settings says live") is the direct cost.
- **Fix sketch**: Don't call `resolveReportDataset` from the client components — it is `server-only` and hits the DB (see Build risk). Instead, in the server components that already own the project (`ProjectOverview.tsx`'s single-project branch at line 214, and whichever server page renders `ProjectSettings`/`ContentEngine`), call `resolveReportDataset(project)` (or a lighter server-only `hasSyncedMetrics(projectId)` helper added next to `getReportMetrics` in `store.ts`) once and pass the resulting `live`/`syncedAt` down as a prop, replacing each client component's local `projectDataSource(project)` call. Retire `project-data/source.ts`'s `live` semantics once no caller derives "live" from `adsCustomerId` alone.
- **Build risk**: `project-data/source.ts` is imported by three `"use client"` components (`ProjectSettings.tsx`, `ContentEngine.tsx`, and transitively via `ProjectOverview.tsx`'s usage pattern). `resolve.ts` carries `import "server-only"` and calls the DB-backed store — wiring it directly into `projectDataSource` (rather than passing a prop from a server component) would break `next build` while `tsc --noEmit` stays green.

## 2. `ReportMetric`/`ReportFormat` hand-copy the overview's `KpiMetric`/`KpiFormat` vocabulary instead of deriving from it

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/report/compute.ts:9-24`
- **Scenario**: This file's own header comment states the report tiles use the "Same metric vocabulary as the overview KPI presets (modules.ts), so the two surfaces reconcile." That's implemented by hand-retyping the union: `ReportMetric` (`compute.ts:9-23`) is `"revenue" | "roas" | "pno" | "conversions" | "cost" | "visits" | "cpa" | "convRate"` plus three report-only extras (`profit`, `poas`, `profitMargin`) — an exact, same-order copy of `KpiMetric` in `src/lib/projects/modules.ts:449-457`. Likewise `ReportFormat` (`compute.ts:24`, `"czk" | "multiple" | "pct" | "int"`) is byte-identical to `KpiFormat` (`modules.ts:459`). Nothing enforces the "reconcile" claim — a developer adding a ninth KPI metric to the overview (e.g. a new efficiency ratio) has no signal to also add it here, and the two lists silently drift.
- **Root cause**: The report tile spec was built as a superset of the overview KPI preset but as an independently-declared type rather than `Exclude<>`/extension of it, likely because they live in different modules (`report/` vs `projects/`) and no shared "metric vocabulary" module exists yet.
- **Impact**: Low today (both lists are short and stable), but it's exactly the kind of "the same metric vocabulary must be kept in sync by hand across two files with no compiler check" debt that produces a silent divergence later — a new KPI shows on the overview but never on the client report, or vice versa, with no error anywhere.
- **Fix sketch**: In `src/lib/report/compute.ts`, replace the hand-written `ReportMetric` union with `export type ReportMetric = KpiMetric | "profit" | "poas" | "profitMargin";` (importing `KpiMetric` from `@/lib/projects/modules.ts`), and `ReportFormat` with `export type ReportFormat = KpiFormat;` (or re-export it directly). No runtime behavior changes — this is a type-only edit.
- **Build risk**: None — `modules.ts` is already framework-free and imported by both server and client code paths (`ProjectOverview.tsx` already imports `KPI_PRESETS` from it), so importing `KpiMetric`/`KpiFormat` into `compute.ts` crosses no new boundary.

## 3. `deltaTone` reimplemented in `LeadQualityModule.tsx` with a different, undocumented dead-band

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/report/compute.ts:110-114`
- **Scenario**: This file exports the canonical `deltaTone(delta: number, goodWhenDown: boolean): DeltaTone`, used by `MonthlyReport.tsx:198` to color the report's own delta pills. `src/components/app/modules/LeadQualityModule.tsx:131-135` defines its own local `deltaTone(delta: number | null, goodWhenUp: boolean): PillTone` — same "flip polarity by a boolean, flat reads neutral" logic, returning a `PillTone` that is a strict superset of `DeltaTone` (`"positive" | "negative" | "neutral"` both ways, per `src/components/ui.tsx:24`), so the return type is trivially compatible. The two disagree on the flat dead-band: this file uses `Math.abs(delta) < 0.0001`, LeadQualityModule uses `Math.abs(delta) < 0.005` — a 50x difference nobody decided on purpose (there is no comment justifying either threshold value specifically). The same tiny delta (e.g. `0.002`) reads "neutral" in one surface and "positive/negative" in the other.
- **Root cause**: Independent implementations of the same "period-over-period delta tone" concept, one per module, instead of one shared helper with a shared (or explicitly parameterized) dead-band.
- **Impact**: Behavioral inconsistency across the app's delta-pill UI, plus double maintenance if the dead-band or the "flat" threshold is ever tuned — a change to `compute.ts`'s `deltaTone` silently doesn't apply to lead-quality tiles.
- **Fix sketch**: Export a small parameterized version from `compute.ts`: `deltaTone(delta: number | null, goodWhenDown: boolean, deadBand = 0.0001): DeltaTone`, treating `null` as neutral. In `LeadQualityModule.tsx`, delete the local `deltaTone` (lines 131-135) and call the shared one as `deltaTone(delta, !goodWhenUp, 0.005)` (or standardize on one dead-band value and document why, then drop the parameter). `ScoreTimeline.tsx:42-46` has a third, more divergent `deltaTone` (returns CSS class names, no flip parameter) — lower-value to consolidate since its output shape differs; worth a follow-up look but not this fix.
- **Build risk**: None — `LeadQualityModule.tsx` and `compute.ts` are both already wired into the same module tree; `compute.ts` is explicitly documented as "Pure & framework-free" so it's safe for a client component to import.

## 4. `MetricRow` hand-redeclares `DailyPoint`'s shape instead of deriving it

- **Severity**: Medium
- **Category**: structure
- **File**: `src/lib/report-metrics/types.ts:6-17`
- **Scenario**: This file's own header comment says the daily row "is exactly the `PerformanceData.daily` shape so the resolver can drop it straight in," and `build.ts`'s header repeats "The `MetricRow` fields are exactly `PerformanceData.daily`'s." In practice `MetricRow` (`types.ts:7-17`) is a fully independent interface (`date`, `visits`, `cost`, `conversions`, `revenue`) rather than derived from `DailyPoint` (`src/lib/types.ts:3-15`, whose required fields are the same five — `impressions`/`clicks` are optional there and absent from `MetricRow`, consistent with the comment). Two hand-maintained interfaces assert an equivalence the type system doesn't check.
- **Root cause**: `report-metrics/types.ts` predates or was written independently of a formal link to `@/lib/types`; the "exactly the same shape" guarantee is enforced only by comment + the manual field-by-field mapping in `build.ts:16-22` and `map.ts:43-49`.
- **Impact**: If `DailyPoint`'s required fields ever change type (e.g. `visits` becomes a float vs int convention, or a new required field is added), `MetricRow` and the two-and-a-half hand-written mapper functions that bridge them (`buildLiveDataset`, `mapAdsRowsToMetrics`) won't get a compiler error pointing at the drift — only a runtime/report-content bug.
- **Fix sketch**: In `src/lib/report-metrics/types.ts`, replace the hand-written `MetricRow` interface with `export type MetricRow = Pick<DailyPoint, "date" | "visits" | "cost" | "conversions" | "revenue">;` (importing `DailyPoint` from `@/lib/types`). No behavior change; `build.ts` and `map.ts` continue to construct plain object literals matching the same field set.
- **Build risk**: None — `@/lib/types` is a plain, framework-free type module already imported on both server and client paths throughout the app.

## 5. `REPORT_TILES` back-compat export is unused anywhere in the repo

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/lib/report/compute.ts:99-100`
- **Scenario**: `export const REPORT_TILES: ReportTileSpec[] = REPORT_TILE_PRESETS.eshop;` is commented "Back-compat: the default (e-shop) tile set. Prefer `reportTilesForType(type)`." A repo-wide grep for `REPORT_TILES\b` finds only this declaration line — every real caller (`src/app/app/[projectId]/mesicni-report/page.tsx:57`, `src/components/demo/DemoModule.tsx:623`, `MonthlyReport.tsx`) already uses `reportTilesForType(project.type)`. Nothing imports `REPORT_TILES`.
- **Root cause**: Leftover from the type-specific tile-preset migration (the module comment literally documents it as superseded); never deleted once every call site had moved to `reportTilesForType`.
- **Impact**: Minor — one unused exported constant. Its main cost is discoverability noise: a future e-shop-only script could grab this instead of `reportTilesForType("eshop")` and silently break when a non-eshop project needs the tiles.
- **Fix sketch**: Delete lines 99-100 (`REPORT_TILES` and its comment) from `src/lib/report/compute.ts`. No import updates needed — nothing references it.
