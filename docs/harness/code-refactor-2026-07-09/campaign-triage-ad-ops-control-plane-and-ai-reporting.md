# Campaign Triage, Ad-Ops Control Plane & AI Reporting

> Context #36 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 3, Low: 0)
> Files read: 14

## 1. Alert-dispatch pipeline is reimplemented three times instead of shared

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/campaigns/alerts.ts:105-136`
- **Scenario**: `evaluateAndAlert` (alerts.ts:78-137) and `evaluateAnomalyAlerts` (`src/lib/campaigns/anomaly-alerts.ts:113-134`) both run the identical five-step sequence — persist to the in-app inbox via `recordAlert`, log a `recordActivity({ kind: "alert", ... })` entry, fire `sendWebhook`, then conditionally `getUserEmail` + build an escaped `<li>` list + `sendEmail`. A third, independent copy of the same sequence lives outside this context in `src/lib/inventory/sync-alerts.ts:42-53` (`alertSyncFailed`) — and that file's own header comment says it is "reusing the campaigns alert/activity/email pipeline," and it already imports `recordAlert`/`getUserEmail` from `alerts.ts`. The intent to share was already there; the last mile (the record→activity→webhook→email tail) never got factored out.
- **Root cause**: `anomaly-alerts.ts` and `sync-alerts.ts` were built by copying `evaluateAndAlert`'s body and swapping the domain-specific parts (anomaly detection vs. connection health) rather than extracting the common tail.
- **Impact**: Any change to how alerts go out — a new channel, a different webhook payload shape, throttling, retry-on-failure — has to be made in three places in lockstep. They have already begun to drift in small ways (e.g. `sync-alerts.ts` passes `items: []` while the other two build a real `AlertItem[]`), and a fourth alert source (there is already a `"digest"` `AlertType` used by `src/app/api/cron/digest/route.ts` and `src/app/api/cron/report/route.ts`) is the obvious next candidate to copy-paste this a fourth time instead of calling a shared function.
- **Fix sketch**: In `alerts.ts`, extract a `dispatchAlert(tenant, userId, { type, title, body, items, activity: { kind, actor }, emailHtml })` helper that performs the `recordAlert` → `recordActivity` → `sendWebhook` → `getUserEmail`/`sendEmail` sequence once, export it, and have `evaluateAndAlert` call it. Then update `anomaly-alerts.ts::evaluateAnomalyAlerts` and `sync-alerts.ts::alertSyncFailed` to call `dispatchAlert` instead of re-deriving the same four calls.

## 2. `escapeHtml` is hand-copied into five files and has already silently diverged

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/campaigns/alerts.ts:139-143`
- **Scenario**: The exact same character-for-character `escapeHtml` implementation (`s.replace(/[&<>"']/g, (ch) => ch === "&" ? "&amp;" : ...)`) is defined independently in `src/lib/campaigns/alerts.ts:139-143`, `src/lib/campaigns/anomaly-alerts.ts:139-143`, `src/lib/inventory/sync-alerts.ts:16-20`, and `src/app/api/cron/digest/route.ts:25-29`. A fifth copy in `src/lib/distribution/newsletter.ts:68-74` has already drifted: it escapes `&`, `<`, `>`, `"` but is missing the `'` → `&#39;` replacement the other four have, so an apostrophe in newsletter copy renders unescaped where the campaigns/inventory/digest paths would escape it. No shared `escapeHtml`/HTML-escaping utility exists anywhere under `src/lib/` (`format.ts` has no such export) — this is exactly the "two implementations disagree" pattern the duplication rubric warns about, already realized in miniature.
- **Root cause**: Every alert/report/newsletter email builder needed a one-off HTML escape and each was written inline rather than pulled from a shared util, because none existed.
- **Impact**: Low security blast radius today (all five call sites interpolate into text nodes, not attributes), but it is a proof of drift: five copies of a five-line security-adjacent helper cannot be trusted to stay in sync, and the next person fixing an escaping bug in one copy has no reason to know four siblings exist.
- **Fix sketch**: Add `escapeHtml` to a small shared module (e.g. `src/lib/html.ts`) using the five-character (`&<>"'`) version — the more complete of the two variants — and replace all five local definitions with an import. Verify `newsletter.ts`'s output snapshot/tests (if any) still pass once it starts escaping apostrophes.

## 3. Wasted-spend formula recomputed independently in `budget-moves.ts` and `patterns/extract.ts`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/campaigns/budget-moves.ts:51-57`
- **Scenario**: The "wasted spend" ranking formula `cost * (1 - roas / TARGET_ROAS)` is written out verbatim in the donor-ranking step of `recommendBudgetMoves` (`budget-moves.ts:55`) and again in the "money pit to avoid" pattern miner at `src/lib/patterns/extract.ts:74`, which is owned by a different scan context (winning-pattern extraction). Both import the same `TARGET_ROAS` from `./types`, so today the two computations agree, but there is no single named function either one calls — the formula itself, not just the constant, is duplicated.
- **Root cause**: `patterns/extract.ts` was written later to surface a similar "worst campaign" insight and re-derived the same domain formula instead of importing it from `budget-moves.ts` (or a shared metrics module).
- **Impact**: A future change to how "waste" is weighted (e.g. discounting by confidence, or switching from a linear to a diminishing-returns model) is likely to be applied to only one of the two call sites, so the BudgetMoves recommendation panel and the "past patterns" insight card would silently disagree on which campaign is the worst offender.
- **Fix sketch**: Export a `wastedSpend(cost: number, roas: number, target: number): number` helper from `src/lib/campaigns/budget-math.ts` (which already hosts the other pure budget arithmetic), have `budget-moves.ts:55` call `wastedSpend(c.cost, c.roas, TARGET_ROAS)`, and update `patterns/extract.ts:74` to import and call the same helper.

## 4. The audit-mutation write is copy-pasted three times inside `mutations.ts`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/campaigns/mutations.ts:77-208`
- **Scenario**: `applyPause` (lines 77-84), `applyBudgetShift` (lines 143-153), and `restoreBudgets` (lines 196-202) each independently call `firestore.collection("tenants").doc(tenant).collection("mutations").add({ action: "...", ...fields, customerId, userId, at: new Date().toISOString() })`. The envelope (`customerId`, `userId`, `at: new Date().toISOString()`) is byte-identical in all three; only the `action` value and the action-specific fields differ.
- **Root cause**: Each mutation function was added independently and the shared audit-write boilerplate was never factored out, even though all three already share `resolveActor` a few lines above.
- **Impact**: Low risk (single file, no cross-module drift possible), but any change to the audit envelope — e.g. adding a `source` field for future non-UI-triggered mutations, or switching to a batched write — has to be repeated three times, and it's easy to update two of the three and miss one, silently degrading the audit trail's consistency.
- **Fix sketch**: Add a private `logMutation(tenant: string, action: string, fields: Record<string, unknown>, customerId: string, userId: string)` helper in `mutations.ts` that performs the `firestore...collection("mutations").add(...)` call, and have all three exported functions call it instead of building the write inline.

## 5. `BudgetSnapshot` is homed in the governance layer but consumed by the pure math layer beneath it

- **Severity**: Medium
- **Category**: structure
- **File**: `src/lib/campaigns/control-plane-types.ts:35-38`
- **Scenario**: `BudgetSnapshot` ("prior budget value before a shift") is declared in `control-plane-types.ts`, the change-set/guardrail governance layer, whose own header comment describes it as "policy... shared by the server lifecycle and the client console." Yet the module one layer *below* it in the dependency chain — `budget-math.ts`, whose header explicitly says it was "extracted from mutations.ts so the money-moving math... is unit-testable without a live Google Ads / Firestore stack" — has to import `BudgetSnapshot` back up from `control-plane-types.ts` (`budget-math.ts:5`) just to type `dedupeSnapshots`. `mutations.ts:19` does the same. The dependency arrow points the wrong way: the lowest-level, most-reusable module depends on the highest-level policy module for a type that has nothing to do with change-sets or guardrails.
- **Root cause**: `BudgetSnapshot` was added to `control-plane-types.ts` when the exact-revert feature was built there, without noticing that its natural owner (the budget-shift math that produces and consumes it) sits in a lower layer.
- **Impact**: No runtime bug today, but the inverted dependency means `budget-math.ts` can never be extracted or reused (e.g. in a standalone script or test) without also pulling in the control-plane/guardrail type surface, defeating the stated purpose of splitting it out as a dependency-free, unit-testable core.
- **Fix sketch**: Move the `BudgetSnapshot` interface into `budget-math.ts` (next to `dedupeSnapshots`, its main consumer), then in `control-plane-types.ts` replace the local declaration with `export type { BudgetSnapshot } from "./budget-math";` so `ChangeSet.budgetSnapshots` keeps working unchanged for every existing importer.
- **Build risk**: `control-plane-types.ts` is imported by the client component `src/components/campaigns/ControlPlane.tsx` (for `ChangeSet`, which embeds `BudgetSnapshot`). Verified `budget-math.ts` has no server-only imports (no `firebase`, no `node:sqlite`) — it only imports a type from `control-plane-types.ts` today — so re-homing `BudgetSnapshot` there and re-exporting it does not pull any server-only code into the client bundle. Still worth a `next build` check after the move, not just `tsc`, per this project's known tsc-invisible client/server boundary gap.
