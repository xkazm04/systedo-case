---
id: patterns-embed
type: tiger/call-site
modality: embedding
file: src/lib/patterns/embeddings.ts:8
wrapper: direct (fetch :embedContent, one request per text in parallel)
provider: gemini
model: gemini-embedding-001 (override via GEMINI_EMBED_MODEL)
schema: n/a (vector output)
grounding: 2/2
code_score: "2"
quality_score: "—"
recommended_model: "—"
status: improved
last_scanned: 2026-06-20
characters: []
---

## What it does
Gemini text embeddings for semantic (RAG) retrieval over the tenant's winning-patterns library. `embedTexts` ([src/lib/patterns/embeddings.ts:23](../../src/lib/patterns/embeddings.ts)) embeds a batch (one `embedContent` request per text, in parallel); `cosine` ([embeddings.ts:36](../../src/lib/patterns/embeddings.ts)) ranks. Two consumers in [src/lib/patterns/store.ts](../../src/lib/patterns/store.ts): `searchPatterns` (the `POST /api/patterns/search` UI surface, [search/route.ts:38](../../src/app/api/patterns/search/route.ts)) and `getPatternLines` (RAG grounding fed into the campaign-eval text prompt). Both **fall back to case-insensitive substring matching** when embeddings are unavailable (`semantic: false`).

## Prompt & grounding
The corpus embedded is the **tenant's own** library — `saved` (hand-pinned) + `auto` (live-derived by `extractPatterns`) patterns, concatenated `title. insight evidence` ([store.ts:69,103](../../src/lib/patterns/store.ts)) — plus the live `query` (the search box, or the current portfolio situation for `getPatternLines`). **Grounding 2/2** — both the tenant corpus and the query are embedded, so retrieval is genuinely per-tenant RAG, not a generic prior. (Honest ceiling: each text is truncated to 2000 chars at [embeddings.ts:13](../../src/lib/patterns/embeddings.ts); long patterns lose their tail. No cross-tenant/global best-practice corpus is mixed in — purely the tenant's own wins.)

## Code quality
- **Chokepoint/wrapping:** NOT through the text `[[llm-wrapper]]` — a direct `fetch` to `:embedContent`. (Reasonable, since the wrapper is structured-JSON-generation-shaped, not embeddings-shaped — but it means embeddings inherit none of the shared telemetry.)
- **Schema/validation:** n/a (vector). Guards length: returns null unless **every** vector is non-empty ([embeddings.ts:28](../../src/lib/patterns/embeddings.ts)), and `cosine` returns 0 on degenerate vectors — so a partial failure cleanly degrades the whole batch to substring fallback rather than mis-ranking.
- **Retry/fallback/self-repair:** **No retry.** Any single `embedOne` rejection (a 429 on one of N+1 parallel calls) throws → the whole `Promise.all` rejects → `catch` logs and returns null → silent downgrade to substring match ([embeddings.ts:26-32](../../src/lib/patterns/embeddings.ts)). The substring fallback is a good floor, but one transient 429 demotes the entire search from semantic to substring with no retry and no signal to the user beyond the `semantic:false` flag.
- **Caching/dedupe:** **NONE — and this is the sharpest efficiency gap.** The **corpus is re-embedded on every single search/eval call.** The tenant's pattern vectors are static between writes, yet `searchPatterns`/`getPatternLines` re-embed all N pattern texts plus the query each time ([store.ts:70,104](../../src/lib/patterns/store.ts)). With M searches over an N-pattern library that's `M×(N+1)` embed calls where it should be `N (cached) + M (queries)`. Precompute + persist pattern embeddings on save (alongside the Firestore pattern doc) and embed only the query at search time.
- **Rate-limit/quota:** Search route is IP-throttled (`aiPerMin`) but has **no per-user quota** and embeds N+1 texts per call (noted in the route header) — combined with no corpus cache, a large library makes each search a burst of embed calls.
- **Telemetry:** **UN-INSTRUMENTED.** No cost/latency/token/call-count recording; embedding spend is fully invisible. Same Lens-1 gap as [[creative-image-gen]] / [[creative-vision-score]].
- **Prompt/efficiency:** Texts truncated to 2000 chars (good). But the no-cache re-embed (above) is the dominant inefficiency.

## Findings
- (stub) code · **Re-embeds corpus every call** — precompute & persist pattern vectors on save; embed only the query at search time (`M×(N+1)` → `N+M`). Highest-yield efficiency fix here. Raised [[2026-06-20-run]].
- (stub) code · **No telemetry** — embedding cost/latency/call-count unrecorded.
- (stub) code · **One 429 = whole-batch downgrade** — a single parallel embed rejection silently drops semantic→substring; add per-call retry/backoff.
- (stub) value · 2000-char truncation + no global best-practice corpus (honest ceiling).
