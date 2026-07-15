---
id: channel-research
type: tiger/call-site
modality: text
file: src/lib/ai/tools/channel-research.ts:244
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet (quality tier, no `tier:"fast"`) / gemini quality tier
schema: yes — CHANNEL_RESEARCH_SCHEMA, src/lib/ai/tools/channel-research.ts:101
grounding: 6/6
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-07-15
characters: []
---
## What it does
From a project's business context it returns a ranked plan of free/organic visibility channels (directories, marketplaces, communities, owned content, PR, partnerships), each with a 0–100 fit, effort, rationale, payoff and 2–4 first actions (channel-research.ts:1–14). Entry route: POST `src/app/api/ai/route.ts:549–552` (`case "channel-research"`); UI surface is the `kanaly` module at `src/app/app/[projectId]/kanaly/page.tsx`.

## Prompt & grounding
System prompt (channel-research.ts:37–56) is a Czech organic-visibility strategist: 6–9 concrete free channels, per-channel fields, ranked by fit descending, plus a `summary`; embeds `antiFabrication(...)` (line 50) forbidding invented competitor facts/numbers. User prompt builder (channel-research.ts:75–99) threads every request field: projectType→Czech framing (79–80 via `TYPE_FRAMING`/`resolveType`), brand (82), offering (83), localities (84–86), competitors (87–89, "jen pro rámec, nevymýšlej si o ní čísla"), keywords (90–92), and `refine` follow-up (97). All 6 core context fields + refine reach the prompt → **grounding 6/6**; the task is reason-from-type-and-offering, so nothing material is withheld.

## Code quality (wrapping · logging · caching)
- Chokepoint `generateStructured` (channel-research.ts:244; wrapper index.ts:267) — inherits provider switch, 3-attempt retry, cross-provider fallback, deadline, abort, telemetry (`recordLlmCall`/`recordLlmError` + `looksCorrupt` corrupt-status classification).
- Schema + normalize + validate + self-repair: native `Type` schema (101–151); `normalizeChannelResearch` (184–223) slugifies→dedupes ids, `clampFit` 0–100, coerces enums, caps `firstActions` to 4, falls back to curated `demoChannelResearch` (164–179); `validateChannelResearch` (227–237) requires `summary` + ≥3 named channels → one self-repair re-prompt.
- **Route caching: YES** — `cachedRespond` (route.ts:84–153) keys on `hashAiInput(mode, locale, value, providerTag)`, BYOM-bucketed, spend-refund on hit. The +1 over inherited baseline.
- Golden present (test-llm/golden/channel-research.json, promptHash `3ebb6e442c386bcb`); registered registry.mjs:610.
- No `tier` → quality tier; temperature 0.6 (channel-research.ts:250). No prompt bloat.

## Findings
- **model (low)** — not on `tier:"fast"` despite being a ranked-list enumeration task with heavy deterministic normalization/clamping + demo floor. A haiku/flash-lite tier likely holds quality; worth a Lens-3 A/B. [[2026-07-15-scan]]
- **code (low, cosmetic)** — registry fixture strings (registry.mjs:612–615) paraphrase rather than import the source prompt constants; golden `promptHash` protects the gate, but the human-readable registry entry can drift silently. [[2026-07-15-scan]]
- **strength-to-protect** — chokepoint + native schema + validate/self-repair + normalize floor + route input-hash cache + golden. No telemetry gaps, no missing golden. [[2026-07-15-scan]]
