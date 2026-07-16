# AI Digital Twin (Communication Autopilot) — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

## 1. "Reset training" only pretends to untrain when the twin mounted trained
- **Severity**: High
- **Lens**: ambiguity
- **Category**: untrain-resets-to-wrong-baseline
- **File**: src/components/app/twin/useTwinState.ts:37-44
- **Scenario**: A project with a trained twin opens the Twin module (server resolves `initialState` = the trained blob, `initialSource: "trained"`). The user clicks "Vymazat trénink".
- **Root cause**: `untrain()` sets `setState(initialState)` — but `initialState` is whatever the server passed at mount, which for a trained twin IS the trained state. The doc comment promises "back to the seeded per-type sample", an assumption that only holds when the module mounted untrained. The DELETE does wipe the server, so the sample only appears after a reload.
- **Impact**: The pill flips to "Nenatrénovaný twin" while the trained voices, facts and drafts stay fully visible and editable below it — a directly contradictory UI. Worse, any subsequent `commit` (e.g. saving an answer) POSTs the entire supposedly-deleted trained blob back to the server, silently undoing the reset.
- **Fix sketch**: Have the server page also pass the per-type sample state (or expose it via the DELETE response) and reset to that; alternatively re-fetch state after the DELETE resolves instead of reusing `initialState`.

## 2. Approving a rehydrated draft banks a record with an empty inbound message
- **Severity**: High
- **Lens**: ambiguity
- **Category**: rehydrated-draft-loses-context
- **File**: src/components/app/twin/TwinOutbox.tsx:211-217, 242-258
- **Scenario**: The user generates a reply, navigates away or reloads, comes back. `useAiTool` rehydrates the persisted result; the code even seeds `draftContext` specifically so the restored draft "stays bankable". The user clicks Approve (or Reject).
- **Root cause**: `inbound` and `contact` are plain `useState` initialized from props (usually `""`); only `result` survives the reload. `bankDraft()` then records `inbound: inbound.trim()` — empty — and `draftContext` is seeded from the now-empty `contact`.
- **Impact**: The persisted outbox record loses the question it answers and whom it was for: history shows a reply to nothing, the rejection-learning pipeline (`twinAvoidContext`) gets a reasonless pairing, and the audit trail the frozen-context design exists to protect is corrupted for exactly the restored-draft case the seeding tries to save.
- **Fix sketch**: Persist `inbound`/`contact` alongside the result in the tool cache (or in the same sessionStorage mechanism as `replySeedKey`); if they can't be restored, disable Approve/Reject on a rehydrated result and show "regenerate to review" instead of banking a hollow record.

## 3. Editing an auto-approved draft silently discards the edit — and hides the Send button
- **Severity**: High
- **Lens**: ui
- **Category**: auto-approve-edit-dead-end
- **File**: src/components/app/twin/TwinOutbox.tsx:270-296, 503-508, 588-594, 628
- **Scenario**: On an `auto` channel a confident draft self-banks via the autonomy-gate effect (with `result.reply`). The reply textarea stays fully editable, so the user polishes a sentence — then sees only the "Schváleno automaticky" pill where Approve would be.
- **Root cause**: The gate banks `result.reply` and replaces the Approve button with a static pill, so `replyText` edits have no path into the record (no edit-fact banking either, unlike the human-approve path). The gate also never sets `pendingId`, so the "approved → Send" banner (`justApproved`, line 628) never appears for auto-approved drafts.
- **Impact**: The user's correction is silently lost — Send (from History) and the stored record deliver the unedited text while the on-screen textarea and the Copy button show the edited one. Two visible versions of "the reply", the worse one gets sent; the whole "rejecting is training" loop also never learns from these edits.
- **Fix sketch**: Either make the textarea read-only once auto-banked (with an "Edit → converts to needs-review" affordance), or on edit re-open the decision: update the banked record via `upsertDraft` + bank the edit fact, and set `pendingId` to the auto-banked id so the Send banner appears.

## 4. Confidence bar colors use hardcoded 80/50 that contradict the channel's own bar
- **Severity**: Medium
- **Lens**: ui
- **Category**: magic-threshold-color-mismatch
- **File**: src/components/app/twin/TwinOutbox.tsx:494 (vs TwinChannels.tsx:220-229)
- **Scenario**: A channel is set to `auto` with the threshold slider at 90 %. The twin drafts at confidence 82: the meter renders green (`>= 80 → bg-positive`) while the draft did NOT clear the gate and waits for review. Conversely at threshold 50, a coral (warning-colored) 65 % draft can be auto-approved.
- **Root cause**: The color ramp is two magic numbers baked into the JSX, unrelated to `cfg.autoThreshold` (50–100, user-configurable) that actually decides the draft's fate.
- **Impact**: The strongest visual signal on the draft card routinely disagrees with the autonomy verdict next to it — users learn to distrust the meter, or worse, trust green and skim-approve a draft the gate itself deemed below the bar.
- **Fix sketch**: Key the color on the actual verdict: green when `verdict.autoApproved`-eligible (confidence ≥ channel threshold and no risks), coral when within some margin below the threshold, red otherwise; fall back to sensible constants only on channels without a threshold, named in `lib/twin/types` next to `DEFAULT_AUTO_THRESHOLD`.

## 5. Channel/scope label maps duplicated across three components despite an existing labels module
- **Severity**: Medium
- **Lens**: ui
- **Category**: duplicated-label-maps
- **File**: src/components/app/twin/TwinOutbox.tsx:130-138; src/components/app/twin/TwinChannels.tsx:72-80; src/components/app/twin/TwinVoiceStudio.tsx:106-115
- **Scenario**: A new channel is added to `TWIN_CHANNELS`/`TONE_SCOPES`, or someone reworks a Czech label ("Poptávky" → something else). Three hand-copied `Record<…, {cs, en}>` maps must be updated in lockstep; TypeScript catches a *missing* key but not a *diverging* translation.
- **Root cause**: `CHANNEL_LABELS` is copy-pasted verbatim in TwinOutbox and TwinChannels, and TwinVoiceStudio's `SCOPE_LABELS` repeats all seven channel entries plus `generic` — even though the module already established the shared pattern with `REASON_LABELS` in `twin/labels.ts` (imported by TwinOutbox).
- **Impact**: Channel names are the one vocabulary all three twin screens (plus the readiness ribbon's milestones) must agree on; a drifted label makes "Sociální sítě" in the outbox and a differently-worded channel in Správa kanálů read as two different places, undermining the cross-module NextSteps navigation.
- **Fix sketch**: Move `CHANNEL_LABELS` into `src/components/app/twin/labels.ts` next to `REASON_LABELS` (or into `lib/twin/types` beside `TWIN_CHANNELS`), and derive `SCOPE_LABELS` as `{ generic: …, ...CHANNEL_LABELS }`.
