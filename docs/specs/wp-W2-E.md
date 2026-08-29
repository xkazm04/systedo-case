# WP W2-E — Realized-impact ledger: applied change-sets scored against their projection
card #3 (narrow half) · L · gate: contract (additive `realized` on ChangeSet) · wave 2

## Goal
Seven days after a change-set is applied, the sync pipeline measures what actually happened to
the touched campaigns, stores an additive `realized` block beside the projection, shows it as a
ledger row in the campaigns console, and feeds a clamped calibration multiplier back into
`simulateBudgetShift` — the first projected-vs-realized comparison in the codebase (verified:
none exists). Acceptance: realization math pinned over a fixture series (before/after windows,
insufficient-data), multiplier=1 leaves `simulateBudgetShift` byte-identical (pinned like
`test-unit/profit-response-curve.test.mjs:49-78`), calibration needs ≥3 realized sets and
clamps to [0.3, 1.5] (pinned) — ≥22 assertions.

## Non-goals
- No advice generalisation (W3-A owns `src/lib/advice/**` + insights), no Sklik write path
  (S1), no auto-apply (#5 concept). Realization READS; it never mutates campaigns.
- No new store/table: `realized` rides the changeSet doc (`TenantDocs` is schemaless —
  `src/lib/tenant-docs/backend.ts:47-87`; `setDoc(..., {merge:true})` is enough); calibration
  is one doc in a new `"calibration"` collection on the same seam.
- Do not touch `src/app/api/campaigns/state.ts` (its key set is pinned by
  `test-unit/campaigns-state-shape.test.mjs`) — the console reads change-sets via
  `/api/campaigns/control-plane` (`route.ts:24-35`) which already returns the full docs.
- Do not touch `mutations.ts`, `alerts.ts`, `budget-moves.ts`, `db.ts`, `context-map.json`.
- `control-plane.ts` edits are NARROW: `createChangeSet` only (read calibration, pass the
  multiplier, stamp it on the doc). The approve/revert claim machinery is untouched.

## Seams
- Types: `src/lib/campaigns/control-plane-types.ts` — `ChangeSet` (:92-128) gains
  `realized?: RealizedImpact` and `calibration?: AppliedCalibration` (additive-optional, the
  house rule — `:112-117` precedent). NOTE: there is NO `appliedAt`; `approvedAt` (:101) is
  stamped even on failed settles — realization filters `status === "applied"` only.
- Realization math: NEW `src/lib/campaigns/realize.ts` — pure.
  `realizeChangeSet(cs, seriesById, now): RealizedImpact | null` (null = not due yet):
  window = 7 days after `approvedAt` vs 7 days before; per-touched-campaign
  (`cs.moves[].fromId/toId`, `simulate.ts:6-34`) daily actuals from
  `Record<string, DailyPoint[]>` (`DailyPoint`, `src/lib/campaigns/types.ts:198-213`); due when
  `now ≥ approvedAt + 7d`; `insufficient` when the series does not cover ≥5 of 7 days on BOTH
  windows (the campaign-series doc is overwritten per sync and holds only the active period —
  `src/lib/campaigns/store/series.ts:47-78` — so late realization must degrade honestly).
- Runner: NEW async `realizeAppliedChangeSets(tenant, period)` in `realize.ts` (or a sibling
  `realize-run.ts` if the pure file would mix I/O): `listChangeSets(tenant)`
  (`control-plane.ts:111-122`) → applied + unrealized + due → `getCampaignSeries(tenant,
  period)` (`store/series.ts:62-78`) → compute → `(await tenantDocs()).setDoc(tenant,
  "changeSets", id, { realized }, { merge: true })`. Then recompute calibration (below) and
  save it. Never throws (best-effort contract).
- Hook: `src/lib/campaigns/sync.ts` — AFTER `saveCampaignSeries` (:131), before the return
  (:179), gated `if (seriesOk && !degradation.series && !degradation.campaigns)` (the two
  existing honesty gates :142,:157 — scoring against sample data is banned); lazy
  `await import` + try/catch console.error, byte-copy of the W1-A precedent
  (`src/lib/inventory/sync.ts:168-184`). Covers both callers (manual route :245 + cron).
- Calibration: NEW `src/lib/campaigns/calibration.ts` — pure.
  `computeCalibration(sets): Calibration` — over sets with `realized.status === "measured"`:
  ratio = realizedValueDelta / projectedValueGain (`projectedValueGain(sim)`,
  `control-plane-types.ts:178`), guard projections ≤ 0; multiplier = median of ratios clamped
  [0.3, 1.5]; `n < 3` → multiplier 1 (`reason: "insufficient-history"`).
  Persistence: doc `"calibration"/"budget-shift"` via `tenantDocs` in the runner.
- Simulate: `src/lib/campaigns/simulate.ts` — `simulateBudgetShift(rows, moves, opts?: {
  gainMultiplier?: number })`; multiplier applies to the RECIPIENT gains only (:117-119,
  rates :110-111); donor removal is arithmetic, not a prediction. Default 1 → byte-identical
  (pin). Callers stay green (optional param).
- `createChangeSet` (`control-plane.ts:65-109`): read the calibration doc (try/catch → 1),
  pass `gainMultiplier` at :90, stamp `calibration: { multiplier, n }` on the doc (:107) so the
  UI can disclose what the projection assumed.
- Console: `src/components/campaigns/ControlPlane.tsx` — ledger `<li>` (:317-349) gains the
  realized line for applied sets: measured → "Realizováno: {±X} vs. projekce {±Y} ({Z} %)"
  (fmtMoneySigned props already flow in, `CampaignsClient.tsx:561`); insufficient →
  "Nedostatek dat pro vyhodnocení"; pending-due → "Vyhodnocení za N dní". Pending-proposal
  block (:239-273) gains a small "kalibrace ×{m} (z {n} změn)" pill when `calibration.n ≥ 3`.
  `T` dict :20-91 gains cs/en keys. Component is 400+ LOC already — if your additions push
  past the diff comfort, extract `ChangeSetLedgerRow.tsx` (≤200 LOC) rather than growing it.
- The W1-F carry-forward one-key fix while you are in the console area: `GoalPacing`'s
  `statRequiredTitle` still says "at current ROAS" — contradicts the curve footnote when
  `impliedBasis === "curve"` (`src/lib/metrics/pacing.ts:85`; component
  `src/components/dashboard/GoalPacing.tsx:129,332-339`). Make the hover basis-aware
  (both locales). Small, in-scope, noted in the plan (:174-175).
- Tests to copy: `test-unit/campaigns-changeset-transitions.test.mjs` (pure-policy shape, no
  store) for realize/calibration; `test-unit/campaigns-control-plane-local-store.test.mjs`
  (:22-64 temp-db + `mock.module` recipe) for the runner + hook;
  `test-unit/profit-response-curve.test.mjs:49-78` for the byte-identical baseline pin.

## Data contract
```ts
// control-plane-types.ts (additive)
export type RealizedStatus = "measured" | "insufficient";
export interface RealizedImpact {
  status: RealizedStatus;
  computedAt: string;
  windowDays: 7;
  daysCovered: { before: number; after: number };
  campaigns: Array<{ id: string; costBefore: number; costAfter: number;
    valueBefore: number; valueAfter: number }>;      // touched ids only, 7d sums
  realizedValueDelta: number;                        // Σ after − Σ before (touched set)
  projectedValueGain: number;                        // snapshot of projectedValueGain(sim)
  ratio: number | null;                              // null when projection ≤ 0 or insufficient
}
export interface AppliedCalibration { multiplier: number; n: number }
// calibration.ts
export interface Calibration { multiplier: number; n: number; updatedAt: string;
  reason?: "insufficient-history" }
export const CALIBRATION_MIN_SETS = 3;
export const CALIBRATION_CLAMP: readonly [number, number] = [0.3, 1.5];
export const REALIZE_WINDOW_DAYS = 7;
export const REALIZE_MIN_DAYS = 5;
```
A blob written before this WP reads as `realized === undefined` → the UI shows nothing new;
`forwardProjectionApplies` (:173-175) is untouched (it already hides forward projections on
applied sets — the realized row is its honest complement).

## Invariants
- Realization never runs on degraded/sample data (the sync gates); it never re-reads Google —
  only the already-persisted series doc.
- The multiplier is DISCLOSED (stamped on the doc, shown in the UI) — a silently calibrated
  projection would be worse than an uncalibrated one.
- `ratio` uses value (conversionValue), not profit — margins vary per project and the
  projection being scored is `projectedValueGain`; profit stays a rendering concern.
- ADR-0001: everything rides `tenantDocs` (both backends by construction).

## Build steps
1. Types + `realize.ts` pure + `test-unit/campaigns-realize.test.mjs` (windows, partial
   coverage → insufficient, touched-set selection incl. pause moves with no `toId`, ratio
   guards; ≥10).
2. `calibration.ts` pure + test (median, clamp both ends, n<3, zero-projection exclusion; ≥6).
3. `simulate.ts` multiplier + byte-identical pin + a ×0.5 fixture assertion.
4. Runner + sync hook + local-store test (applied set realized after a synthetic series write;
   degraded sync does NOT realize; calibration doc written).
5. `createChangeSet` calibration read + stamp (local-store test asserts the stamp).
6. Console rows + GoalPacing hover fix; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/campaigns src/lib/metrics/pacing.ts
src/components/campaigns src/components/dashboard/GoalPacing.tsx` · `npm run test:unit`
(all `campaigns-*` suites green, `profit-response-curve` untouched-green).

## Acceptance
- Fixture: applied set (approvedAt T−8d) + 30d series → `realized.status "measured"`, exact
  before/after sums, ratio (pinned).
- `simulateBudgetShift(rows, moves)` with no opts — byte-identical result object to the
  pre-WP snapshot (pinned).
- `computeCalibration` on [2 sets] → multiplier 1 + reason; on [0.4, 0.6, 2.9] ratios →
  median 0.6 (pinned); clamp pins at 0.3 and 1.5.
- ≥22 new assertions.

## Hotspot requests
- None mechanical (no migration, no sast, no modes). `context-map.json` (Director).
- Note for the Director: `control-plane.ts` and `ControlPlane.tsx` become W3-A's substrate —
  flag any hunk W3-A must know about in your report.

## Rollback
Revert; `realized`/`calibration` fields in stored docs are ignored by old code (additive
optional); the calibration doc is orphaned but harmless (tenant delete sweeps it —
`deleteAllForTenant` prefix sweep covers new collections automatically).
