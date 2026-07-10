# Local SEO, Map Pack, Leads & Reviews

> Total: 5
> Critical: 0 · High: 2 · Medium: 1 · Low: 2
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

## 1. ReviewInbox debounced draft-save clobbers a just-set flag/answered on the server

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/app/modules/ReviewInbox.tsx:146`
- **Scenario**: The debounced persistence effect captures `answered`/`flagged` in a stale closure. Repro: (1) type in a review's draft textarea — `drafts` changes, the effect at lines 141–149 re-runs and schedules `setTimeout(() => save(answered, flagged, drafts), 700)` capturing the *current* `flagged` set (say `{}`); (2) within 700 ms click "Flag for owner" — `toggleFlag` (194–201) updates React state and eagerly `save(...)`s the flag ON, but the effect dep list is `[drafts]` (unchanged), so the pending timeout is **not** rescheduled and still holds the old `flagged={}` closure; (3) at 700 ms the timeout fires `save(answered, {}, drafts)`. Because the state route does a **full-document overwrite** (`saveProjectState`, `src/app/api/projects/[id]/state/[key]/route.ts:46` — no merge), the server row is rewritten with the flag removed. Local React state still shows the flag, so nothing looks wrong until reload, when the flag is gone.
- **Root cause**: A debounced writer and an eager writer both PUT the *entire* triage snapshot to one document, and the debounced writer's `answered`/`flagged` arguments are frozen at the render where `drafts` last changed (the `eslint-disable react-hooks/exhaustive-deps` at line 148 hides exactly this).
- **Impact**: Silent data loss — a flag/mark-answered a user just made is reverted on the server ~700 ms later and lost on next load; also emits a misleading "flagged" activity-feed row for a flag that no longer persists.
- **Fix sketch**: Make the debounced save read live state via a ref (`const latest = useRef({answered, flagged, drafts}); latest.current = {...}` updated every render, then `save(latest.current.answered, latest.current.flagged, latest.current.drafts)` in the timeout), or include `answered`/`flagged` in the effect deps, or switch the route/`saveProjectState` to a field-merge instead of full overwrite.

## 2. LeadSourceDiagnosisPanel shows a stale diagnosis mislabeled with the newly-selected source

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/app/modules/LeadSourceDiagnosisPanel.tsx:195`
- **Scenario**: With more than one seed the source `<select>` renders (line 142). Repro: pick the default source and click "AI diagnosis" → `status==="done"`, `r = data?.result` holds source A's cause/summary/recommendation. Now change the dropdown to source B **without** clicking the button again. Changing the select only updates `selectedSource`; it never calls `reset()`, so `data`/`r` still hold A's result. The result card stays rendered (`status==="done" && r`, line 189), but the meta line (193–205) is built from `selected` (now B) — it prints `t("diagMeta", { source: B, qualRate: B…, winRate: B…, leads: B… })` while the "Likely cause" Pill, `summary`, and `recommendation` beneath it are still **source A's**. The panel now attributes A's diagnosis to B.
- **Root cause**: The AI result (`data.result`, mode-persisted by `useAiTool`) is never pinned to or invalidated against the currently-selected source; the meta line reads live `selected` while the body reads the last-run result, so the two silently diverge. Sibling components (LocalReviews/ReviewInbox) guard exactly this by pinning results to an `activeId` — this panel has no such pin.
- **Impact**: A budget-decision tool ("which lead source to cut/keep") shows a header naming one source over a cause/recommendation computed for a different source — actively misleading, wrong attribution the user is asked to act on.
- **Fix sketch**: On select change, `reset()` the tool (clear the stale result), or gate the whole result block on a pinned `diagnosedSource === selectedSource` (store the source that was passed to `run()` and only render `r` when it still matches `selected.source`).

## 3. RankLadder sparkline renders a NaN path for freshly-imported single-point history

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/modules/RankLadder.tsx:48`
- **Scenario**: `Sparkline` computes `x = (i) => PAD + (i / (n - 1)) * (W - 2*PAD)` where `n = history.length`. When `n === 1`, `i/(n-1)` is `0/0 = NaN`, so the path `d` becomes `"MNaN NaN"` and the end circle gets `cx={NaN}` (line 65) — an invalid SVG that draws nothing (plus React NaN-attribute noise). This is not hypothetical for imported ladders: the live-import path this very cluster ships (LocalLadderSource → `POST /local-signals/import` → `ladderFromRows`, `src/lib/local-signals/import.ts:67`) seeds every keyword with **`history: [r.rank]`** — a one-element array. So the first time a user imports real rankings (the intended action of the "Import rankings" button), every keyword's trend sparkline in RankLadder is broken until a second sync grows history to ≥ 2. (The `points = 8` sample never hits this, which is why it's latent.)
- **Root cause**: `Sparkline` assumes `history.length >= 2`; the import layer legitimately produces length-1 histories, and the two were built against different assumptions.
- **Impact**: User-visible broken chart (empty/invalid sparkline) for the primary "I imported my real ranks" flow — degrades trust exactly when the product switches from sample to live data.
- **Fix sketch**: Guard the single/empty-point case in `Sparkline`: when `n < 2`, render a single centered dot at `x = W/2` (or a flat baseline) instead of computing a slope; e.g. `const x = (i) => n <= 1 ? W/2 : PAD + (i/(n-1))*(W-2*PAD);` and skip the `<path>` when `n < 2`.

## 4. SpeedLeadModule keeps `appliedReply` across lead switches, silently dropping an identical AI reply

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/app/modules/SpeedLeadModule.tsx:396`
- **Scenario**: The apply-once guard is `if (aiReply?.reply && aiReply.reply !== appliedReply) { setAppliedReply(...); setReplyText(...) }`. The lead-switch reseed block (383–388) resets `replyText` and calls `reset()` but never clears `appliedReply`. Repro: generate an AI reply for lead A (`appliedReply = "X"`), switch to lead B, generate for B; if B's reply text equals `"X"` (plausible for the deterministic keyless fallback, or a similar short reply), `aiReply.reply === appliedReply` is true → the reply is **not** pushed into B's textarea even though the "AI reply" badge (`usingAi`) shows. B's editor keeps the deterministic draft while the UI claims an AI reply was applied. The same guard also blocks a "Regenerate" that returns identical text after the user manually edited the textarea.
- **Root cause**: `appliedReply` is keyed only on reply *text*, not on `(leadId, text)`, and isn't reset when the pinned lead changes — so a repeated text across leads collides.
- **Impact**: Occasional "generated an AI reply but the editor didn't update" — confusing but low-frequency and non-destructive.
- **Fix sketch**: Reset `setAppliedReply(null)` inside the reseed block at line 387 (alongside the existing `reset()`), or key the guard on `` `${selectedId}:${aiReply.reply}` `` the way ReviewInbox/LocalReviews key `applyTag` on `activeId`.

## 5. LocalLadderSource.revert() has no catch and leaves a stale error on failure

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/modules/LocalLadderSource.tsx:96`
- **Scenario**: `revert()` (96–104) does `try { setBusy(true); await fetch(DELETE); router.refresh() } finally { setBusy(false) }` — **no `catch`** and no `setMsg(null)`. If the DELETE rejects (offline, 5xx thrown), `router.refresh()` is skipped, `setBusy(false)` runs, and the rejection escapes the un-awaited onClick handler as an unhandled promise rejection. The user gets no feedback that revert failed, and any `msg` left over from an earlier failed import still shows. `submit()` and `refreshFromUrl()` both handle this correctly with a `catch { setMsg(t("failed")) }` — `revert()` is the lone inconsistent one.
- **Root cause**: Copy-of-a-pattern that omitted the error branch; `revert()` assumes DELETE never fails.
- **Impact**: Silent failure on "Back to sample" under network/server errors, plus an unhandled rejection; the UI can display a misleading leftover error.
- **Fix sketch**: Mirror `submit()`: `setMsg(null)` at the top and wrap the body in `try/catch { setMsg(t("failed")) } finally { setBusy(false) }`; only `router.refresh()` on a confirmed-ok response.

---

### Refactor candidates rejected as already-covered by code-refactor-2026-07-09
- `rankTone` bucket duplicated across LocationsModule / MapPackClient / RankLadder / LocalModule — prior finding #2.
- `ratingTone` + the `useAiTool` apply-once "AI reply" state machine + `copyDraft` clipboard helper duplicated between LocalReviews and ReviewInbox — prior finding #1.
- `star` rating formatter mirrored in LocalModule / LocalReviews — prior finding #4.
- SpeedLeadModule's four-concern structure incl. the `_CS` prompt option lists — prior finding #5.
- `LeadSourceSeed.cpql` misleading name — prior finding #3.
No genuinely-new refactor surfaced beyond the exhaustive prior scan; all 5 findings are bug-hunter.
