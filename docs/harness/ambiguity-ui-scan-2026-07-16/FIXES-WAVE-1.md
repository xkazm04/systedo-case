# Wave 1 fixes — "ops success-theater" (ambiguity+ui scan 2026-07-16)

Seven findings where an operation persisted or reported success even when the
underlying effect failed. All 7 fixed in 6 commits on `vibeman/ambiguity-ui-2026-07-16`
(findings cron-jobs #1 and social-speed-lead #3 share one mechanism and one commit).

## Commits

| Commit | Finding | Files |
|---|---|---|
| `b01101c` | campaign-triage-control-plane #1 — revert settled "reverted" on a failed restore | `src/lib/campaigns/control-plane.ts`, `src/lib/campaigns/control-plane-types.ts`, `test-unit/campaigns-changeset-transitions.test.mjs` |
| `3ddccba` | campaign-triage-control-plane #2 — suppression state persisted before delivery | `src/lib/campaigns/alerts.ts`, `src/lib/campaigns/anomaly-alerts.ts` |
| `068a64f` | campaign-triage-control-plane #3 — stranded apply recovered to a lying "failed" | `src/lib/campaigns/control-plane.ts`, `src/lib/campaigns/control-plane-types.ts`, `test-unit/campaigns-changeset-transitions.test.mjs` |
| `ff1bd9c` | cron-jobs #1 + social-speed-lead #3 — posts stranded in "publishing" limbo | `src/lib/social/types.ts`, `src/lib/social/store.ts`, `src/app/api/cron/social/route.ts`, `test-unit/social-publish-claim.test.mjs` |
| `5b78a39` | cron-jobs #2 — digest weekly claim never released on send failure | `src/lib/cron/sent-guard.ts`, `src/lib/cron/sent-guard.local.ts`, `src/lib/cron/sent-guard.firestore.ts`, `src/app/api/cron/digest/route.ts`, `test-unit/cron-guards.test.mjs` |
| `d6fcbe9` | social-media-planning #1 — mid-batch retry duplicated scheduled posts | `src/components/social/WeekPlanner.tsx` |

## What was fixed

**#1 Revert settle honesty** — `revertChangeSet` wrote `status: "reverted"` +
`revertedAt` unconditionally, and `planRevertClaim` treats `reverted` as terminal,
so a failed budget restore was permanently unretryable while live budgets held the
applied (wrong) values. New pure `settledRevertStatus(budgetOk, resumeOk)` mirrors
the apply side: `reverted` only when the whole restore landed; any failure returns
the set to `applied` (retryable — the restore is an idempotent absolute snapshot
write), `revertedAt` is stamped only on a real revert, and the activity ledger says
the revert failed.

**#2 Deliver-then-commit for alert suppression** — `evaluateAndAlert` and
`evaluateAnomalyAlerts` committed the "already alerted" episode memory BEFORE any
delivery, so a `recordAlert` throw swallowed the alert while the state claimed it
was sent (for anomalies, with `remindAfterCooldown:false`, forever). The durable
in-app inbox write now lands first and the state commits after it; a crash between
the two costs at worst a rare duplicate inbox row on the next sync — a duplicate is
recoverable, a lost alert is not. The zero-fresh path still commits the state so
bands/cooldown tombstones keep aging out.

**#3 Evidence-based stranded-apply recovery** — budget/status snapshots lived only
in memory during the apply loop; a mid-loop crash lost the snapshots of moves that
DID land, and recovery settled the set as `failed` — a status documented as "never
touched the live account". The loop now persists `results` + snapshots after every
move (best-effort merge write), and `planApproveClaim` recovers a stranded set from
that evidence: with snapshots → `applied` (revertable through the console), without
→ `failed`, whose contract wording now honestly reads "no evidence a move landed;
check the mutation audit", not "never touched".

**#4+#6 Publishing lease + limbo sweep (one mechanism)** — the scheduled→publishing
claim was a one-way door: `listDueScheduled` only returns `scheduled`, so a throw
after the claim or a crash/timeout mid-publish stranded the post in "Zveřejňuje
se…" forever. The claim now stamps `claimedAt`; the cron sweeps stale leases
(`PUBLISH_CLAIM_TTL_MS` = 10 min = 2× route maxDuration; a missing stamp counts as
stale) to a visible `failed` via `reclaimStalePublishing` before listing due posts;
and the per-post catch settles the claim it holds immediately — re-attempting the
honest `published` write when the provider had already reported success, else
`failed` with the error. Stale claims settle to `failed`, not back to `scheduled`,
because the crash may have happened after the provider published — re-scheduling
would double-post.

**#5 Digest claim/release pairing** — `claimWeeklyDigest` consumed the ISO week
before anything was sent and nothing released it, so one transient error cost the
tenant the whole week's digest with no retry. New `releaseSentPeriod` on both
sent-guard backends (period-guarded: releasing a stale period never clobbers a
newer claim) + `releaseWeeklyDigest`, called from a per-pair catch when nothing was
delivered, mirroring the sibling report cron's `claimReportDay`/`releaseReportDay`.
Once the first durable channel (the in-app alert) lands, the claim stands.

**#7 Retry-safe week planning** — the planner kept the whole topics textarea on any
failure, but a retry re-ran the batch from topic 1 while earlier topics were already
persisted → duplicates piled up per retry. The loop now counts fully-persisted
topics; on failure the textarea keeps only the unprocessed lines (failed topic
included; sliced from the full line list so over-the-7-cap lines survive) and the
error message appends "Scheduled X/Y topics — only the unprocessed ones were kept".

## Verification

- `npx tsc --noEmit` — 0 errors after every commit.
- `npm run test:unit` — **1549/1549 pass** (baseline 1541 + 8 new tests, 0 regressions).
- New tests: `settledRevertStatus` (2), snapshot-aware `planApproveClaim` recovery (1)
  in `campaigns-changeset-transitions.test.mjs`; `isStalePublishClaim` lease policy (4)
  in new `social-publish-claim.test.mjs`; local `releaseSentPeriod` semantics (1)
  in `cron-guards.test.mjs`.

## Patterns established

1. **Settle statuses must be earned, not assumed**: compute the terminal status from
   the actual outcome (`settledApplyStatus` / `settledRevertStatus`), and keep the
   retryable state whenever the retry is idempotent-safe.
2. **Durable record before dedupe state**: when a suppression/claim memory races a
   delivery, write the durable record first — prefer a rare duplicate over a
   permanently swallowed event.
3. **Every transient claim needs a dated lease + a reaper**: `claimedAt` +
   TTL + a sweep that settles stale claims to a *visible* terminal state
   (control-plane change-sets and social posts now share this shape).
4. **Claim-first guards need a release half**: pair every claim-before-send with a
   period-guarded release on total failure (report cron → digest cron → reusable
   `releaseSentPeriod`).
5. **Persist loop evidence incrementally** when a crashed loop's partial effects are
   irreversible — recovery can then tell "nothing landed" from "partially landed".
