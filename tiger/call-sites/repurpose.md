---
id: repurpose
type: tiger/call-site
modality: text
file: src/lib/ai/tools/repurpose.ts:72
wrapper: generateStructured
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — REPURPOSE_SCHEMA, src/lib/ai/tools/repurpose.ts:48
grounding: 3/4
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
Turns one source article into one channel-native variant per requested channel (Newsletter, LinkedIn, Instagram, X, Facebook), each respecting the channel's soft character budget. Entry: `/api/ai` mode `repurpose` → [[repurpose]]. The deterministic `repurpose()` from `lib/distribution/generate` is both the demo and the per-channel floor (fills any channel the model skips), so the Distribuce module renders keyless.

## Prompt & grounding
System `REPURPOSE_SYSTEM` (`repurpose.ts:16`) gives a per-channel style guide (Newsletter subject line, LinkedIn bullets, Instagram emoji + 3–6 hashtags, X terse, Facebook conversational) and tells the model to retell — not copy — the source. `buildRepurposePrompt` (`repurpose.ts:30`) feeds: article title, tone, the article body/excerpt, and the requested channels each with their char limit.

REAL context this output *should* use:
1. article title ✓
2. article body / excerpt ✓ — the actual source content reaches the prompt (`repurpose.ts:36-38`)
3. tone ✓
4. brand voice / handles / the real UTM link ✗ — the link is deliberately deferred to the app ("don't insert a UTM link", `repurpose.ts:27`); no brand-voice grounding

Grounding **3/4** — the source article itself (the thing being repurposed) reaches the prompt, which is the essential grounding for this task. Only brand-voice context is missing.

## Code quality (wrapping · logging · caching)
- **Wrapping:** clean, single tagged call `// llm-tool: repurpose` (`repurpose.ts:135`).
- **Schema + normalize + validate + self-repair:** all four, all defined inline in `generateRepurpose`. Requested channels are restricted to the known `REPURPOSE_CHANNELS` set (order preserved, defaults to all). `normalize` (`repurpose.ts:94`) clamps each variant to its `channelLimit` and back-fills skipped channels from the deterministic templates; `validate` (`repurpose.ts:117`) flags any over-limit variant → one self-repair re-prompt.
- **Prompt bloat:** fixed (C5). The body is now bounded by a shared `digest()` (`tools/_shared.ts`) — lead + closing excerpt, middle elided, ≤6000 chars — both in `buildRepurposePrompt` (point of use, protects any caller) and in `validateRepurposeRequest` (which now digests long bodies instead of hard-rejecting at 6000). `temperature: 0.8` (`repurpose.ts`).
- **Caching:** input-hash response cache on `/api/ai` (C1) — re-repurposing the same article to the same channels reuses the result. Rate-limit/quota inherited.
- **Telemetry:** inherited from [[llm-wrapper]].
- **Golden coverage:** contract golden `test-llm/golden/repurpose.json` (C6), enforced by `llm-eval --strict` in the gate + CI; also a real-Claude probe in `test-llm/registry.mjs` (lenient ≥1 channel variant).

## Findings
- ✅ code · **C5 resolved** — body digested (head+tail excerpt) at prompt + validator; validator accepts long articles instead of rejecting. Unit-tested. [[2026-06-20-run]]
- ✅ code · **C1 resolved** — `/api/ai` input-hash cache. [[2026-06-20-run]]
- value · brand-voice context still missing (grounding 3/4 ceiling). (open)
