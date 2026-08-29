# WP W3-A — Advice ledger: every recommendation gets an identity, a snapshot, and an outcome
card #3 (generalises W2-E) · XL (narrowed to L: render-driven, no new cron) · gate: contract (subjectKey on every producer; new project_state key) · wave 3 · **insights-producer owner**

## Goal
Every `Recommendation` carries a stable, locale-free `subjectKey` and (where a number exists)
a metric snapshot; a per-project advice ledger persists what was actually SHOWN to the
operator, marks advice resolved when its signal disappears, scores it against the snapshot
(improved/unchanged/worse, 5% dead-band, `pno`-style inverse keys), and the outcomes surface
as Overview chips, a weekly-digest section, and monthly-recap grounding — so "the app's
advice works" stops being a feeling. Acceptance: every producer emits `subjectKey` (pinned
by an enumerating test), the pure ledger update is pinned (first-seen/last-seen/resolve/
outcome/cap), the digest section degrades to `""`, the recap grounding is byte-pinned cs+en
— ≥28 assertions.

## Non-goals
- No new cron step and no server-side re-assembly of recommendation inputs: the ledger is
  updated best-effort ON RENDER, where `collectRecommendations` already runs with all its
  inputs (`ProjectOverview.tsx:237-255`, `portfolio-model.ts:191-226`). An outcome only
  means something relative to when the operator could SEE the advice — a ledger of unseen
  advice would be noise. (`LEDGER_STEPS` untouched.)
- No auto-apply, no LLM. No edit to `src/lib/report/assemble.ts` — it is numbers-in/
  numbers-out with no narrative slot (verified); the recap join is the
  `recap-context.ts` → `grounding.ts` path.
- Change-set outcomes are READ (via `listChangeSets` + `cs.realized`, W2-E), never
  recomputed here; `control-plane*.ts`, `realize*.ts`, `calibration.ts` untouched.
- Sample-derived advice (`sample: true`) is tracked but NEVER scored and never reaches the
  digest section or recap grounding — an outcome measured on fixture data would be the
  exact dishonesty W2-E's degradation gates exist to prevent.
- Do not edit `context-map.json`; `src/lib/project-state/keys.ts` gets exactly ONE key.

## Seams
- **Identity (you are the producer owner):** `src/lib/insights/types.ts:11-33`
  `Recommendation` gains `subjectKey: string` (required) and
  `snapshot?: { key: string; value: number }`. `src/lib/insights/aggregate.ts` — every
  producer (the table: eshopRecs :78-175, appRecs :187-225, leadgenRecs :227-267,
  localRecs :318-368, contentRecs :370-385, channelRecs :414-463, publishingRecs
  :487-525) emits a locale-free, entity-scoped subjectKey
  (`zisk:unprofitable-channel:{channel}`, `sklad:stockout:{sku}`,
  `lokalni:coverage-gap:{service}|{area}`, `kanaly:over-cap:{channel}`, …) — slugified,
  diacritic-folded (reuse `coverageKey`-style folding or `slugify`). `id` stays as the
  React key; the ledger keys on `subjectKey` alone. Snapshot only where a real number
  exists (POAS, LTV:CAC, coverage fraction, days-of-cover, over-cap count) — key names
  chosen once and documented in types.ts. Fix the known identity wart while there:
  `portfolio-model.ts:221` re-keys ids with the comment "rec ids aren't project-scoped" —
  keep the re-key but base dedupe on `subjectKey`.
- **Ledger (NEW `src/lib/advice/ledger.ts`, pure):** types below +
  `updateAdviceLedger(ledger, recs, now)` — upsert by subjectKey (bump lastSeenAt/
  timesSeen; snapshot captured at FIRST sight only), resolve records absent for
  ≥ `ADVICE_RESOLVE_AFTER_DAYS`, score resolved-with-snapshot via the diagnoses semantics
  (`src/lib/diagnoses/outcome.ts:70-122` — dead-band :92, inverse keys :85-87, zero-
  baseline fallback :108-115; copy the SEMANTICS, do not import the diagnosis-typed
  functions), evict beyond cap (oldest resolved first, open never evicted before
  resolved). A record whose signal returns after resolve REOPENS as the same subject
  (timesSeen keeps counting; prior outcome kept in `history`? NO — keep it flat: reopen
  clears `resolvedAt`/`outcome`, `reopenedCount++`).
- **Current value for scoring:** the CURRENT recs list is the measurement — a resolved
  subject has no current row, so the outcome compares `snapshot.value` against the LAST
  seen snapshot value (captured on every sighting into `lastValue`). Scoring needs no
  external reads; it is `firstValue` vs `lastValue` of the same signal. State that in the
  file header — it is the design's honesty core (the ledger measures what the signal
  itself reported, nothing else).
- **Persistence:** rides `project_state` (NO migration) — key `adviceLedger` registered in
  `src/lib/project-state/keys.ts:47-67` as `{ owner: "prehled", version: 1, http: false }`
  (server-owned for the `organicOutcomes` reason, :60-65: a client that could POST the
  blob could write itself outcomes). Store wrapper NEW `src/lib/advice/store.ts` copying
  `src/lib/organic-channels/outcomes-state.ts` (CAS via `mutateProjectState`).
- **Render hook:** `src/components/app/ProjectOverview.tsx:243-255` (single-project) and
  `src/lib/…/portfolio-model.ts:211-226` (portfolio) — after computing recs, fire
  best-effort `void recordAdviceSighting(projectId, recs)` (NEW in
  `src/lib/advice/record.ts`: read ledger → `updateAdviceLedger` → save; try/catch
  console.error; SKIP demo projects — `isDemoProjectId` — and skip inside the all-demo
  module memo at `portfolio-model.ts:241-259`).
- **Chips:** `NeedsAttention` (`ProjectOverview.tsx:117-200`) — beside the sample pill
  precedent (:177-181): an outcome mini-section "Vyřešeno nedávno" under the list (≤3
  most recent resolved-with-outcome records, chip per `OutcomeStatus` mirroring
  `DiagnosisTracking`'s chip look), plus a small "sledováno od {date}" title attr on open
  rows that have a ledger record. Extract to NEW
  `src/components/app/overview/AdviceOutcomes.tsx` (≤200 LOC, `T` cs/en) — do not grow
  ProjectOverview past its current size.
- **Status route:** NEW `src/app/api/projects/[id]/advice/route.ts` — GET (the ledger),
  PATCH `{ subjectKey, status: "dismissed" | "open" }` (dismiss/undo only — `resolved` is
  machine-minted; 422 unknown status, 404 unknown subject) copying the diagnoses PATCH
  shape (`src/app/api/projects/[id]/diagnoses/route.ts:49-64`, `requireOwnedProject`).
  Dismissed records stop rendering in NeedsAttention (filter by ledger in the component)
  but stay in the ledger.
- **Digest section:** `src/app/api/cron/digest/route.ts` — `let adviceHtml = ""` beside
  :187-189; populate in the once-per-project block (after :239): resolved-in-last-7-days
  outcomes ("Rada „{title}" — {improved: metrika ±X %}"), empty → `""` (the section
  idiom); concat at :255-262 after `insightHtml`. Renderer lives in NEW
  `src/lib/advice/digest.ts` (pure, returns `{ alertBody, html }` like `renderDiagnosis`
  :45-74) so the route change is ~10 lines.
- **Recap grounding:** `src/lib/report/recap-context.ts` gains
  `adviceOutcomesGroundingText(ledger, locale): string` ("" when no scored outcomes);
  wire into `mergeGrounding` at `src/app/api/ai/grounding.ts:131` (after
  `annotationsGroundingText`) + its `updatedAt` into `keySuffix` :134-136 (cache
  invalidation — REQUIRED, a stale key would serve pre-outcome recaps). `grounding.ts` is
  YOURS this wave (W3-B keeps its resolvers in lib).
- **W2-E join:** `src/lib/advice/changesets.ts` (pure) — map `ChangeSet[]` with
  `realized` (`control-plane-types.ts:155-181`) into the same digest/grounding row shape
  ("Změna rozpočtu {±X} vs. projekce {±Y}"), read via `listChangeSets(tenant)` in the
  digest route (tenant already in scope there) and in grounding (resolve tenant the way
  the digest does). Read-only.
- Tests to copy: `test-unit/campaigns-changeset-transitions.test.mjs` (pure, storeless)
  for ledger math; `diagnoses-outcome` suite shape for scoring; digest-section test
  fixture shape from the existing digest suites.

## Data contract
```ts
// src/lib/advice/ledger.ts
export type AdviceStatus = "open" | "resolved" | "dismissed";
export type AdviceOutcomeStatus = "improved" | "unchanged" | "worse";
export interface AdviceOutcome { status: AdviceOutcomeStatus; deltaPct: number | null; at: string }
export interface AdviceRecord {
  subjectKey: string;
  module: string; severity: string;
  title: string;                    // display only, locale of first sighting
  firstSeenAt: string; lastSeenAt: string; timesSeen: number; reopenedCount: number;
  snapshot?: { key: string; firstValue: number; lastValue: number };
  impactCzk?: number; sample?: boolean;
  status: AdviceStatus;
  resolvedAt?: string; outcome?: AdviceOutcome;   // only on resolved, only with snapshot, never on sample
  dismissedAt?: string;
}
export interface AdviceLedger { records: AdviceRecord[]; updatedAt: string }
export const ADVICE_LEDGER_CAP = 200;
export const ADVICE_RESOLVE_AFTER_DAYS = 3;
export const ADVICE_OUTCOME_DEADBAND = 0.05;
export const ADVICE_INVERSE_KEYS: readonly string[] = ["pno", "daysToStockout"];
```
A ledger blob written before a field existed reads via a `sanitizeAdviceLedger` (unknown
records dropped, missing counters defaulted) — the project_state version stays 1.

## Invariants
- ADR-0001 by construction (project_state trio); ADR-0002: route keyed by
  `requireOwnedProject`; the ledger write path is server-only (`http: false` key).
- Honesty: `sample` advice never scored, never in digest/grounding; a snapshot-less
  resolve gets NO outcome (absence ≠ zero — the `measuredBadge` rule,
  `organic-channels/outcomes.ts:163-168`); dead-band + inverse-key semantics identical to
  diagnoses so the two outcome chips can never disagree about direction.
- The render hook is fire-and-forget and can never fail or slow a page render.
- Cache Components: no `export const dynamic`; the render hook lives in already-dynamic
  server components.

## Build steps
1. `types.ts` + every producer gains subjectKey/snapshot; NEW
   `test-unit/insights-subject-keys.test.mjs` — enumerate `collectRecommendations` over
   fixture projects of every type and assert EVERY rec has a non-empty, diacritic-free,
   locale-INDEPENDENT subjectKey (compute cs and en, assert subjectKey sets equal; ≥8).
2. `ledger.ts` pure + `test-unit/advice-ledger.test.mjs` (upsert, first/last value,
   resolve-after-days, outcome incl. dead-band + inverse + zero-baseline, reopen, cap
   eviction order, sample-never-scored; ≥12).
3. `store.ts` + `record.ts` + keys.ts registration + a local-store test (CAS write, demo
   skip).
4. Route (GET/PATCH) + test (dismiss hides, undo restores, 404/422, machine-only
   resolved).
5. `digest.ts` + `changesets.ts` + digest route wiring + section test (renders, degrades
   to ""); `recap-context` grounding + byte-pin cs/en + keySuffix test.
6. `AdviceOutcomes.tsx` + ProjectOverview/portfolio wiring; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/insights src/lib/advice src/lib/report
src/app/api/ai/grounding.ts "src/app/api/projects/[id]/advice" src/app/api/cron/digest
src/components/app/ProjectOverview.tsx src/components/app/overview` · `npm run test:unit`
(all existing insight/digest/grounding suites green — extending them is expected, breaking
them is not).

## Acceptance
- subjectKey parity pinned (cs set === en set, every rec, every project type).
- Ledger fixture: rec seen 3× → resolved after 3 absent days → outcome `improved`
  (coverage 0.4 → 0.7) with exact deltaPct; `pno` fixture inverts (pinned).
- Digest fixture: 1 scored outcome → section html contains the title + signed delta;
  0 outcomes → `""` (pinned).
- `adviceOutcomesGroundingText` byte-pinned for a 2-outcome fixture, cs + en.
- ≥28 new assertions.

## Hotspot requests
- None mechanical (no migration, no modes.ts, no sast). `context-map.json` (Director).
- NOTE: `src/app/api/cron/digest/route.ts` and `src/app/api/ai/grounding.ts` are YOURS
  this wave (verified no other W3 builder touches them) — edit directly.

## Rollback
Revert; the `adviceLedger` project_state blobs are ignored by old code (unknown key reads
null); no public surface, no migration.
