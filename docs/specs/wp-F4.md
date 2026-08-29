# WP F4 — Ledgers cron: one guarded route with a step registry
cards #2, #9, #13, #29 (shared prerequisite) · M · gate: policy (a new cron) · wave 0

## Goal
`GET /api/cron/ledgers` (CRON_SECRET-guarded) runs every registered step whose `due()` says so,
records one `cron_runs` row with per-step counts, and never lets one step's failure stop the
others. Ships with ONE real step (`heartbeat`, no-op that records it ran) so the pipe is proven.
Later WPs register steps; nobody edits `vercel.json` again.

## Non-goals
- No business steps (conversion drain, webhook retry, go-link rollup, social read-back come with
  W3-C, W1-E, W2-A, W3-D). No fan-out over tenants inside this WP beyond what a step needs.
- Do not touch the five existing crons.

## Seams
- `src/lib/cron-auth.ts` — `cronAuthorized(request)`; copy the guard shape from
  `src/app/api/cron/sync/route.ts:30-33`.
- `src/lib/cron/run.ts` — `recordCronRun(cron, startedAt, outcome)`; `src/lib/cron/run-record.ts` for the
  `CronRunOutcome` shape (read it; fit per-step counts into `counts` / `results`).
- `src/lib/cron/sent-guard.ts:16` — `SentGuardKind = "digest-weekly"` → widen to
  `"digest-weekly" | \`ledger-${string}\`` so steps can claim periods per tenant. Check both backends
  accept any string (they should; the `kind` column is TEXT) and that `cron-guards.test.mjs` still passes.
- `src/lib/readiness.ts:161-174` `cronsStale` — the health probe has a max-age per cron; add `ledgers`
  with the schedule's interval × 2 (read how the others are listed; keep the shape).
- `vercel.json` — add `{ "path": "/api/cron/ledgers", "schedule": "30 * * * *" }` (offset from `sync`).
- `docs/deploy.md` — crons section: add the row (doc-sync rule).
- SAST: `npm run sast` treats `src/app/api/cron/*` how? Read `scripts/sast.mjs` route-auth rule; the
  other cron routes pass by referencing `cronAuthorized` — do the same. If it still flags, STOP and
  write the allowlist entry as a seam request.

## Data contract
```ts
// src/lib/cron/ledgers.ts (pure registry + planner; framework-free)
export interface LedgerStep {
  id: string;                                   // "heartbeat", later "conversions", "webhooks", …
  due(now: Date, lastRunAt: string | null): boolean;
  run(ctx: { now: Date; startedAt: Date }): Promise<{ ok: boolean; counts: Record<string, number>; error?: string }>;
}
export const LEDGER_STEPS: readonly LedgerStep[];
export function planLedgerSteps(steps, now, lastRuns): LedgerStep[];  // pure: which are due
```
Route: `src/app/api/cron/ledgers/route.ts` — `export const maxDuration = 300` (check the other cron
routes for the exact export they use; mirror it), iterate `planLedgerSteps`, per-step try/catch,
aggregate `{ steps: { [id]: counts|error } }` into `recordCronRun("ledgers", …)`.
`lastRuns`: read from the cron-runs store (`src/lib/cron/runs-store.ts`) — the latest `ledgers` record's
per-step timestamps; if the record shape can't carry them, keep a per-step `lastRunAt` inside the
`results` payload and read it back (document the choice).

## Invariants
- ADR-0007: the cron is a new blocking-rung surface only through existing gates (`sast`, `check`).
- Fails closed without `CRON_SECRET` (guard does this).
- Cache Components: mirror the other cron route files exactly for any route-segment exports.
- Best-effort recording (`recordCronRun` never throws).

## Build steps
1. `ledgers.ts` registry + planner + `test-unit/cron-ledgers.test.mjs` (due/not-due, failure isolation
   with a throwing fake step, counts aggregation).
2. Route + `vercel.json` + `readiness.ts` max-age + `docs/deploy.md` row.
3. `SentGuardKind` widening + guard tests green.
4. `npm run sast` + gates; report.

## Gates
`npx tsc --noEmit` · `npm run test:unit` · `npm run sast` · `npx eslint <files>`.

## Acceptance
- Unit: a registry of `[ok, throwing, ok]` steps yields 3 results, 1 error, run continues.
- `curl` shape (describe, don't run `next dev`): unauthorized → 401; authorized → `{ ok, steps }`.
- `npm run sast` green.

## Hotspot requests
- `vercel.json`: OWNED by this WP (serial). Edit directly.

## Rollback
Remove the vercel.json entry; the route is inert without a schedule.
