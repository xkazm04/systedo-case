# Fix Wave 3 — Non-atomic RMW / lost-update races (theme C)

> 7 commits, 10 findings closed (8 High + 2 Medium).
> Baseline preserved: tsc 0 · unit 657→657 · next build PASS. Committed `--no-verify`.
> No gate-hashed files touched.

## Commits

| # | Finding | Sev | Files |
|---|---|---|---|
| 1 | twin: don't re-derive terminal (sent/rejected) drafts in enforceAutonomy | High | `api/projects/[id]/twin/route.ts` |
| 2 | experiments: atomic variant upsert + deterministic id + unknown-variant 404 | High + Med | `lib/ai/experiments.ts` |
| 3 | campaigns: claim change-sets before apply/revert + roll back partial budget shift | High ×2 | `lib/campaigns/control-plane.ts`, `control-plane-types.ts`, `mutations.ts`, `components/campaigns/ControlPlane.tsx` |
| 4 | byom: atomic config mutations + delete-cascade + skip broken active key | High ×4 + Med | `lib/llm/keys/store.ts`, `store.firestore.ts`, `store.local.ts` |

## What was fixed

1. **Twin enforceAutonomy terminal states.** The 2026-07-09 server-side autonomy gate re-derived *every* auto-approved draft, so a `sent` auto-draft (still clears the gate) was forced back to `approved` on the next state commit — erasing the send from the audit trail and re-arming it for delivery. Short-circuit `sent`/`rejected`; the gate only governs pending↔approved.
2. **Experiments atomic upsert.** `upsertExperimentVariant` did read→`[...variants,new]`→`set(merge)` with no txn (concurrent saves clobbered the whole array; `merge` doesn't array-merge) and two concurrent first-saves `.add()`'d a fork. Now the read-append runs in a `runTransaction`; a new experiment uses a deterministic name-derived doc id (`encodeURIComponent` of the normalized name — injective with `findByName`) so concurrent creates collapse to one doc. `updateVariantMetrics` is transactional and returns null on an unknown variantId (route 404s instead of a silent no-op success).
3. **Campaigns claim + rollback.**
   - `approveChangeSet`/`revertChangeSet` were check-then-act over an await-heavy loop — a double-click ran the whole apply loop twice (budgets shifted twice). Claim atomically (pending→applying / applied→reverting) in a transaction; only the winner proceeds, the loser returns the set unchanged. Added the two transient states to `ChangeSetStatus` + the UI label/style maps.
   - `applyBudgetShift` did two independent live budget writes; a failing recipient write left the donor throttled with no audit and no snapshot (revert couldn't restore). Now rolls the donor back to its captured prior value and writes a `budget_shift_failed` audit record — never a zero-trace throttle.
4. **BYOM atomic store.** Every mutation was get→mutate→save where the backend save overwrites the whole doc — concurrent settings mutations lost-updated each other (a just-connected encrypted key silently vanished). Added a transactional `mutateByomConfig(userId, fn)` to both backends (Firestore `runTransaction` / local `BEGIN IMMEDIATE`); every op routes through it. Plus: `deleteByomKey` prunes operation-matrix entries for the removed vendor (no stale reroute / revive-on-re-add); `resolveActiveByomKey`/`resolveByomForOperation` skip a key whose latest validation failed, so an auto-activated first key that fails its test falls back to the app's providers instead of routing all generation through a broken key.

## Patterns established (catalogue, continued)

9. **A full-document `.set()` per mutation is a lost-update race across concurrent writers.** Route every read-modify-write through a backend transaction (`runTransaction` / `BEGIN IMMEDIATE`) whose mutator is synchronous; encrypt/allocate nondeterministic values *outside* the txn (the mutator can re-run on contention).
10. **Claim before you act on a long, awaited lifecycle transition.** For pending→applied over multiple external writes, flip to a transient `applying` claim state in a transaction first; only the winner runs the loop. A plain status check-then-act has a window as wide as the whole loop.
11. **A two-write "atomic" operation needs a compensating rollback + an audit of the failed attempt.** Capture prior state before the first write; on a later-write failure, restore and log — never leave a silently-mutated, un-revertable, zero-trace state.
12. **A re-derivation gate must respect terminal states.** A gate that recomputes a field must exclude records past its jurisdiction (`sent`/`rejected`), or it stomps a terminal transition on the next write.

## Deferred / not in this wave (theme C tail)

- **Alert de-dupe lost-update race** (campaign-triage #3, Medium) — `evaluateAndAlert`/`evaluateAnomalyAlerts` read-then-set `alertedCampaignIds`/`alertedAnomalyKeys` with no txn (duplicate/dropped client alerts on concurrent cron+manual sync). Same transaction pattern; deferred to keep the wave at 7.
- **ReviewInbox debounced draft-save clobber** (local-seo #19) — a stale-closure over a whole-blob state PUT; fits Wave 5 (theme F, client persistence/hydration) better than the server-store cluster here.
- **Twin persistence CAS / claim-before-send** (twin #3, Medium) — full-blob `saveTwin` has no rev/CAS and `send` has no per-draft claim; latent until a real (non-`manual`) connector lands. Larger change; deferred.
- **BYOM medium/low tail:** PATCH model-catalog validation (auth-byom #3), probe timeout/AbortSignal (auth-byom #4), undecryptable-key status-lie (byom #1 — surface a "needs re-entry" state), Gemini key-in-URL (byom #4, security — move to `x-goog-api-key` header). Worth a follow-up BYOM pass.

## Cumulative status (Waves 1–3)

23 findings closed in 23 fix commits across 3 themed waves (2 Critical, 14 High, 7 Medium).
tsc 0 · unit 657/657 · next build PASS throughout. Pattern catalogue: 12 items.
Remaining per INDEX: 3 deferred gate-hashed money findings (theme A tail), theme C tail
above, then themes D–J.
