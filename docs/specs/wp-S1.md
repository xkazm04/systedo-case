# WP S1 — Sklik write path: the first real Sklik mutation, behind an `AdsMutator` seam
card #1 (write half) · XL (narrowed to L: budget + status only, single-tenant change-sets) · gate: **irreversible** (real account mutations) · wave 4 · SERIAL — S1b and S3 build on this

## Goal
A change-set on a Sklik tenant (`…_sklik`) can be APPROVED and REVERTED: the control plane
dispatches every move through a per-platform `AdsMutator` (Google = today's behaviour,
byte-identical and pinned; Sklik = new, fixture-proven), budget snapshots become
per-platform (legacy Google blobs read tolerantly), and three independent rails make the
first real Sklik write impossible by accident: (1) method names live as isolated,
documented constants whose failure DEGRADES (the `SKLIK_KEYWORDS_METHOD` precedent),
(2) a Sklik write is REFUSED unless the account's money-unit verdict is settled
(`czk-plausible` or `halereConfirmed`) — a budget written against an unsettled unit could
be 100× wrong, (3) a global `SKLIK_WRITES_ENABLED` env flag (default OFF) so deploying
this code mutates nobody's account until the owner flips it after the live proof.
`crossSource` moves are guard-railed OFF by default. Acceptance: Google path pinned
byte-identical (audit actions, snapshots, revert), Sklik apply+revert pinned through
the fixture transport (exact method + params), all three rails pinned red-then-green
— ≥30 assertions.

## Non-goals
- No keyword/query moves (S1b), no conversion upload (S3), no union (project-level)
  change-sets: `createChangeSet` stays single-tenant (`control-plane.ts:91`); the
  `crossSource` guardrail is future-proofing for union sets and cannot trigger yet —
  say so in code. No Sklik ad-group/keyword writes; budget (`dayBudget`) + status only.
- No haléře conversion of budgets: `dayBudget` is native CZK
  (`sklik/adapter.ts:87-89`, `types.ts:20-22`) — the write sends CZK integers. The
  verdict gate exists because an UNSETTLED account might be one where that assumption
  is wrong; it is a refusal, not a conversion.
- Do not change `recommendBudgetMoves` pairing logic beyond carrying `source` on moves.
- Do not touch `src/app/api/ai/**`, insights, leads, twin, social (S2 runs in parallel
  on twin/**). `context-map.json`, `sast-allowlist` untouched (no new public route).
- No live call from any test. The live proof is a MANUAL owner step (§Live proof).

## Seams
- **Mutator seam (NEW `src/lib/campaigns/mutator.ts`):** contract below.
  `mutatorForTenant(userId, tenant): Promise<MutatorResolution>` replaces
  `resolveActor` (`mutations.ts:66-91`): reads `getSyncMeta(tenant).source`; `google-ads`
  → `googleMutator(actor)` (wraps `pauseCampaign`/`resumeCampaign`/`fetchCampaignBudgets`/
  `setCampaignBudgetMicros`, `google/ads.ts:173-285`, unchanged); `sklik` →
  `sklikMutator(client, {mode})` ONLY when all three rails pass, else a typed refusal
  `{ ok: false, error, code: "sklik-writes-disabled" | "sklik-unit-unsettled" | "sklik-not-connected" }`
  (the existing Czech refusal string at `mutations.ts:74-77` becomes the
  `sklik-writes-disabled` message; the unit message says what to do — confirm the unit in
  Nastavení). `sample` → refusal (unchanged behaviour).
- **`mutations.ts`** (`applyPause` :96, `applyResume` :133, `applyBudgetShift` :172,
  `restoreBudgets` :289): each resolves the mutator and calls it; the Google branch's
  audit docs (`action:"pause"|"resume"|"budget_shift"|"budget_shift_failed"|
  "budget_restore"`, fields) and activity strings stay BYTE-IDENTICAL (pin via the
  existing local-store suite untouched + a snapshot-equality test). Budget math for
  Sklik: `planBudgetMove` (`budget-math.ts:56-67`) works in micros — call it with CZK×1e6
  and divide back, so `MIN_DAILY_CZK` (:13) is the one floor for both platforms (pin:
  a Sklik shift that would push a donor under 10 CZK/day → `at_min`).
  Sklik audit docs carry `platform: "sklik"` and `dailyMovedCzk` (never micros).
- **Sklik client writes (`src/lib/sklik/client.ts`):** NEW isolated constants beside
  `SKLIK_KEYWORDS_METHOD` (:89) with the same rationale comment:
  `SKLIK_CAMPAIGN_UPDATE_METHOD = "campaigns.update"` (payload
  `[user, [{ id, dayBudget }]]` for budget; `[user, [{ id, status }]]` for pause/resume —
  status literals also constants: `SKLIK_STATUS_ACTIVE = "active"`, `SKLIK_STATUS_SUSPEND
  = "suspend"`). Methods `setCampaignDayBudget(id, czk)`, `setCampaignStatus(id, status)`,
  `readCampaignBudgets(ids)` (reuses `campaigns.list` :140-160, `dayBudget` column). Ids
  go back to `Number` (`adapter.ts:91` stringified them). Every write method: `login()`
  first, refresh session from the response, throw `SklikApiError` on `status >= 300`.
  Header of `sklik/types.ts:7` ("Mutations stay Google-only for now") and
  `adapter.ts:1-9` ("DATA-IN only") get updated to name S1 and the rails.
- **Rails:**
  1. Method constants + degrade: an unknown-method throw surfaces as
     `MutationResult{ok:false, error}` — the change-set settles `failed`, nothing else
     moves (pin with a fixture transport that throws `unexpected Sklik method`).
  2. Unit verdict: `SklikConnection.moneyVerdict` / `halereConfirmed`
     (`sklik-connection.ts:25-36`); rule `writable = halereConfirmed === true ||
     moneyVerdict === "czk-plausible"`; pure `sklikWritable(conn)` in `mutator.ts`, pinned
     for all four verdict states × confirmed.
  3. `SKLIK_WRITES_ENABLED` env (read in `mutatorForTenant`; `"1"` only; absent = off;
     the `DEV_AUTH`-style prod-ignored pattern is NOT wanted here — prod must be able to
     turn it on). `npm run doctor` line (env preflight in `scripts/doctor.mjs` — add the
     name to its env list, reporting rung).
- **Snapshots:** `control-plane-types.ts:48-51` `BudgetSnapshot` becomes a discriminated
  union (contract below). Reader `normalizeBudgetSnapshot(raw)`: no `platform` →
  google (legacy). `restoreBudgets` groups by platform and calls the right mutator;
  `dedupeSnapshots` (`budget-math.ts:71-77`) keys on `platform + id`. `StatusSnapshot`
  (:56-62) is already platform-agnostic — gains optional `platform`.
- **Apply/revert loop (`control-plane.ts:276-299`, :354-433):** unchanged in shape — the
  mutations module hides the platform; the loop only learns to push per-platform
  snapshots. `MoveResult` (:85-90) gains `platform?`.
- **Moves carry source:** `BudgetMove` (`simulate.ts:6-34`) gains `fromSource?`/
  `toSource?: AdsSource`; `recommendBudgetMoves` stamps them from the rows (rows carry
  `source` after the union read, `store.ts:86`); `checkPolicy` (:193-208) gains the
  breach "Přesun mezi sítěmi (Google ↔ Sklik) není povolený" when sources differ and
  `!policy.crossSource`; `ControlPolicy` (:12-19) gains `crossSource?: boolean`,
  `DEFAULT_POLICY` leaves it undefined (= off). Pin: mixed-source moves breach by
  default, pass with `crossSource: true`.
- **Route + console (single-tenant, source-selectable):**
  `src/app/api/campaigns/control-plane/route.ts` GET/POST accept optional
  `source: AdsSource`; tenant = `resolveCampaignContextForSource(...)`
  (`connector.ts:506-528`) when given, else today's `resolveTenant` (byte-identical
  default). `ControlPlane.tsx`: when `sources` meta (from `campaigns-state.ts:80`) lists
  more than one, a two-pill source switch above the proposal (≤ 15 lines; extract
  `SourceSwitch.tsx` if it would grow the file past its current size); the approve
  button gets a THIRD confirm condition — a Sklik set shows "Provede skutečnou změnu
  rozpočtu ve Skliku" copy (`T` :43-46/:75-78 shape) and the ledger row a `Sklik`
  pill (`SourceSections.tsx:24,:40` label precedent). Refusal codes from the route
  render as a plain notice with the next step (enable writes / confirm the unit).
- **Live proof (manual, documented in `docs/deploy.md` under a new "Sklik writes"
  heading — one paragraph):** 1) `SKLIK_WRITES_ENABLED=1` in a non-prod env with a real
  token, 2) a test campaign, 3) create + approve a 1-move change-set of the smallest
  amount, 4) verify in the Sklik UI, 5) revert from the console, 6) verify restored, 7)
  only then flip the flag in prod. The fixture proof is the gate; the live proof is the
  owner's.
- Tests to copy: `test-unit/campaigns-control-plane-local-store.test.mjs` (mock shape
  :60-90 — a Sklik variant mocks `@/lib/campaigns/sklik-connection` + injects a fixture
  `SklikTransport` via `mutator.ts`'s injectable client factory, NOT `@/lib/google/ads`),
  `test-unit/sklik-adapter.test.mjs:50-67` fixture transport (extend its switch with the
  update method), `budget-math.test.mjs`.

## Data contract
```ts
// src/lib/campaigns/mutator.ts
export interface AdsMutator {
  readonly source: "google-ads" | "sklik";
  pause(campaignId: string): Promise<void>;
  resume(campaignId: string): Promise<void>;
  readBudgets(ids: string[]): Promise<Map<string, PlatformBudget>>;
  setBudget(target: PlatformBudget, czkPerDay: number): Promise<void>;
}
export type PlatformBudget =
  | { platform: "google-ads"; campaignId: string; budgetResourceName: string; amountMicros: number }
  | { platform: "sklik"; campaignId: string; dayBudgetCzk: number };
export type MutatorRefusal = "sklik-writes-disabled" | "sklik-unit-unsettled" | "sklik-not-connected" | "google-not-configured" | "sample-tenant";
export type MutatorResolution = { ok: true; mutator: AdsMutator; tenant: string } | { ok: false; code: MutatorRefusal; error: string };
export const SKLIK_WRITES_ENV = "SKLIK_WRITES_ENABLED";
// control-plane-types.ts
export type BudgetSnapshot =
  | { platform?: "google-ads"; budgetResourceName: string; prevMicros: number }   // legacy shape = google
  | { platform: "sklik"; campaignId: string; prevDayBudgetCzk: number };
// simulate.ts (additive)
BudgetMove.fromSource?: AdsSource; BudgetMove.toSource?: AdsSource;
// control-plane-types.ts (additive)
ControlPolicy.crossSource?: boolean;
```
Audit doc (Sklik): `{ action, platform: "sklik", campaignId|fromId/toId, dailyMovedCzk?, userId, at }`.

## Invariants
- Google behaviour byte-identical: the existing control-plane local-store suite passes
  UNMODIFIED; audit action names/fields unchanged; snapshot blobs written for Google
  carry NO `platform` key (so a rollback of this WP reads them) — pin it.
- Every Sklik write goes through ONE client method per operation; the fixture asserts
  exact `[method, params]`; a write never runs without `login()` first.
- The three rails are independent and each pinned red→green; a refusal never mutates,
  never writes an audit doc, and settles the set `failed` with the refusal message.
- ADR-0002: tenant still derived from the session (`rejectUnknownProject` in the route).
- Cache Components: no `export const dynamic`.

## Build steps
1. `mutator.ts` (types, `sklikWritable`, `mutatorForTenant`, google impl) +
   `test-unit/campaigns-mutator.test.mjs` (rails ×3, verdict matrix, refusal codes; ≥12).
2. Sklik client writes + fixture-transport pins (method/params exact, login-first,
   unknown-method degrade; ≥6).
3. Snapshot union + tolerant reader + `dedupeSnapshots` + `restoreBudgets` grouping
   (legacy blob pin).
4. `mutations.ts` re-pointed; Google byte-identity pin (existing suite untouched +
   audit doc deep-equal); Sklik apply+revert local-store variant (≥8).
5. `BudgetMove` sources + `crossSource` policy + pins.
6. Route `source` param + console switch/confirm/pill + `T`; doctor env line; deploy
   doc paragraph; type/adapter header updates; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/campaigns src/lib/sklik src/app/api/campaigns/control-plane
src/components/campaigns scripts/doctor.mjs` · `npm run test:unit` (all `campaigns-*`,
`sklik-*`, `budget-math` suites green).

## Acceptance
- Fixture: Sklik tenant, verdict `czk-plausible`, env on → approve a 1-shift set →
  transport saw `client.loginByToken`, then `campaigns.list` (read), then exactly two
  `campaigns.update` calls with `[user, [{id: Number, dayBudget}]]`; snapshots
  `{platform:"sklik", …}`; revert → two restoring updates (pinned).
- Same fixture with env off → set `failed`, zero `campaigns.update` calls, refusal code
  `sklik-writes-disabled`; with verdict `halere-suspected` + unconfirmed →
  `sklik-unit-unsettled` (pinned).
- Google suite unmodified green; audit deep-equal pin.
- `checkPolicy` mixed-source breach default / pass with flag (pinned).
- ≥30 new assertions.

## Hotspot requests
- None mechanical. `context-map.json` (Director). `docs/deploy.md` paragraph is yours.
- Note for S1b: expose `AdsMutator` extension points it will need (criterion writes) as
  a documented TODO in the interface header — do NOT add them.

## Rollback
Revert; Sklik audit docs are inert history; snapshot blobs with `platform:"sklik"` are
unreadable to old `restoreBudgets` (it would ignore them) — a reverted deploy must not
try to revert a Sklik set; `SKLIK_WRITES_ENABLED` unset = the old refusal.
