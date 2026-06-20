---
id: llm-wrapper
type: tiger/call-site
modality: text-wrapper
file: src/lib/llm/index.ts:148
wrapper: generateStructured (THE chokepoint)
provider: claude (dev, CLI/Sonnet) · gemini (prod, gemini-3-flash-preview)
model: claude-sonnet (dev) / gemini-3-flash-preview (prod)
schema: yes (Google GenAI Type form; native responseSchema on Gemini, embedded into the prompt for Claude)
grounding: n/a (plumbing)
code_score: "5"
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
The single chokepoint every text tool (16 `generateStructured` sites) funnels through ([src/lib/llm/index.ts:148](../../src/lib/llm/index.ts)). It decides the provider by environment (dev→Claude CLI/Sonnet, prod→Gemini), runs with bounded retry + cross-provider fallback, optionally self-repairs domain-limit violations with one re-prompt, stamps a cost/latency/attempts envelope, records eval telemetry, applies the locale override, and degrades to a deterministic demo when no provider is available. Providers: [claude.ts](../../src/lib/llm/claude.ts) (shells the `claude` CLI, robust JSON extraction), [gemini.ts](../../src/lib/llm/gemini.ts) (`@google/genai` native structured output + usage). This is the **strength all text tools inherit** — and the standard the three non-text call sites ([[creative-image-gen]], [[creative-vision-score]], [[patterns-embed]]) fall short of.

## Prompt & grounding
n/a — this is plumbing, not a prompt. It is *grounding-neutral*: it passes `system`/`prompt`/`schema` through verbatim (each tool owns its own grounding) and only appends the **locale override** for non-`cs` locales — deliberately onto the *prompt*, never the system prompt, so the telemetry fingerprint (system + schema) is unchanged and the golden/coverage gate is unaffected ([index.ts:58-66,157-159](../../src/lib/llm/index.ts)). Self-repair appends a `buildRepairNote` ([index.ts:131](../../src/lib/llm/index.ts)) listing the violations to fix.

## Code quality
- **Chokepoint/wrapping:** Exemplary single funnel. Two providers behind a uniform `Provider` interface ([index.ts:76-93](../../src/lib/llm/index.ts)); environment-ordered, filtered to what's `available()`, with cross-provider fallback (`fellBack` flag) when the preferred one throws ([index.ts:154-167,229-233](../../src/lib/llm/index.ts)). One tagged call per tool via the `id`/`// llm-tool:` convention.
- **Schema/validation/self-repair:** Typed schema in Google GenAI `Type` form — native `responseSchema` on Gemini, embedded into the prompt for Claude ([gemini.ts:39](../../src/lib/llm/gemini.ts), [claude.ts:57-67](../../src/lib/llm/claude.ts)). `normalize()` maps+clamps to the typed result; `validate()` runs domain-limit checks on the *raw* output and triggers **one self-repair re-prompt** before normalize's clamp guarantees validity ([index.ts:176-192](../../src/lib/llm/index.ts)). Claude output is extracted robustly (direct → fenced → stream-json envelope → balanced-brace scan, [claude.ts:139-177](../../src/lib/llm/claude.ts)).
- **Retry/fallback:** Bounded retry (2 attempts) gated on a recoverable-error allowlist (`RETRYABLE`) with linear backoff ([index.ts:96-128](../../src/lib/llm/index.ts)); then cross-provider fallback; then deterministic demo. Defense in depth.
- **Caching/dedupe:** **None at the wrapper level** — identical (system, prompt, schema) re-generates. Defensible for text (locale-/freshness-sensitive, varied inputs) and lower-yield than the image/embedding caches, but worth noting as the one gap in an otherwise complete plumbing layer.
- **Telemetry:** **Fully instrumented — the reference standard.** Every call (real *and* demo) writes a `recordLlmCall` entry with toolId, prompt fingerprint, provider, model, demo flag, tookMs, attempts, repaired, estCostUsd, input/output tokens ([index.ts:213-226,244-257](../../src/lib/llm/index.ts) → [telemetry.ts:47](../../src/lib/llm/telemetry.ts), Firestore). Cost via per-model rate table ([cost.ts:28](../../src/lib/llm/cost.ts); Claude=subscription→$0). Best-effort writes never break a generation. `aggregateTelemetry` + a stable `promptFingerprint` surface per-tool cost/latency and **contract drift** ([telemetry.ts:37,80](../../src/lib/llm/telemetry.ts)). The three non-text sites have *none* of this.
- **Efficiency:** Effective prompt built once and reused across attempts/repair ([index.ts:159-165](../../src/lib/llm/index.ts)). `temperature` plumbed through; Gemini defaults to 1.0, Claude uses a medium 4000-token thinking budget ([models.ts:27](../../src/lib/llm/models.ts)). Claude timeout 150 s sized for the heaviest tool.

## Findings
- (stub) code · **Strength to protect** — this is the gold standard the non-text sites should match: one chokepoint, typed schema + validate + self-repair, retry + cross-provider fallback, full cost/latency/drift telemetry, demo fallback. Raised [[2026-06-20-run]].
- (stub) code · (minor) no wrapper-level response cache — lower priority than the image/embedding caches; most text inputs are varied/locale-sensitive.
- (stub) code · the image/vision/embedding sites should reuse `recordLlmCall` (or a sibling) so all four modalities feed one eval dashboard.
