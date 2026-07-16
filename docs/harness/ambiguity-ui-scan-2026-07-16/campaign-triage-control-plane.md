# Campaign Triage, Ad-Ops Control Plane & AI Reporting — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

## 1. Revert settles "reverted" even when the restore failed — a failed revert is permanently unretryable
- **Severity**: High
- **Lens**: ambiguity
- **Category**: revert-status-dishonest
- **File**: src/lib/campaigns/control-plane.ts:335
- **Scenario**: An operator reverts an applied change-set; `restoreBudgets` fails (transient Google Ads API error, expired token). `budgetResult.ok === false`, the activity detail honestly says "Obnovení částečně selhalo" — but `updated` unconditionally writes `status: "reverted"`.
- **Root cause**: The apply path has an honest settle policy (`settledApplyStatus` → `failed` when every move failed), but the revert path has no equivalent: `{ status: "reverted", revertedAt, results }` is written regardless of `budgetOk`/`resumeOk`. `planRevertClaim` treats `reverted` as terminal (`noop`), so the restore can never be re-run through the normal path — even though the module's own comments stress the restore is an idempotent absolute snapshot write that is *safe* to repeat.
- **Impact**: Live budgets are left at the applied (wrong) values while the ledger and console say the set was reverted. The one state where a retry is both needed and safe is exactly the state the claim machine refuses to retry. Operator must fix budgets by hand in Google Ads.
- **Fix sketch**: Mirror the apply side: compute a settled revert status from `budgetOk && resumeOk` — e.g. keep `applied` (or a new `revert_failed`) on total failure so `planRevertClaim` lets the operator retry, and only settle `reverted` when the restore actually landed. At minimum, a fully-failed restore (`!budgetOk` and no resume succeeded) must not write `reverted`.

## 2. Suppression state is persisted before the alert is delivered — a delivery throw swallows the alert forever
- **Severity**: High
- **Lens**: ambiguity
- **Category**: state-write-before-delivery
- **File**: src/lib/campaigns/alerts.ts:184 (same pattern: src/lib/campaigns/anomaly-alerts.ts:115)
- **Scenario**: `evaluateAndAlert` writes `criticalAlertState` (marking the episodes as alerted) at line 184, *then* calls `recordAlert` / `recordActivity` / `sendWebhook` / `sendEmail`. If `recordAlert` throws (Firestore hiccup) or `sendWebhook` propagates, the exception exits the function — but the state already says "alerted".
- **Root cause**: The read-plan-write of the suppression memory is intentionally committed first (to close the double-alert race between cron and manual sync), but nothing marks the episode back as un-alerted on delivery failure. In the anomaly path this is worse: `remindAfterCooldown: false` means a swallowed anomaly alert will **never** re-alert — the key just ages out silently.
- **Impact**: A transient Firestore/webhook failure at exactly the wrong moment converts a "new criticals" alert into permanent silence for those campaigns until the cooldown window (or, for anomalies, forever). The inbox — documented as "the durable record that never depends on a 3rd party" — is in fact skipped when its own write races the state commit. Also note the read-modify-write on the tenant doc is not a transaction, so cron + manual sync can still interleave and clobber each other's `nextState`.
- **Fix sketch**: Either (a) write the durable inbox record *first* and only then commit `nextState` (accepting a rare duplicate inbox row over a lost alert), or (b) wrap `recordAlert` in a try/catch that rolls the affected keys out of `nextState` (or re-writes `prevState`) on failure. Consider `runTransaction` for the state read-modify-write to close the concurrent-sync clobber.

## 3. Stranded-apply recovery lands "failed" while moves may have landed — and their snapshots are unrecoverably lost
- **Severity**: High
- **Lens**: ambiguity
- **Category**: overloaded-failed-state
- **File**: src/lib/campaigns/control-plane.ts:184-194 (contract: src/lib/campaigns/control-plane-types.ts:194-197)
- **Scenario**: An apply loop crashes after `applyBudgetShift` succeeded for move 1 of 3 (server restart, timeout). The set strands in `applying`; 10 minutes later the next actor recovers it to `failed`.
- **Root cause**: Budget snapshots are accumulated only in memory (`budgetSnapshots` array in `approveChangeSet`) and persisted in one final `set` after the whole loop. A mid-loop crash loses every snapshot for moves that *did* land. Recovery then writes `failed`, whose documented contract ("this set never touched the live account and captured no snapshots", `settledApplyStatus` doc) is now false — and `hasRestoreSnapshots` guarantees the landed moves can never be reverted through the console.
- **Impact**: Real budget shifts exist on the live account with no snapshot, no revert path, and a ledger status that explicitly asserts nothing was applied. The operator "reviewing" the failed set has no signal that money actually moved. This is a known trade-off per the comments, but the `failed` docstring actively misleads the reviewer.
- **Fix sketch**: Persist each move's result + snapshots incrementally (`set(..., {merge:true})` with `FieldValue.arrayUnion` after every move) so a crash leaves partial evidence; recovery can then distinguish "nothing landed" from "partially landed" — settle the latter as `applied` with the captured snapshots (revertable), or introduce a distinct `stranded` status. At minimum, correct the `settledApplyStatus`/recovery wording: `failed` means "outcome unknown, review the account", not "never touched".

## 4. Czech pluralisation wrong in user-facing alert titles ("1 nových kritických kampaní")
- **Severity**: Medium
- **Lens**: ui
- **Category**: czech-plural-forms
- **File**: src/lib/campaigns/alerts.ts:195 (also src/lib/campaigns/anomaly-alerts.ts:134)
- **Scenario**: One campaign turns critical → the inbox row, email subject and webhook all read "1 nových kritických kampaní" (correct: "1 nová kritická kampaň"). Two anomalies → "2 nových anomálií" (correct Czech paucal: "2 nové anomálie" — genitive plural only applies from 5 up).
- **Root cause**: `alerts.ts` builds the title with no plural branching at all; `anomaly-alerts.ts` branches only `=== 1` vs "else", missing the Czech 2–4 paucal form. This is the highest-visibility copy in the product (inbox headline + email subject) for a Czech-language agency tool.
- **Impact**: Every single-critical alert — the most common case — is grammatically broken in the channel meant to look professional in front of clients. Undermines trust in an app whose whole pitch is agency-grade reporting.
- **Fix sketch**: Add a tiny shared `czPlural(n, one, few, many)` helper (n===1 → one; 2–4 → few; else many) next to the other formatters in `@/lib/format` and use it in both titles. The codebase already has precedents for locale-aware label maps (`SEVERITY_LABELS`), so this fits the existing pattern.

## 5. Anomaly alerts smuggle a pseudo-id into `AlertItem.campaignId` — the alert→change-set flow silently dead-ends on them
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: overloaded-identifier
- **File**: src/lib/campaigns/anomaly-alerts.ts:125
- **Scenario**: An anomaly alert stores items with `campaignId: "anomaly:2026-07-10|cost|spike"`. Any consumer that treats `AlertItem.campaignId` as a real campaign id — notably the documented alert→change-set flow, which pre-scopes `donorScopeIds` to "exactly the alerted campaigns" (`CreateChangeSetOptions.scopeCampaignIds`) — matches nothing: `recommendBudgetMoves`' donor filter finds no campaign, `createChangeSet` returns null.
- **Root cause**: `AlertItem` was designed for campaign criticals; the anomaly path reused the shape and disambiguated with a string prefix instead of a discriminant. Nothing in the `AlertItem` type or docs says `campaignId` may be a synthetic key, and nothing in the change-set staging path guards against it.
- **Impact**: The "close the loop" action on an anomaly alert quietly produces "nothing worth moving" — indistinguishable from a genuinely move-less portfolio — so the operator gets a confusing dead-end instead of either a scoped proposal or a clear "not applicable to anomaly alerts". Future readers of `AlertItem` will assume `campaignId` is always resolvable.
- **Fix sketch**: Make the shape honest: add an optional `kind: "campaign" | "anomaly"` (or make `campaignId` optional and add `anomalyKey`) on `AlertItem`, document the prefix convention, and have the change-set staging route refuse (with a clear message) or ignore anomaly-typed items instead of scoping donors to unmatched ids.
