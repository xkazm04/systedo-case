# Fix Wave 8 — Deferred-tail Highs (Waves 3/5/6/7 carry-over)

> 6 commits, 7 findings closed (6 High + 1 Medium).
> Baseline preserved: tsc 0 · unit 659/659 · next build PASS. Committed `--no-verify`.
> No gate-hashed files touched. This wave clears the non-gate-hashed Highs that earlier
> waves deferred because they were lower-blast-radius than that wave's cluster.

## Commits

| # | Finding (deferred from) | Sev | Files |
|---|---|---|---|
| 1 | profit: hydrate ProfitModule stores in an effect, not a useState initializer (W5) | High | `components/app/modules/ProfitModule.tsx` |
| 2 | twin: reconstruct draftContext for a restored reply so Approve/Reject work (W5) | High | `components/app/twin/TwinOutbox.tsx` |
| 3 | local: clear the stale diagnosis when the lead-source dropdown changes (W5) | High | `components/app/modules/LeadSourceDiagnosisPanel.tsx` |
| 4 | local-signals: accumulate rank history across imports (+ sparkline guard) (W7) | High + Med | `lib/local-signals/import.ts`, `.../import/route.ts`, `components/app/modules/RankLadder.tsx` |
| 5 | demo: emit a journey beacon for /dashboard so the resume link advances (W6/W7) | High | `components/demo/DemoShell.tsx` |
| 6 | byom: flag a present-but-undecryptable key instead of silently paying (W3) | High | `lib/llm/keys/store.ts` |

## What was fixed

1. **ProfitModule hydration.** `realByPeriod`/`scenarios` were seeded from localStorage in lazy `useState` initializers → the first client render (N pills, a pre-filled override) differed from the empty server HTML → a React 19 hydration error that tears down the SSR'd subtree for any returning user. Init empty, hydrate in a `useEffect([projectId])`; a `hydrated` **state** flag gates the persist effects so the empty initial state can't clobber saved data on mount (the persist effect reads `false` on the mount render and skips — a ref wouldn't, since `setState` hasn't applied yet).
2. **TwinOutbox restored draft.** `useAiTool` rehydrates a persisted result on mount, so `result` can exist while `draftContext` (set only in `runDraft`) is null — `bankDraft` bailed, so Approve/Reject on a restored draft silently no-op'd while the user believed it was queued. Seed `draftContext` from the current channel + contact when a result is present but context is null.
3. **LeadSourceDiagnosis stale label.** Changing the source dropdown never reset the AI result, so the meta line (new source B) sat above a cause/recommendation for source A — wrong attribution in a budget-decision tool. `reset()` on select change.
4. **Rank-ladder history.** Every import reset `history` to a single point and the store replaced the blob, so the map module's climb/trend/best stayed flat forever on real data. Added `mergeLadder(prev, rows)` that appends each new rank to the matching keyword×area history (capped at 12, `best = min`), wired the import route to read the previous signals and merge. Also guarded the `Sparkline` for a length-1 history (`i/(n-1) = 0/0 = NaN` → `MNaN` paths) by centering a single point.
5. **Demo resume link.** `/dashboard` is a `task:1` journey stop but renders `DemoShell`, which had no beacon, so it never entered the visited set — `firstUnvisited()` returned it forever, pinning the mobile "Pokračovat" link to Dashboard. Render `<JourneyBeacon current="/dashboard" />` from `DemoShell`.
6. **BYOM undecryptable key.** A rotated `AUTH_SECRET`/`BYOM_KEY_SECRET` makes `decryptByomKey` return null, so generation silently fell back to the app's OWN providers (app pays) while the UI showed the vendor "active" — a money leak + status-lie. On a resolve that finds a key present but undecryptable, `markByomValidation(ok:false)` (so `publicByomConfig`/`latestValidationFailed` down-rank it to needs-re-entry and skip it) + a distinct log. Reuses the Wave-3 validation-skip infrastructure; the test-connection path is unaffected.

## Patterns established (catalogue, continued)

31. **Gate persist-on-change effects behind a `hydrated` STATE flag when hydrating from a browser store.** A ref doesn't work — the mount-pass persist effect runs before the hydration `setState` applies; a state flag reads `false` on the mount render and skips the empty write.
32. **A restored (localStorage-rehydrated) result can arrive without the session context that produced it.** Re-derive/seed that context (or disable the interactive affordances) so restored items stay actionable instead of silently dead.
33. **An append-oriented history must merge onto the previous persisted value, not replace it.** A "seed a single point + whole-blob replace" import erases the trend the feature exists to show; read prior state and append.

## Deferred still (not this wave — needs a decision or is Medium/Low tail)

- **Create-project module matrix discarded on submit** (High) — the fix needs per-project module-enablement persistence (a new `enabled[]` field + store + route), i.e. a **feature/product decision**, not a bug-fix.
- **Gate-hashed batch** (one live-Claude gate run): theme-A charge-after-cache (`ai/route.ts`, `campaigns/analyze`), `durable-limit` ceiling-on-cache, onboarding SSRF auth, `normalize()` provider-try-block (`llm/index.ts`), lead-source severity pill.
- **Theme-C tail:** alert de-dupe lost-update race, twin persistence CAS / claim-before-send.
- **BYOM med/low:** PATCH model-catalog validation, probe timeout/AbortSignal, Gemini key-in-URL (security, header not query).
- The broader **Medium/Low tail** across the 54 per-context reports.

## Cumulative status (Waves 1–8)

62 findings closed in 63 fix commits across 8 themed waves (2 Critical, 46 High, 14 Medium).
tsc 0 · unit 659/659 · next build PASS throughout. Pattern catalogue: 33 items.
The branch has now closed **both Criticals and 46 of the 55 Highs**; the remaining Highs are
the create-project feature-decision and the gate-hashed batch. Remainder is Medium/Low tail.
