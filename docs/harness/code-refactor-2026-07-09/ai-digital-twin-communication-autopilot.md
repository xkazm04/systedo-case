# AI Digital Twin (Communication Autopilot)

> Context #7 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 3, Low: 1)
> Files read: 8

## 1. Channel label map is copy-pasted across two owned files (and near-duplicated in a third)

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/twin/TwinChannels.tsx:64-72`
- **Scenario**: The exact same `CHANNEL_LABELS: Record<TwinChannel, { cs: string; en: string }>` object (all 7 channels, byte-identical Czech/English strings) is redefined at `src/components/app/twin/TwinOutbox.tsx:123-131`. A third, near-identical copy lives at `src/components/app/twin/TwinVoiceStudio.tsx:101-110` as `SCOPE_LABELS` — same 7 channel entries plus one extra `generic` key. Verified with a repo-wide grep: these three local `const` declarations are the only definitions; nothing imports a shared one.
- **Root cause**: Each of the three Twin screens was built independently and needed a bilingual label for the same `TwinChannel` union, so each one wrote its own lookup table instead of importing a shared one from `src/lib/twin/types.ts` (which already defines `TWIN_CHANNELS` and is imported as a value by all three "use client" files, so it's proven client-safe).
- **Impact**: Adding, renaming, or relabeling a channel (e.g. adding a new connector channel) requires remembering to touch three files in lockstep. Missing one silently ships a blank/English fallback or a stale Czech label on one screen while the other two are correct — exactly the kind of drift this scan is meant to catch before it happens.
- **Fix sketch**: Add `export const TWIN_CHANNEL_LABEL: Record<TwinChannel, { cs: string; en: string }> = {...}` to `src/lib/twin/types.ts` (single source, alongside the existing `resolveVoice`/`channelConfig` helpers). Update `TwinChannels.tsx` and `TwinOutbox.tsx` to import and use it, deleting their local copies. Update `TwinVoiceStudio.tsx`'s `SCOPE_LABELS` to `{ generic: {...}, ...TWIN_CHANNEL_LABEL }`.

## 2. "Voice + rejection-avoid" context is assembled twice instead of once

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/modules/TwinInboxModule.tsx:93-94`
- **Scenario**: `TwinInboxModule` builds the AI context for the `leads` channel by hand — `resolveVoice(state.voices, "leads")` then `avoidDirectives(rejectionPatterns(state.drafts, "leads"))` — to pass into `SpeedLeadModule`. The exact same two-step recipe (`resolveVoice` + `rejectionPatterns` → `avoidDirectives`) is independently assembled in `src/components/app/twin/TwinOutbox.tsx:182-184` and `:204` for whichever channel is selected in the dropdown.
- **Root cause**: `TwinOutbox` composes its own reply drafts and needed this data inline; `TwinInboxModule` needed the same shape to hand off to the separately-owned `SpeedLeadModule` for the `leads` channel, and re-derived it from the same two primitives rather than calling one helper.
- **Impact**: Both call sites must independently know that "a channel's AI context = resolved voice + avoid-directives from its rejection history." If that recipe ever grows a third ingredient (e.g. a new signal added to the prompt), only one of the two spots is likely to get updated in the same PR.
- **Fix sketch**: Add a small pure helper to `src/lib/twin/types.ts`, e.g. `export function voiceContext(state: TwinState, channel: TwinChannel) { return { voice: resolveVoice(state.voices, channel), avoid: avoidDirectives(rejectionPatterns(state.drafts, channel)) }; }`, and have both `TwinInboxModule.tsx` and `TwinOutbox.tsx` call it instead of re-deriving the two pieces separately.

## 3. `uid()` is redefined identically in two owned files

- **Severity**: Low
- **Category**: duplication
- **File**: `src/components/app/twin/TwinVoiceStudio.tsx:112`
- **Scenario**: `const uid = () => Math.random().toString(36).slice(2, 10);` appears verbatim in both `TwinVoiceStudio.tsx:112` and `src/components/app/twin/TwinOutbox.tsx:141`. A repo-wide grep for `Math.random().toString(36)` confirms these are the only two occurrences in `src/` — no shared id helper exists to consolidate into.
- **Root cause**: Both components need a client-side local id (for a `TwinStyleFact` and a `TwinDraft` respectively) and each wrote a one-line generator rather than importing a shared one.
- **Impact**: Trivial today (one line, unlikely to diverge), but it's dead weight — two identical private utilities doing the same job for the same feature.
- **Fix sketch**: Move the function to `src/lib/twin/types.ts` as `export const uid = () => Math.random().toString(36).slice(2, 10);` (or a comparably-named export) and import it from both `TwinOutbox.tsx` and `TwinVoiceStudio.tsx`, deleting the two local copies.

## 4. `TwinOutbox.tsx` does five jobs in one 695-line component

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/app/twin/TwinOutbox.tsx:1-695`
- **Scenario**: One component owns: the compose form (contact/inbound inputs + generate button), the autonomy auto-bank effect (`autoBankedRef`/`autoBankedIdRef` bookkeeping at lines 249-281), the approve/reject flow with reason-tallying (lines 283-327), delivery via `send()` (lines 331-358), and the full read-only history list (lines 641-691) — roughly a dozen `useState`/`useRef` hooks in one closure.
- **Root cause**: The feature grew from a simpler "personas ReplyOutbox" (per the file's own header comment) into a component that now also owns the autonomy gate's bookkeeping, and nothing was carved back out as the responsibilities accumulated.
- **Impact**: The auto-bank effect and the reject flow both mutate `state.drafts` through the same refs, so a change to one for-instance a future edit to the history rendering, requires reading and reasoning about the entire file to be sure it doesn't disturb the auto-bank/reject interaction the code comments explicitly warn about (lines 311-314, 247-252).
- **Fix sketch**: Extract the read-only "History" section (lines 641-691) into a presentational `TwinOutboxHistory` component taking `{ drafts, locale, onSend, sendingId }` — it has no dependency on the compose-form state. Consider also extracting the reject-reason picker (lines 526-569) into `RejectReasonPicker`. Leave the auto-bank effect and its refs where they are; splitting those specifically would risk the double-bank bug the inline comments are already guarding against.

## 5. The autonomy gate's verdict is recomputed instead of reused

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/twin/TwinOutbox.tsx:219-241`
- **Scenario**: `bankDraft()` (line 221) calls `decideDraft(cfg, { confidence: result.confidence, risks: result.risks })` to get the status/autoApproved it stamps onto a new `TwinDraft`. Three lines later, the component computes `const verdict = result ? decideDraft(cfg, { confidence: result.confidence, risks: result.risks }) : null;` (line 241) — the identical call, same `cfg`, same `result`, for the same render. `bankDraft` is only invoked from `approve()` (line 283) and `confirmReject()` (line 297), both of which already have `verdict` in scope.
- **Root cause**: `bankDraft` was written to be self-contained before (or independently of) the top-level `verdict` that now exists for the "already auto-approved" badge (line 572), and nobody wired the already-computed value through.
- **Impact**: No live bug — `decideDraft` is a pure function of arguments already in scope, so both calls agree today. But it is a correctness-adjacent trap: the two call sites' arguments must stay byte-for-byte identical for `autoBankedIdRef`'s "was this exact draft already auto-banked" logic (lines 311-315) to keep matching; a future change to only one of the two `decideDraft` call sites (e.g. passing an extra field) would silently desync the auto-bank record from the on-screen badge.
- **Fix sketch**: Change `bankDraft`'s signature to accept the verdict instead of recomputing it: `const bankDraft = (verdict: ReturnType<typeof decideDraft>): TwinDraft | null => { ... }`, drop the inner `decideDraft` call, and have `approve()`/`confirmReject()` guard `if (!verdict) return;` before calling `bankDraft(verdict)`.
