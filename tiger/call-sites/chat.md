---
id: chat
type: tiger/call-site
modality: text
file: src/lib/ai/tools/chat.ts:89
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet (quality tier) / gemini quality tier
schema: yes — CHAT_SCHEMA (single `reply` string), src/lib/ai/tools/chat.ts:28
grounding: 2/2
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-07-15
characters: []
---
## What it does
Report follow-up chat: free-text Q&A grounded in the same performance snapshot as the one-shot `analysis` tool. Entry route `POST /api/ai` mode `"chat"` (route.ts:463-472) → `generateChat` (route.ts:471). UI surface is the report/analysis follow-up chat.

## Prompt & grounding
- **System** (`CHAT_SYSTEM`, chat.ts:21-26): shared `ANALYST_PERSONA` (from ./persona, chat.ts:14; persona.ts:14) + chat rules — 2-5 sentences, no markdown, draw EXCLUSIVELY from the numbers, admit when data can't answer. Importing persona from ./persona (not ./analysis) is deliberate so a persona edit re-proves chat too (chat.ts:16-20).
- **User** (`buildChatPrompt`, chat.ts:49-61): frame wrapping (a) snapshot text + (b) full transcript. Snapshot from `buildSnapshot(req.period, "previous", data)` (chat.ts:88) via `snapshotToPromptText` (92); `data` is route-resolved + tenancy-checked. Prior turns via `transcript()` (37-41) serialized `Klient:`/`Asistent:` oldest-first, last line = current question.
- **Grounding 2/2** — both inputs real, injected verbatim: client snapshot + full multi-turn history. Prompt forbids invention (chat.ts:59). Multi-turn is genuine (whole transcript re-sent each turn).

## Code quality (wrapping · logging · caching)
- Chokepoint — single `generateStructured` (chat.ts:89), tagged (90). Inherits all wrapper telemetry (Firestore + LightTrack mirror), fallback, retries, deadline, cost stamp.
- Schema + validate + self-repair: `validateChat` (45-47) via `withObjectGuard` fails non-object/empty `reply` → repair re-prompt (index.ts:318-334). `looksCorrupt` applies.
- **History bounded (well)**: `validateChatRequest` caps at `CHAT_MAX_TURNS=24` (validation.ts:216-218) + `CHAT_MAX_CHARS=2000`/msg (229); last turn must be `user` (231-233). Worst-case ≈48k chars.
- Golden test-llm/golden/chat.json (promptHash `3dd605104a76ba3f`, schemaKeys `["reply"]`); registered registry.mjs:557-574.
- No `tier` → quality (defensible — report-grade answer). temperature 0.5 (deliberate notch above analysis's 0.4, chat.ts:95-97). Deterministic snapshot-grounded `demoChat` (65-78).

## Findings
- **code (low, awareness)** — cachedRespond keys on the whole growing transcript, so live chat effectively never hits cache; each turn re-sends full snapshot + up to ~48k chars uncached. Bounded token creep, not a bug — acceptable given the 24-turn/2000-char caps. [[2026-07-15-scan]]
- **strength-to-protect** — chokepoint, schema-constrained, validate+self-repair, corrupt-parse telemetry, bounded+truncated history, golden in sync, real-data demo fallback. code_score 5. [[2026-07-15-scan]]
