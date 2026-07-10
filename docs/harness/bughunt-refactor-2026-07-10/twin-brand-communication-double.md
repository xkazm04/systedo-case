# Twin - Brand Communication Double

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

Note: the prior report's finding #1 (client-only autonomy gate) has since been fixed —
`route.ts` now runs `enforceAutonomy` server-side. `connectorsForChannel` (#3) and
`EMPTY_TWIN_STATE` (#4) were deleted. The manual-channels literal (#2) and the
voices-dedupe duplication (#5) remain but are NOT restated here.

## 1. `enforceAutonomy` stomps an auto-approved draft's terminal `sent` status back to `approved`

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/app/api/projects/[id]/twin/route.ts:26` (with `decideDraft` contract in `src/lib/twin/types.ts:204`)
- **Scenario**: An `auto`-channel draft is banked as `{status:"approved", autoApproved:true}` (`TwinOutbox.tsx:274-275`). The human sends it: `send/route.ts:54` persists `{...d, status:"sent", sentAt}` — keeping `autoApproved:true` (spread `...d`) — and the client mirrors that with `onCommit(... status:"sent" ...)` (`TwinOutbox.tsx:346`). That `onCommit` fires `useTwinState.commit` → `POST /api/projects/[id]/twin`, whose `enforceAutonomy` (route.ts:19-30) re-derives every draft where `d.autoApproved` is true. For this now-`sent` draft the gate still clears (same high confidence, empty risks, still-`auto` channel), so line 26 returns `{...d, status:"approved" as const, autoApproved:true}` — **overwriting the `sent` status with `approved`** in the persisted blob. The DB therefore never records the send; on next load `resolveTwin` yields the draft as `approved`, i.e. send-eligible again. `send/route.ts:33` only checks `status !== "approved"`, so the same auto-drafted message can be re-sent.
- **Root cause**: `enforceAutonomy` treats `decideDraft`'s `pending`↔`approved` gate as if it governs the *whole* lifecycle; it unconditionally forces `status:"approved"` on any auto-approved draft that clears, ignoring that `sent`/`rejected` are terminal states past the gate's jurisdiction.
- **Impact**: Silent corruption of exactly the drafts the "auditable record" design exists for (machine-approved, no human in the loop): the persisted lifecycle lies (`sent` → `approved`), and a real (non-`manual`) connector would re-transmit the message on the next state commit.
- **Fix sketch**: In `enforceAutonomy`, short-circuit terminal drafts before re-deriving: `if (!d.autoApproved || d.status === "sent" || d.status === "rejected") return d;`. The gate should only ever move a draft between `pending` and `approved`.

## 2. `resolveVoice` matches an empty-directive channel voice, silently defeating the `generic` fallback

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/twin/types.ts:185` (consumed at `src/lib/twin/load.ts:24-27`)
- **Scenario**: `resolveVoice(voices, scope)` returns `voices.find(v => v.scope === key) ?? generic ?? null` — it keys purely on *scope presence*. `sanitizeVoice` (types.ts:286) persists a voice even when `directives` is empty (only `traits`/`examples` filled, or directives cleared). So once a per-channel voice row exists for e.g. `email` with blank directives, `resolveVoice(voices, "email")` returns that empty row instead of falling through to the trained `generic` register. `loadTwinVoice` (load.ts:26) then sees `!voice.directives.trim()` and returns `undefined` — the AI request (`/api/ai`, `/api/social/draft`) drafts with **no brand voice at all**, even though a real `generic` voice exists. The client draft path (`TwinOutbox.tsx:182`) has the same shadowing. Meanwhile `readiness.hasVoice`/`deriveReadiness` (readiness.ts:48,52) define "has a voice" as *directives non-empty*, so the ribbon reports the channel as untrained — a definition the fallback logic doesn't share.
- **Root cause**: Two disagreeing definitions of "this scope has a usable voice": `resolveVoice` uses scope-presence; readiness and `loadTwinVoice` use directives-non-empty. An empty row satisfies the first but not the second, so it shadows `generic` without ticking any readiness gate.
- **Impact**: A channel the user *tried* to personalise (but left directives blank) silently loses the generic brand voice on every AI draft for that channel — no error, no readiness signal.
- **Fix sketch**: Make `resolveVoice` skip voices with empty directives when choosing the scope match (treat blank-directive rows as absent, falling through to `generic`), e.g. `voices.find(v => v.scope === key && v.directives.trim()) ?? voices.find(v => v.scope === "generic" && v.directives.trim()) ?? null`. Share one `isTrainedVoice(v)` predicate with `readiness.hasVoice`.

## 3. Twin persistence has no idempotency or optimistic concurrency — full-blob writes race and `send` can double-fire

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/twin/store.local.ts:22` / `store.firestore.ts:24` (`saveTwin`), consumed by `src/app/api/projects/[id]/twin/send/route.ts:52`
- **Scenario**: `saveTwin` overwrites the *entire* `{voices,channels,facts,drafts}` document (SQLite `ON CONFLICT DO UPDATE SET data=...`, Firestore `.set(...)`), and four independent writers POST full state: the three editor routes' `commit` (fire-and-forget, `useTwinState.ts:29`) and `send/route.ts`. Any interleaving is last-write-wins with no version check — a `commit` from one surface silently drops a concurrent write from another (or from the send route's own follow-up commit). Separately, `send/route.ts` reads the saved draft, checks `status==="approved"`, then sends — with no per-draft lock or idempotency key. Two overlapping send requests for the same `draftId` (double-click before the client's `setSendingId` disables the button, a retry, or a second tab) both pass the status check and both invoke `connector.send`.
- **Root cause**: The persistence model is a single mutable blob with no revision/`updatedAt` compare-and-swap, and the send path has no "claim before send" transition; both assume a single serial writer.
- **Impact**: Lost updates between concurrent edits today; latent duplicate delivery the moment a real (non-`manual`) connector replaces the current no-op sender.
- **Fix sketch**: Give `send/route.ts` a claim-before-send transition (atomically move `approved`→`sending`/`sent` guarded on the current status, reject if already advanced), and add an `updatedAt`/rev field that `saveTwin` checks (CAS) so a stale full-blob write 409s instead of clobbering.

## 4. `loadTwinVoice` injects the *seeded* generic voice for an untrained twin, contradicting its documented "returns undefined for an untrained twin"

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/twin/load.ts:22-28`
- **Scenario**: `loadTwinVoice` calls `resolveTwin` (resolve.ts:30), which for a project with no saved state returns `sampleTwin(type)` — whose `generic` voice carries non-empty `GENERIC_DIRECTIVES` (sample.ts:73-81). `resolveVoice` returns that seeded voice, and the `!voice.directives.trim()` guard passes, so `loadTwinVoice` returns `voiceToWire(seededGeneric)` rather than `undefined`. The file's own contract (load.ts:9-11) states it "Returns `undefined` for an untrained twin." Consumers (`/api/ai` twin-reply/repurpose, `/api/social/draft`) then steer generation with placeholder copy and, in the twin-reply UI, present it alongside an autonomy/confidence signal as the brand's trained voice — while the readiness ribbon reports the voice as absent/partial. `resolveTwin` even exposes `source: "sample"`, which `loadTwinVoice` discards.
- **Root cause**: The "untrained ⇒ no voice" decision is made against `directives` emptiness, but the seeded sample deliberately ships non-empty generic directives, so the emptiness check never fires for an untrained project.
- **Impact**: The AI layer cannot distinguish a trained voice from a seeded placeholder; an "untrained" brand still gets its outbound drafts silently shaped by seed copy the UI says isn't there. Low (seed copy is on-brand-ish), but the contract/behaviour mismatch invites wrong assumptions downstream.
- **Fix sketch**: Thread `source` out of `resolveTwin` and have `loadTwinVoice` return `undefined` when `source === "sample"` (or gate on it explicitly), matching the documented contract; if seeded steering is intended, correct the doc comment and surface `source` to callers.

## 5. `PRIORITY` in readiness.ts is a verbatim re-declaration of `MILESTONES`

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/twin/readiness.ts:80` (vs `:14`)
- **Scenario**: `MILESTONES` (line 14) is `["grounding","voice","training","guardrails","channels","activity"]`. `PRIORITY` (line 80) is the identical array in the identical order, used only for `PRIORITY.indexOf(...)` tie-breaking in `buildGaps` (line 100). The two must stay in lockstep by hand; reorder or extend `MILESTONES` and the tie-break order silently keeps the old sequence. (Verified NEW: the 2026-07-09 report's five findings were confined to `types.ts` and `connectors.ts`; `readiness.ts` was not flagged.)
- **Root cause**: The "foundation order" tie-breaker was written as its own literal instead of referencing the canonical `MILESTONES` order.
- **Impact**: Trivial today, but a drift hazard — a reordered `MILESTONES` would leave `buildGaps` sorting by a stale priority with nothing to catch it.
- **Fix sketch**: Replace the literal with `const PRIORITY: readonly Milestone[] = MILESTONES;` (or drop `PRIORITY` and call `MILESTONES.indexOf(...)` directly), and add a comment if a distinct priority order is ever genuinely wanted.
