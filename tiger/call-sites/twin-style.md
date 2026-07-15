---
id: twin-style
type: tiger/call-site
modality: text
file: src/lib/ai/tools/twin-style.ts:141
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet (quality tier) / gemini quality tier
schema: yes — TWIN_STYLE_SCHEMA, src/lib/ai/tools/twin-style.ts:80
grounding: 5/5
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-07-15
characters: []
---
## What it does
`generateTwinStyle` (twin-style.ts:141) distils a reusable per-channel brand voice from real sent messages: `summary`, `directives`, `traits`, `lengthHint`, `constraints[{kind: do|dont, rule}]`, `examples`, `gapQuestions`. Entry: `case "twin-style"` (route.ts:484-491), `cachedRespond` w/ server-side brand grounding (:489); UI `TwinVoiceStudio.tsx`.
**Meta / high-leverage:** its output (the trained voice) is server-injected into three downstream tools via `voiceLines` (voice.ts:1-3,20) — [[twin-reply]], [[social]], [[repurpose]]. `constraints` do/dont map to the VŽDY/NIKDY blocks (voice.ts:31-34). Any weakness here propagates verbatim into every voiced generation. `gapQuestions` (:6-11) is the clever half: the model names what samples do NOT reveal; user answers return as `answers` next call to sharpen the voice.

## Prompt & grounding
System (:35-46): "lingvista a stratég značky", Czech-only, explicit anti-invention ("Popisuj JEN to, co je opravdu vidět… Styl si nevymýšlej"), directives 2nd-person/literal/3-6 sentences, `kind` restricted to do/dont, examples must be NEW in-voice lines. Prompt `buildTwinStylePrompt` (:48-78). Grounding — **5/5, all real/no-invention by design:**
- `brand` — resolved server-side (route.ts:489 `resolveBrandContext`), not client-trusted (:61).
- `projectType` (:62). `current` — existing saved directives, refined not discarded (:63).
- `samples` — the core grounding: up to 10 real sent messages, each digested 1200 chars (:52,64-66).
- `answers` — user answers to prior gapQuestions, up to 10 (:53-56,67-69).
Low-data branch (:71-73): zero samples + zero answers → prompt orders the model to admit it in `summary` and lean on `gapQuestions` rather than fabricate a personality.

## Code quality (wrapping · logging · caching)
Exemplary. Chokepoint `generateStructured` (index.ts:267) → retries/fallback/telemetry/corrupt-detect/demo for free.
- **tier**: no `tier` → **quality** (index.ts:75-79). Correct for a meta call whose output propagates (contrast `repurpose` `tier:"fast"`). temperature 0.4 (:196).
- **Custom do/dont validator, two layers:** (1) `normalizeConstraints` (:125-139) drops empty `rule`; treats anything not starting with "don" as `"do"` (:134) so a model returning "always"/"never"/omitted never silently inverts a guardrail; caps 10. (2) `validate` via `withObjectGuard` (:179-188) rejects directives <40 chars or empty gapQuestions → one self-repair (index.ts:318-334); rationale (:177-178) — directives are the whole product, a blank must not overwrite a good voice.
- `demo`/fallback (:148-160): honest "voice not distilled" + generic gapQuestions, never a fabricated personality; directives fall back to `current`. `normalize` (:162-175) clamps every field. signal + locale threaded (:143-144,200-201).
- Golden test-llm/golden/twin-style.json (promptHash `ad3168196ab640e4`, 7 keys); registry validator (registry.mjs:221-230) strictly asserts `kind ∈ {do,dont}` + ≥1 trait/example/gapQuestion.

## Findings
- **strength / leverage** — correct architecture for a propagating meta-call: quality tier (not fast), two-layer do/dont defense, anti-invention prompt contract, server-resolved brand, validate guard blocking a blank voice from overwriting a trained one. Downstream ([[twin-reply]]/[[social]]/[[repurpose]]) is protected by construction. [[2026-07-15-scan]]
- **value (low) — quality unmeasured.** `quality_score`/`recommended_model` are "—"; golden exists but no LLM-judged quality score for this high-leverage site. With three downstream consumers this is the **highest-value site to add a quality benchmark** (llm:quality matrix / Lens-3). [[2026-07-15-scan]]
- **value (minor, info)** — grounding depends on user-pasted `samples` being genuine sent messages; the tool can't verify authenticity, only refuse to invent when absent. Low-data branch degrades honestly. [[2026-07-15-scan]]
