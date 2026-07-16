# Twin - Brand Communication Double — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Stored twin blobs are trusted on read — a malformed blob crashes `resolveTwin` outside its own safety net
- **Severity**: High
- **Lens**: ambiguity
- **Category**: unsanitized-persisted-read
- **File**: src/lib/twin/store.local.ts:17 (also src/lib/twin/store.firestore.ts:18)
- **Scenario**: Both backends do `JSON.parse(row.data) as TwinState` — a bare cast, no shape check. A legacy blob from an older schema (e.g. saved before `drafts`/`channels` existed), or a hand-edited/partially-written doc, parses fine but lacks the arrays. `resolveTwin` catches only the `getTwin` call (resolve.ts:33-37); the subsequent `mergeVoices(saved.voices, …)` and `saved.channels.length` run OUTSIDE the try and throw `TypeError` on `undefined`.
- **Root cause**: types.ts:13-14 documents "everything the wire can supply passes through `sanitizeTwinState` first", but the READ path silently assumes every persisted blob was written by a sanitizing route — an undocumented invariant that schema evolution or manual edits will violate.
- **Impact**: One bad row bricks the whole twin module page for that project (route-level `resolveTwinVoice` swallows it, but any direct `resolveTwin` consumer crashes) with no recovery path short of `clearTwin`.
- **Fix sketch**: Run `sanitizeTwinState(JSON.parse(...))` in `getTwin` (both backends), or at least in `resolveTwin` before the merge. Sanitize is already pure and total over `unknown` — one line makes reads self-healing and makes the documented invariant true.

## 2. The auto-approval audit trail is client-forgeable, contradicting its stated purpose
- **Severity**: High
- **Lens**: ambiguity
- **Category**: forgeable-audit-record
- **File**: src/lib/twin/types.ts:444-445 (sanitizeDraft), types.ts:120-123
- **Scenario**: types.ts:120-123 says drafts are persisted records with a lifecycle "because `auto` mode means a message can reach `approved` with no human in the loop and someone has to be able to audit that later." Yet `sanitizeDraft` accepts `status` ("approved"/"sent") and `autoApproved: o.autoApproved === true` straight from the client POST, along with arbitrary `confidence`, `decidedAt` and `sentAt`.
- **Root cause**: The client-owns-the-blob design (types.ts:14) and the audit-record design pull in opposite directions, and nothing documents which one wins. `decideDraft` is "the one rule, in one place" — but only for drafts created server-side; the wire re-imports decisions unchecked.
- **Impact**: The outbox's "auto-approved" flag and decision timestamps prove nothing: any tampered or buggy client can rewrite history (mark rejected drafts sent, launder an auto-approval as human-approved). Anyone later auditing `auto` behaviour from these records is reading fiction.
- **Fix sketch**: Either document loudly that draft lifecycle fields are client-asserted and NOT an audit trail, or make the save route own transitions: server sets `decidedAt`/`sentAt`/`autoApproved`, and sanitize refuses to move a stored draft's status backwards (needs the route to diff against the previous blob — it already loads it to archive overflow).

## 3. Both backends persist `updated_at` that `getTwin` never returns — `ResolvedTwin.updatedAt` is effectively always undefined
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: write-only-field
- **File**: src/lib/twin/store.firestore.ts:25-28 (also store.local.ts:23-31, resolve.ts:51)
- **Scenario**: `saveTwin` writes an `updatedAt` doc field (Firestore) / `updated_at` column (sqlite) next to the JSON blob, but `getTwin` reads only the `data` string. `TwinState.updatedAt` inside the blob is optional and nothing server-side sets it, so `resolveTwin`'s `updatedAt: saved.updatedAt` (resolve.ts:51) yields the client-supplied value or — typically — `undefined`.
- **Root cause**: The timestamp lives in two places (row metadata vs. blob field) and each writer/reader picked a different one; neither the store interface nor `ResolvedTwin` documents which is authoritative.
- **Impact**: Any "last trained" display or staleness logic built on `ResolvedTwin.updatedAt` silently shows nothing (or a client-forged value); the honestly-maintained row timestamp is dead weight. Future developers will trust the field name and ship a blank.
- **Fix sketch**: Have `getTwin` select `updated_at` and return it (e.g. `{ state, updatedAt }` or stamp `state.updatedAt` server-side in `saveTwin` before serializing). Delete whichever copy loses.

## 4. `decideDraft` self-approves on channels that are disabled — the "one rule, in one place" omits `enabled`
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: incomplete-policy-gate
- **File**: src/lib/twin/types.ts:204-210
- **Scenario**: `decideDraft` checks `autonomy === "auto"`, confidence and risks — but not `cfg.enabled`. A channel the user switched off (but whose stored config still says `autonomy: "auto"`) will still return `{ status: "approved", autoApproved: true }` if a caller drafts on it. Note `channelConfig`'s fallback (types.ts:190-197) defaults `enabled: false` with `autonomy: "assist"`, so the seam exists only for explicitly-configured-then-disabled channels — the easiest state to reach.
- **Root cause**: The doc comment (types.ts:200-203) promises "the one rule, in one place", so callers reasonably won't re-check `enabled`; whether a disabled channel may draft at all is an assumption living in unseen caller code.
- **Impact**: An auto-approved message on a channel the operator believed was off — exactly the trust breach the autonomy tiers exist to prevent. Even if today's UI never drafts on disabled channels, the pure function's contract invites the bug from any new caller (e.g. a server-side drafter, which wire.ts anticipates).
- **Fix sketch**: Add `cfg.enabled &&` to the `clears` expression (a disabled channel can still receive a pending draft but never a self-approved one), or explicitly document that callers must gate on `enabled` before calling.

## 5. "Sending through an unconfigured connector is a caller error" — but nothing prevents storing one, and unknown vs. unconfigured ids behave inconsistently
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: unenforced-contract
- **File**: src/lib/twin/connectors.ts:63, types.ts:404
- **Scenario**: `sanitizeChannelConfig` accepts any 40-char string as `connector` (falling back to "manual" only when empty), so a channel config can persist `connector: "email-smtp"` while `TWIN_SMTP_URL` is unset, or a typo like "email-smpt". At send time the two failure shapes diverge: an unknown id silently degrades to `manual` (`connectorFor`, connectors.ts:85-87 — "must never strand a draft"), while a known-but-unconfigured id throws.
- **Root cause**: The "caller error" contract (connectors.ts:63) is asserted in a comment but enforced nowhere in the module; sanitize validates every other enum-like field (`autonomy`, `status`, `rejectReason`) but leaves `connector` free-text.
- **Impact**: A typo'd connector id silently sends via manual (surprising but survivable); a stale unconfigured id throws at the moment a human approves a draft — the worst place to discover a config error, and the inconsistency means future connector authors can't tell which failure mode is the intended design.
- **Fix sketch**: In `sanitizeChannelConfig`, resolve the id through `connectorFor` and store `connectorFor(id).configured ? id : "manual"` (or validate against `CONNECTORS` ids), making the invariant "a stored config always names a usable connector" true at the same boundary that guards everything else.
