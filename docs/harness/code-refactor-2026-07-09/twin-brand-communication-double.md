# Twin - Brand Communication Double

> Context #22 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 1, Medium: 1, Low: 2)
> Files read: 11

## 1. The autonomy gate is only enforced client-side; the wire sanitizer trusts a POSTed draft's `status`/`autoApproved` verbatim

- **Severity**: Critical
- **Category**: structure
- **File**: `src/lib/twin/types.ts:332-362` (`sanitizeDraft`, called from `sanitizeTwinState` at 386-387)
- **Scenario**: `decideDraft` (types.ts:206-212) is documented as "the one rule, in one place" for whether a draft may be `approved`/`autoApproved`. In practice it is called from exactly one place in the whole repo: `TwinOutbox.tsx` (client). The persistence boundary — `POST /api/projects/[id]/twin` (`src/app/api/projects/[id]/twin/route.ts:11-22`) — does `sanitizeTwinState(await req.json())` on the raw client body and saves the result directly; there is no second call to `decideDraft`. `sanitizeDraft` whitelists `o.status` against `DRAFT_STATUSES` (types.ts:337-339) and takes `o.autoApproved === true` (types.ts:353) as-is. A client (devtools, a buggy retry, a compromised extension) can therefore POST a full `TwinState` containing a draft with `status: "approved"`, `autoApproved: true`, `risks: []`, for a channel whose `autonomy` is `"review"` — the gate that is supposed to require `auto` + confidence-above-threshold + zero risks is simply not on this path. `send/route.ts:33-35` then only checks `draft.status !== "approved"` before invoking the connector, so a forged draft is send-eligible.
- **Root cause**: `decideDraft` was built pure/framework-free specifically so both the client and the server could call it, but only the client-side "generate a draft" flow (`TwinOutbox.tsx: bankDraft` / the auto-bank `useEffect`) actually calls it. The server sanitizer's job was scoped to "bound and type-check the blob", not "re-derive its policy-sensitive fields", so `status`/`autoApproved` slipped through as plain passthrough fields instead of being revalidated.
- **Impact**: The single audit-trail guarantee the code's own comments make ("a draft here is a real record with a lifecycle... someone has to be able to audit that later") does not hold — the persisted `approved`/`autoApproved` state cannot be trusted to reflect an actual `decideDraft` verdict. This is the kind of gap that turns into an incident the day someone adds a real (non-`manual`) connector, since `send/route.ts` would then actually transmit a message that was never vetted.
- **Fix sketch**: In `route.ts`'s `POST` handler, after `sanitizeTwinState`, diff `state.drafts` against the previously saved `getTwin(project.id)` drafts by id: for any draft that is new or whose `status` transitions to `"approved"`/`"sent"` without a matching prior `"approved"` record, recompute the verdict via `decideDraft(channelConfig(state.channels, draft.channel), draft)` and overwrite `status`/`autoApproved` with the recomputed value rather than trusting the client's. Keep this logic in `route.ts` (or a new server-only helper it imports), not inside `sanitizeTwinState` itself.
- **Build risk**: `types.ts` is framework-free and imported by client components (`TwinOutbox.tsx`, `TwinChannels.tsx`, etc.) as well as server code. Do not pull `getTwin`/store access into `types.ts` to implement the previous-state comparison — that would add a `node:sqlite`/Firestore-touching import to a module a `"use client"` file imports, which `tsc --noEmit` will not catch but `next build` will (see constraint #3). Keep the revalidation in the server route.

## 2. `manual` connector's channel list is a hand-typed copy of `TWIN_CHANNELS`, not a reference to it

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/twin/connectors.ts:49`
- **Scenario**: `TWIN_CHANNELS` is defined once in `src/lib/twin/types.ts:22` as `["leads", "email", "chat", "social", "reviews", "sms", "whatsapp"]` and every UI surface (`TwinOutbox.tsx`, `TwinChannels.tsx`, `TwinVoiceStudio.tsx` via `TONE_SCOPES`) iterates that constant so a new channel shows up everywhere automatically. `connectors.ts:49` instead re-types the same seven strings as a literal for the `manual` connector's `channels` field, rather than writing `channels: TWIN_CHANNELS`.
- **Root cause**: `connectors.ts` was written to own its own connector-capability data, and nobody wired it back to the shared enum — the two lists happen to match today only because someone kept them in sync by hand.
- **Impact**: Add an eighth channel to `TWIN_CHANNELS` and every channel-driven UI (and `TONE_SCOPES`) picks it up for free — except `manual`, the only `configured: true` connector today. `connectorsForChannel(newChannel)` would silently return `[]`, and `sprava-kanalu`'s channel picker / `connectorInfo()`-driven UI would show the new channel as having no available connector at all, with no compiler or runtime error to catch the omission.
- **Fix sketch**: In `connectors.ts`, import `TWIN_CHANNELS` from `./types` (already imported as a type via `TwinChannel`) and replace the literal at line 49 with `channels: TWIN_CHANNELS`.

## 3. `connectorsForChannel` is exported but has no callers anywhere in the repo

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/twin/connectors.ts:89-92`
- **Scenario**: Repo-wide grep for `connectorsForChannel` matches only its own definition. The channel-picker UIs (`src/app/app/[projectId]/sprava-kanalu/page.tsx`, `src/components/demo/DemoModule.tsx`) call `connectorInfo()` (all connectors, unfiltered) and `send/route.ts` calls `connectorFor(cfg.connector)` (single id lookup) — neither of the two real call sites needed "connectors that serve channel X", so this helper was never wired to anything.
- **Root cause**: Likely written ahead of a per-channel connector picker that the UI ended up not needing (it shows all connectors and lets the config's `connector` id decide).
- **Impact**: Small — a phantom API surface that costs a reader time figuring out it's unused, and risks silently going stale (e.g. drifting from `TWIN_CHANNELS`, see finding 2) with nothing to catch it since it never runs.
- **Fix sketch**: Delete `connectorsForChannel` (lines 89-92) and its doc comment. If a per-channel connector picker is genuinely planned, keep it but add a one-line note saying so instead of leaving it silently unreferenced.

## 4. `EMPTY_TWIN_STATE` is exported but never imported anywhere

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/lib/twin/types.ts:170`
- **Scenario**: Repo-wide grep for `EMPTY_TWIN_STATE` matches only its own definition line. The one place that looks like it would want an "empty" default — `useTwinState.ts`'s `untrain()` — resets to `initialState` (the server-resolved `sampleTwin` seed), not this constant.
- **Root cause**: Probably a leftover from an earlier version of the module (perhaps before `sampleTwin`/`resolveTwin` existed as the real "untrained" default), or scaffolding for a test that was never written.
- **Impact**: Trivial — one unused exported constant; the only cost is a reader wondering whether it's the thing they should use for "the untrained state" (it isn't — `sampleTwin(type)` is).
- **Fix sketch**: Delete the `EMPTY_TWIN_STATE` const and its trailing section comment at line 170.

## 5. Scope-deduplication ("last `TwinVoice` per `ToneScope` wins") is written twice, with slightly different shapes

- **Severity**: Low
- **Category**: duplication
- **File**: `src/lib/twin/types.ts:371-372` (inside `sanitizeTwinState`)
- **Scenario**: `sanitizeTwinState` builds `const byScope = new Map<ToneScope, TwinVoice>()` and loops once over the incoming `voices` array, `byScope.set(v.scope, v)`, to collapse duplicate scopes to the last one. `src/lib/twin/resolve.ts:23-28` (`mergeVoices`) does the identical `Map<ToneScope, TwinVoice>` + `.set(v.scope, v)` pattern, but over two arrays (seeded then saved) to express "saved wins per scope, sample fills the rest".
- **Root cause**: Two different call sites each needed "one `TwinVoice` per `ToneScope`, later write wins" and each wrote its own 2-3 line Map-building loop instead of sharing a helper.
- **Impact**: Low — the duplication is tiny, but if the dedupe key or precedence rule ever needs a tweak (e.g. case-insensitive scope matching, or preferring non-empty `directives` over presence-only), one copy is an easy miss.
- **Fix sketch**: Add a small exported helper in `types.ts`, e.g. `dedupeVoicesByScope(...lists: TwinVoice[][]): TwinVoice[]` that folds all given lists left-to-right into a `Map<ToneScope, TwinVoice>` and returns `[...map.values()]`; have `sanitizeTwinState` call it with `[voices]` and `resolve.ts`'s `mergeVoices` call it with `[seeded, saved]`.
