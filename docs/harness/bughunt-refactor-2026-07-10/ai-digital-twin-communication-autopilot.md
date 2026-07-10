# AI Digital Twin (Communication Autopilot)

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

## 1. A twin-reply restored from localStorage renders Approve/Reject buttons that silently do nothing

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/twin/TwinOutbox.tsx:220`
- **Scenario**: `useAiTool` persists each generation and rehydrates it on mount: its restore effect sets `data` and `status="done"` from localStorage when the component remounts (`useAiTool.ts:140-148`). So after the user generates a reply on a channel, navigates away or refreshes, and returns, `TwinOutbox` re-renders the full live-draft `section` (`{result && …}`, line 470) — editable reply, confidence bar, Approve/Reject/Copy — from the restored `result`. But `draftContext` is React state initialised to `null` and set **only** inside `runDraft` (line 202); a restore never repopulates it. Clicking **Approve** calls `bankDraft()`, whose first line is `if (!result || !draftContext) return null;` (line 220), so `approve()` bails at `if (!draft) return;` (line 285) and does nothing. **Reject** takes the same dead path via `confirmReject` (line 298). Repro: generate a reply, do not approve, reload `/app/[id]/schranka`, click Approve → no draft is banked, no error, no feedback.
- **Root cause**: The design assumes `result` and `draftContext` are always created together by `runDraft`, but `useAiTool`'s persistence layer can resurrect `result` alone across a mount, leaving the two invariants that `bankDraft` depends on out of sync.
- **Impact**: User-visibly-broken. The primary action on a restored draft (approve → send) is a dead button with zero feedback; the user believes the queue accepted their reply when nothing was recorded.
- **Fix sketch**: Reconstruct `draftContext` when a result is restored — either persist `{channel, contact}` alongside the reply, or in the restore path lazily seed `draftContext` from the current `channel` + `contact` when `result` exists but `draftContext` is null. Alternatively suppress the interactive live-draft affordances (show read-only + "regenerate") unless `draftContext` is set for the current session.

## 2. Under `auto`, edits typed into the reply box are silently discarded — the banked/sent record keeps the raw AI text

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/twin/TwinOutbox.tsx:270`
- **Scenario**: On an `auto` channel, a confident risk-free generation is banked by the effect at lines 253-281 using `reply: result.reply` (line 270) — the model's original text. The live-draft `<textarea>` (bound to `replyText`, lines 488-489) stays editable after auto-approval. A user who edits the reply and then sends it from the History list (`send(d.id)`, line 679) transmits the **banked** `result.reply`, not their edit. The file's own contract comment (line 218: "the human's edits ride along either way") holds for the manual `approve()`/`confirmReject()` paths — which read `replyText` (line 228) — but not for the auto-bank effect, which never looks at `replyText`.
- **Root cause**: Two banking paths (effect vs `bankDraft`) with divergent sources of truth for the reply body; the auto path snapshots `result.reply` at generation time and the editable field is assumed to be irrelevant once the gate self-approves.
- **Impact**: Wrong content sent. A user "fixing a typo" or softening a claim on an auto-approved draft sees their edit on screen but the connector delivers the un-edited AI text — exactly the silent divergence the review targets.
- **Fix sketch**: In the auto-bank effect, either bank `replyText` instead of `result.reply` (matching `bankDraft`), or make the reply box read-only once `verdict.autoApproved` has banked the record so the on-screen text can't diverge from what will be sent.

## 3. Regenerating on an `auto` channel banks a fresh approved, sendable draft each time — duplicate outbound risk

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/app/twin/TwinOutbox.tsx:256`
- **Scenario**: The auto-bank guard `if (autoBankedRef.current === result.reply) return;` (line 256) dedups only on identical reply **text**. Pressing **Regenerate** (`runDraft`, reusing the same `inbound`) yields a new `result.reply`; the effect sees `autoBankedRef.current !== result.reply` and banks a second `status:"approved", autoApproved:true` draft (lines 261-280). Regenerating N times on an `auto` channel leaves N approved, individually sendable records in History for one inbound conversation, each with its own Send button (line 679). Nothing collapses them to "the latest draft for this thread".
- **Root cause**: The dedup key ("was this exact reply string already banked") conflates "same generation" with "same conversation". Regeneration is an expected user action, but the gate treats every distinct text as a new approved message rather than superseding the prior auto-banked draft for the same `draftContext`.
- **Impact**: A user comparing regenerations can accidentally send two or three auto-approved replies to the same contact. State bloats with duplicate approved records that all read as ready-to-send.
- **Fix sketch**: When auto-banking, supersede the prior auto-banked draft for the same `draftContext` (reuse `autoBankedIdRef` to replace rather than append, mirroring the reject-overturns-in-place logic at lines 314-320), or key `autoBankedRef` on `draftContext` so a regenerate replaces the pending auto-approved record instead of adding one.

## 4. A hand-off seeded into a disabled channel silently drops the inbound message

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/modules/TwinInboxModule.tsx:87`
- **Scenario**: `useReplySeed` reads a `replySeedKey` payload (written by the Socials inbox hand-off) and `TwinInboxModule` opens on `seed?.channel` (lines 87-89), passing `seed.inbound`/`seed.contact` into `TwinOutbox` as `initialInbound`/`initialContact`. But `TwinOutbox` only renders the composer when `channel !== "leads" && cfg.enabled` (line 420); if the seeded channel is **disabled** (`cfg.enabled === false`) the composer — and the pre-filled inbound text — never render, showing only the "channel is off" notice (line 408). The seed was already cleared from `sessionStorage` on read (`TwinInboxModule.tsx:57`), so the conversation is gone: it cannot be recovered by navigating back.
- **Root cause**: The hand-off assumes the target channel is always writable; nothing reconciles `seed.channel` against that channel's `enabled` config before consuming (and destroying) the one-shot seed.
- **Impact**: A user who routed a customer message from Socials into the twin inbox for a channel they'd switched off loses that message with no trace and no error.
- **Fix sketch**: Before consuming the seed, fall back to an enabled channel (or surface the seeded text with a "this channel is off — enable it or pick another" prompt) rather than discarding it. At minimum, only `removeItem` the seed once it has actually populated a visible composer.

## 5. One shared `copied` flag flips every Copy button to "Copied" at once

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/twin/TwinOutbox.tsx:169`
- **Scenario**: `copied` is a single boolean (`useState`, line 169) toggled by `copy()` (lines 360-364) and read by two independent Copy buttons — the live-draft copy (line 603) and the just-approved copy (line 632). Copying either one flips both labels to "Copied" for 1.3s, so the UI reports that the *other* button's text was copied too.
- **Root cause**: A per-action transient ("this button was just clicked") is stored as one component-wide flag rather than being scoped to the button that fired.
- **Impact**: Cosmetic but misleading feedback when both copy affordances are on screen; the user can't tell which text actually reached the clipboard.
- **Fix sketch**: Key the flag by source (e.g. `copiedId: "live" | draftId | null`) and compare per button, or extract a small `CopyButton` that owns its own `copied` state.
