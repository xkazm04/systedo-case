# Fixes — Wave 8 (state-loss, concurrency & idempotency)

Branch `vibeman/ambiguity-ui-2026-07-16`, off `ba659d7`. 8 High findings, all fixed.
One atomic commit per finding + this summary. `npx tsc --noEmit` clean at every commit;
full `npm run test:unit` green (**1636/1636**, baseline 1622 + 14 new; 0 regressions).

## Commits

| # | Finding (report) | Commit | Scope |
|---|---|---|---|
| 5 | twin-brand-double #1 | `692c1e0` | `fix(twin): sanitize persisted twin blobs on read` |
| 8 | llm-wrapper-telemetry-quality #1 | `f37330d` | `fix(llm): reclassify a bare BYOM 429 as transient, not a terminal quota fault` |
| 7 | byom-keys-adapters #2 | `b7753ef` | `fix(byom): don't sticky-disable a healthy key on a transient probe failure` |
| 6 | performance-dashboard #3 | `b8751ee` | `fix(dashboard): re-sync ReportChat transcript on a bucket change without remount` |
| 2 | twin-autopilot-ui #1 | `4f59de9` | `fix(twin): reset training to the sample, not the trained mount blob` |
| 3 | twin-autopilot-ui #2 | `0fb56c8` | `fix(twin): don't bank a rehydrated draft with an empty inbound message` |
| 4 | twin-autopilot-ui #3 | `c6d6639` | `fix(twin): let an auto-approved draft be edited instead of silently discarding it` |
| 1 | project-tenant-api #1 | `84f7ea8` | `fix(twin): make send idempotent and protect terminal sent from a stale save` |

## Narratives

**#5 — Unsanitized persisted read.** Both twin store backends did a bare
`JSON.parse(row.data) as TwinState`; a legacy/hand-edited blob missing `drafts`/`channels`
parsed fine, then `resolveTwin`'s `mergeVoices`/`saved.channels.length` (outside its own
try) threw a `TypeError` and bricked the module. New pure `parsePersistedTwin` runs the
already-total `sanitizeTwinState` on read (preserving a string `updatedAt`); both backends
call it. All `getTwin` consumers (incl. the send route) are now self-healing.

**#8 — BYOM 429 misclassified as terminal quota.** `classifyByomHttp` mapped every 429 to
`ByomUserError("quota")`, which `generateStructured` re-throws before the retry/fallback
machinery — a throttle burst became a hard "you're out of credit" error. Now 429 is a user
quota fault only when the body names exhausted quota/credit/billing
(`/quota|credit|billing|insufficient|exceeded|balance|out of/i`); otherwise it returns
`null` so the adapter's recoverable path applies (Retry-After backoff, else a retryable
`server` error). Mirrors the deliberate 402 case.

**#7 — Sticky validation failure benches a healthy key.** "Test connection" caught ANY
error → `{ok:false}` → `markByomValidation` stamped a sticky `lastError` → `latestValidationFailed`
skipped the key on every generation (silent fall-back to the app's own providers). New pure
`classifyProbeError`: only a `ByomUserError` is definitive; any `LlmCallError`/unknown is
`transient`. `markByomValidation` leaves validation state untouched on a transient outcome.
(#7 and #8 are the same "transient treated as terminal" shape, handled consistently.)

**#6 — ReportChat stale transcript on bucket change.** A `bucket`/`projectId` change without
a remount left `messages` loaded from bucket A and froze persistence forever (cross-project
UI mixup + lost turns). `loadedBucket` is now state; on a change the hook reloads the new
bucket's stored transcript and re-points `loadedBucket` **at render time** (guarded, once per
change) so `messages` is corrected before the persist effect runs — a deferred effect would
write the old transcript under the new key in the same commit.

**#2 — Untrain reset to the wrong baseline.** `untrain()` reset to `initialState`, which for a
twin that mounted trained IS the trained blob. `useTwinState` now takes the seeded sample and
resets to it (`TwinModule` passes `sampleTwin(type)`), so the pill, the visible content, and
any subsequent `commit` all reflect the untrained sample.

**#3 — Rehydrated draft banked with an empty inbound.** `draftContext` now freezes the
`inbound` at generation time and banking reads it from there. A rehydrated result (result
present, no live context after a reload) is explicitly **not bankable**: Approve/Reject are
replaced with a regenerate notice, and the auto-approve gate can't re-bank a hollow record.

**#4 — Auto-approved edit silently discarded + Send hidden.** The reply locks read-only once
auto-banked (with an "Edit" that re-opens the record to needs-review via `upsertDraft`), and
the gate now sets `pendingId` so the approved→Send banner appears. Re-approving upserts the
banked record in place (no duplicate) and banks the edit as a style fact.

**#1 — Send race / lost update.** New atomic `mutateTwin` (sqlite `BEGIN IMMEDIATE` /
Firestore `runTransaction`, sanitized reads) mirrors `mutateLocalSignals`. Send is now a
compare-and-set: it flips approved→sent inside the transaction, so a second concurrent send
finds it already `sent` (idempotent no-op — no double delivery), reverting to `approved` on a
connector failure. The `/twin` POST merges STORED terminal statuses over the posted blob
(`mergeTerminalDrafts`) inside the atomic mutate, so a stale full-state save can never un-set
a `sent`/`rejected` draft.

## Verification

- `npx tsc --noEmit`: 0 errors (pre-commit hook re-ran it on every commit).
- `npm run test:unit`: **1636 pass / 0 fail** (baseline 1622). New tests: `twin-persisted`
  (4), `twin-terminal-merge` (6), `byom-probe-classify` (3), `llm-retryability` (+1 bare-429
  transient case); updated `byom-adapters` 429 assertions to the new body-conditional rule.
- LLM contract gate: unchanged (no HASHED_FILES touched — errors.ts/adapters.ts/validate.ts
  confirmed not gated); all 20 tool fingerprints match.

## Behavior changes needing sign-off

1. **BYOM 429 handling (#8):** a bare 429 (no Retry-After, body not naming quota) is now
   retried / falls back instead of surfacing "out of credit". A genuinely exhausted account
   is still a hard fault only via 402 or a 429 whose body names quota/credit/billing.
2. **Test-connection outcome (#7):** a transient outage during a probe no longer disables the
   key. The returned `validation` object now carries `transient: true`; the settings UI shows
   the error message but the key stays active. (Consider surfacing "inconclusive — try again"
   copy for `transient`.)
3. **Auto-approved drafts (#4):** the reply is now read-only until "Edit"; editing converts an
   auto-approval back to needs-review (the human must re-approve). Send now appears for
   auto-approved drafts (it never did before).
4. **Rehydrated drafts (#3):** a draft restored after a reload can no longer be approved/rejected
   — the user must regenerate. (Alternative, deferred: persist inbound/contact in the tool cache
   so restored drafts stay bankable.)
5. **Twin send idempotency (#1):** a duplicate send now returns success without re-delivering;
   a not-yet-configured connector or non-approved draft still 409s. `sentAt` is claimed before
   delivery and reverted on connector failure.

## Patterns

- **Atomic RMW is the repo idiom** for shared per-project blobs (`mutateLocalSignals` →
  now `mutateTwin`); prefer it over get→save whenever the write depends on prior state.
- **Sanitize on READ, not just on the wire** — a documented "everything passes through
  sanitize first" invariant must be enforced where blobs are read, or schema drift bricks
  the reader outside its guard.
- **Transient ≠ terminal**: a probe/HTTP failure that doesn't prove a permanent fault must
  not stick. Only definitively-user faults (`ByomUserError`, 402, quota-bodied 429) are sticky.
- **React render-time re-sync (guarded) beats a deferred effect** when a prop change must
  correct state *before* another effect in the same commit reads it. Use state, not a ref
  (the lint rule forbids ref access during render).
- **Freeze context at generation time** and bank from the frozen copy, never live inputs —
  a reload/edit of the live inputs must not rewrite what a record answers.
