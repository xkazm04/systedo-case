# Campaign Triage, Ad-Ops Control Plane & AI Reporting

> Total: 5
> Critical: 0 · High: 2 · Medium: 2 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `applyBudgetShift` is non-atomic: donor budget is lowered, then a failing recipient write leaves the account starved with no snapshot and no audit record

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/campaigns/mutations.ts:140`
- **Scenario**: `applyBudgetShift` calls `setCampaignBudgetMicros(...from...)` at line 140 and then `setCampaignBudgetMicros(...to...)` at line 141 as two independent Google Ads REST calls with no transaction. If the second call throws (network blip, quota/rate-limit 429, transient 500, token expiry mid-request — all normal for the Ads API), the donor's daily budget has *already* been reduced in the live account, but control flow jumps to the `catch` at line 168, which returns `{ ok: false, error }`. Because the function returns before line 143, **no `mutations` audit doc is written, `recordActivity` never runs, and no `snapshots` are returned**. In `control-plane.ts::approveChangeSet` (line 108) `if (r.ok && r.snapshots)` is false, so `budgetSnapshots` stays empty for that move.
- **Root cause**: The code assumes two sequential external mutations either both succeed or both are irrelevant; it treats a two-write operation as if it were atomic and only captures the "before" snapshot on the all-succeeded path.
- **Impact**: A real client campaign is silently throttled to a lower daily budget (lost impressions/revenue) with **zero trace** — no audit entry, no activity-feed row, and `revertChangeSet` cannot restore it because `hasSnapshots` is false (control-plane.ts:148), so the legacy inverse-shift fallback re-reads *current* budgets and re-floors, never restoring the true prior value. Money-wrong and unrecoverable.
- **Fix sketch**: Capture the prior budgets *before* the first write, and on any failure attempt a compensating `setCampaignBudgetMicros(from, from.amountMicros)` to roll the donor back, then still write a `mutations` doc with `action: "budget_shift_failed"` (using the same `logMutation` helper the prior report's finding #4 proposes) so the attempt is auditable. Return the captured snapshots even on partial failure so revert has something to restore.

## 2. `approveChangeSet` has a check-then-act race: a double-click double-applies the budget moves

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/campaigns/control-plane.ts:91`
- **Scenario**: `approveChangeSet` reads the change-set (line 90), guards `if (!cs || cs.status !== "pending")` (line 91), then loops applying every move via `applyBudgetShift` (line 99-109) and only writes `status: "applied"` at line 118 *after* all live mutations complete. There is no Firestore transaction or optimistic-status CAS. Two concurrent requests for the same `id` (an impatient double-click on Approve, or a retried POST) both read `status === "pending"`, both pass the guard, and both run the full apply loop — so each donor budget is shifted **twice** and duplicate `mutations`/`activity` rows are written. `revertChangeSet` (line 145) has the identical `cs.status !== "applied"` check-then-act shape (double-revert / concurrent revert-during-apply).
- **Root cause**: The lifecycle assumes single-threaded, serialized approval; the "pending → applied" transition is a read-modify-write across an `await`-heavy body with no lock, so the window between the status check and the status write is wide (multiple live API round-trips).
- **Impact**: Real ad spend moved twice — the donor can be floored below intent and the recipient over-funded, with a corrupted audit trail showing duplicate applies. Money-wrong.
- **Fix sketch**: Flip the status to a claimed state atomically before doing any work: `firestore.runTransaction` that reads the doc, throws if `status !== "pending"`, and sets `status: "applying"` in the same transaction; only the winning caller proceeds to the apply loop. Mirror the same claim for `revertChangeSet` (`applied` → `reverting`).

## 3. Alert de-dupe is a lost-update race: concurrent cron + manual sync send duplicate (or drop) critical alerts

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/campaigns/alerts.ts:90`
- **Scenario**: `evaluateAndAlert` reads `prevAlerted = ...alertedCampaignIds` (line 90), computes `fresh` against it, then `set({ alertedCampaignIds: criticalIds }, { merge: true })` (line 94) — a read-compute-write with no transaction. The docstring says the hourly cron *and* a manual sync run "the same path." When both fire close together (user hits Sync while the cron sync is mid-flight), both read the same `prevAlerted`, both classify the same campaign as `fresh`, and both send the email/webhook → **duplicate client alerts**. Symmetrically, whichever `set` lands second can clobber the other's `criticalIds`, so a campaign that just recovered-then-relapsed can have its id dropped and fail to re-alert. `anomaly-alerts.ts::evaluateAnomalyAlerts` (lines 89-93) has the identical `alertedAnomalyKeys` read-then-set race.
- **Root cause**: The "already alerted" set is treated as a mutex, but it's mutated with a plain read+merge-write rather than a transaction, so two overlapping syncs interleave.
- **Impact**: Duplicate alert emails/Slack messages to the agency's clients (erodes trust in the product's alerting), or a missed re-alert. Not money-wrong, but user-visible and hard to reproduce/diagnose.
- **Fix sketch**: Compute `fresh` and update the remembered set inside a single `firestore.runTransaction` on the tenant doc so the read of `alertedCampaignIds` and the write of the new set are serialized; only send outbound channels for the ids the transaction confirms as newly added.

## 4. Zero-return spending campaigns render an innocuous "—" in the ROAS/PNO cells, contradicting the module's own "cells can never disagree with the badge" invariant

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/campaigns/triage.ts:47`
- **Scenario**: For a campaign with `cost > 0` and `conversions === 0`, `withMetrics` yields `roas = 0` and `pno = 0` (metrics/ratios.ts `safe()` returns 0 when the denominator is 0). `roasMetricTone(0)` falls through both branches to `"neutral"` (line 47-51) and `pnoMetricTone(0)` hits `pno <= 0 → "muted"` (line 54). In `CampaignTable.tsx:760-765` the cell then renders `c.roas > 0 ? ... : "—"` — so the worst-possible campaign (burning budget for nothing, flagged **critical** by the `no_conversions` triage rule) shows a plain grey "—" in its ROAS and PNO cells, **visually identical to a benign paused / zero-spend campaign**. triage.ts's own header comment claims "the badge, the cell colour and the banner can never disagree," and `report-input.ts:81-83` already recognized and fixed exactly this pitfall for the *AI prompt* ("0× (bez návratnosti)" vs "—") — but the table cell was never given the same treatment.
- **Root cause**: The tone functions collapse "genuinely no data" (`cost === 0`) and "spent money, got nothing" (`cost > 0, value === 0`) into the same neutral/muted bucket because they receive only the ratio, not the cost, so they can't distinguish the two zeros.
- **Impact**: Honesty/consistency gap — a PPC manager scanning the ROAS column sees a dash and moves on, while the row's critical badge says it's the worst offender. The module's stated invariant is violated. Degradation of the product's core "what needs attention" promise.
- **Fix sketch**: Have the cell (or a `roasCellTone(row)` helper that takes the full `CampaignRow`) return `"bad"` when `cost > 0 && conversions === 0`, and render "0×" / "∞" instead of "—" for that case — mirroring the exact distinction `report-input.ts` already draws.

## 5. The `firestore.collection("tenants").doc(tenant).collection(...)` sub-collection accessor is hand-rolled in five files

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/campaigns/alerts.ts:37`
- **Scenario**: The tenant-scoped sub-collection accessor `firestore.collection("tenants").doc(tenant).collection(<name>)` is re-typed independently in `alerts.ts:38` (`alertsCol`), `activity.ts:37` (`activityCol`), `control-plane.ts:28` (`changeSetsCol`), `report-config.ts:16` (`configRef`, `.doc("report")`), and inline three times in `mutations.ts:77,143,196` plus twice in `anomaly-alerts.ts:83,88`. This is **distinct from** the prior report's finding #4 (which is about the `.add({ action, ... })` audit *envelope* inside `mutations.ts` only) — here the duplication is the tenant-doc path prefix itself, spread across five files. It is not mentioned anywhere in the 2026-07-09 report.
- **Root cause**: Each module needed a handle to one of the tenant's sub-collections and wrote the two-hop path locally; no shared `tenantDoc(tenant)` / `tenantCol(tenant, name)` helper exists.
- **Impact**: Low functional risk, but the literal string `"tenants"` and the two-hop shape are the multi-tenancy boundary — if it ever changes (e.g. sharded tenants, a prefix, an env-scoped root), seven+ call sites across five files must change in lockstep, and the `anomaly-alerts.ts` inline copies (which don't even go through a named helper) are the easiest to miss.
- **Fix sketch**: Add `export const tenantDoc = (t: string) => firestore.collection("tenants").doc(t)` (and `tenantCol = (t, name) => tenantDoc(t).collection(name)`) to a small shared module (e.g. `src/lib/campaigns/tenant-ref.ts` or `firebase.ts`), and route all five files' accessors through it.

<!-- Refactor candidates rejected as already covered by code-refactor-2026-07-09: the three-way alert-dispatch tail duplication (prior #1 — still present but reported); escapeHtml duplication (prior #2 — additionally now already fixed in alerts.ts/anomaly-alerts.ts, which import from @/lib/html); wastedSpend formula duplication budget-moves.ts:55 vs patterns/extract.ts (prior #3); the audit-mutation .add() envelope repeated in mutations.ts (prior #4); BudgetSnapshot homed in control-plane-types.ts consumed by budget-math.ts (prior #5). -->
