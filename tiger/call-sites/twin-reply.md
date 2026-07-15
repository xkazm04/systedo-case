---
id: twin-reply
type: tiger/call-site
modality: text
file: src/lib/ai/tools/twin-reply.ts:192
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-haiku (tier:fast, dev) / gemini flash-lite
schema: yes — TWIN_REPLY_SCHEMA, src/lib/ai/tools/twin-reply.ts:102
grounding: 7/7 (+3 bonus)
code_score: 5
quality_score: 2.9  # haiku on the hard stakes-sensitive scenario; sonnet 5.0 — see [[benchmark-2026-07-15-twin-reply]]
recommended_model: "upgrade fast → quality (Sonnet)"  # V1 CONFIRMED — Haiku miscalibrates confidence + under-fills risks
status: benchmarked
last_scanned: 2026-07-15
characters: []
---
## What it does
The Twin's outbound draft: writes the next message on any channel in the brand's TRAINED voice, plus `confidence` (0–100), `risks[]`, `questions[]`, `toneNotes` (`generateTwinReply` twin-reply.ts:137; call :192). Entry: `/api/ai` mode `"twin-reply"` → `validateTwinReplyRequest` → `cachedRespond` → `generateTwinReply` (route.ts:474-482). Consumed by Twin inbox/outbox (`TwinOutbox.tsx:173`, `TwinInboxModule.tsx`) and still `SpeedLeadModule.tsx:184`. **Succeeds [[lead-reply]]** (retired): does everything lead-reply did (BANT-aware first answer + qualification questions) plus per-channel voice, `confidence`, `risks`. `decideDraft` only self-approves a draft above the channel threshold with zero risks → those two fields are load-bearing.

## Prompt & grounding
System (`TWIN_REPLY_SYSTEM` :38): Czech w/ diacritics, mimic brand voice, "VŽDY/NIKDY" rules override model judgment, no promising prices/dates/discounts not in brief, no emoji, strict `confidence`, always populate `risks` on any promise/number/complaint/health/legal/money ("empty = safe to auto-send, don't lie to it", :49). Prompt (`buildTwinReplyPrompt` :63), grounded:
1. **Trained voice** — server-injected `voiceLines(req.voice)` (:81; voice.ts), USER-prompt only so gate/golden fingerprint stays stable; resolved SERVER-SIDE from the project's twin, never client-accepted.
2. Inbound message (digest 3000, :91). 3. Channel (:64) + arrival (:79). 4. Brand — upgraded server-side to real offering via `resolveBrandContext` (route.ts:480), USER-prompt only. 5. projectType (:75) + contact (:78). 6. qualification/BANT (:80) → "only ask what's still missing" (:93-95). Bonus: thread history last 8 turns (`threadLines` :52), voice examples (:82), avoid/rejection-learning (:85, prior human-rejected replies fed back), `refineLines`. Materially richer than lead-reply's 5/5 → **7/7 + 3 bonus**.

## Code quality (wrapping · logging · caching)
- Chokepoint, one tagged call (:193). `tier:"fast"` → haiku-4-5 dev / gemini flash-lite prod (index.ts:75-78, cost.ts:43). temperature 0.7 (:200).
- schema + normalize + demo + **`validate` gate** (`withObjectGuard` :182-190): flags empty `reply`, non-number `confidence`, non-array `risks` → one self-repair before normalize floor. Comment (:178-181) names the failure it closes (empty reply silently swapped for canned draft reads as fake success; omitted confidence looks like a deliberate "not send-ready"). `clampScore` bounds confidence 0–100.
- Deterministic floor `draftReply`: keyless demo self-scores `confidence:0` + names itself in `risks` so the autonomy gate can never auto-approve a canned draft (:142-161) — well-designed.
- **Caching: YES** — `cachedRespond("twin-reply", …)` (route.ts:482); closes lead-reply's open C1.
- Golden test-llm/golden/twin-reply.json (promptHash `225f2ca6…`, all 5 keys); registry.mjs:163 (`tier:"fast"`); hashed in llm-gate (last proven 2026-07-14).

## Findings
- **⚠️ value+model (HIGH) — V1 CONFIRMED by benchmark: fast-tier Haiku fails the senior-bar on stakes-sensitive replies.** [[benchmark-2026-07-15-twin-reply]] ran haiku/sonnet/opus × 2 character scenarios. **Haiku 2.9/5** on the hard case (health complaint + price + guarantee), **Sonnet 5.0**, Opus 4.75 (no lift over Sonnet). Haiku's two failures are exactly the ones that erode the auto-send gate: **confidence 78 on a sensitive health case** (Sonnet 35) and **empty `risks` on the easy case while proposing unverified calendar slots** → eligible to auto-send. **Action: set `twin-reply` tier `"fast"` → `"quality"` (Sonnet), matching predecessor [[lead-reply]].** Ceiling: prod fast tier is Gemini flash-lite (untested, ≤ Haiku → risk at least this bad); re-verify on a live Gemini run (M1). [[2026-07-15-scan]]
- **strength** — validate gate present + correct (carries forward lead-reply's C4, :182). [[2026-07-15-scan]]
- **strength** — caching added (closes lead-reply's C1, route.ts:482). [[2026-07-15-scan]]
- **strength** — grounding materially exceeds lead-reply (server-injected voice, thread history, rejection-learning, offering-upgraded brand), all USER-prompt only so gate holds. [[2026-07-15-scan]]
- **code (note)** — duplicate `TwinChannel` Czech label map in twin-reply.ts:28 and twin-style.ts; cosmetic, gate-neutral. [[2026-07-15-scan]]
