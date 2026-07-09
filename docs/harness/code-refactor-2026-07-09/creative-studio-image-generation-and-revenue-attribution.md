# Creative Studio - Image Generation & Revenue Attribution

> Context #23 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 1, Low: 2)
> Files read: 15

## 1. The demo-hash reimplemented locally instead of importing the one module built to prevent exactly this

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/images/studio.ts:148-155`
- **Scenario**: `demoResult()`'s SVG placeholder path needs a deterministic per-prompt hash and defines its own FNV-1a `hash(s: string)` (`h = 2166136261; ... h = Math.imul(h, 16777619);`). But `src/lib/demo/prng.mjs` already exports the byte-identical algorithm as `hashStr(s)`, with a header that reads: *"Shared deterministic-demo primitives: the seeded PRNG + string hash every demo-data generator uses... One implementation instead of three copies, so the 'reproducible for a given seed' promise can't drift per surface."* `src/lib/campaigns/sample.ts` and `src/lib/keywords/sample.ts` both correctly `import { hashStr } from "@/lib/demo/prng.mjs"`, but `studio.ts` never adopted it — and two more copies exist outside this context (`src/lib/organic-channels/sample.ts:446`, `src/lib/project-data/seed.ts:9`, `src/lib/project-data/vary.ts:58`), so the "one implementation" promise has already drifted to at least five.
- **Root cause**: `studio.ts`'s demo fallback was written (or ported) without checking for the existing shared primitive; `.mjs` extension + the `@/` alias makes it easy to miss in a search for `.ts` helpers.
- **Impact**: The exact anti-drift guarantee `prng.mjs`'s own doc comment promises is already broken. Any future tweak to the hash (e.g. widening the seed space, fixing a distribution bias) has to be hunted down and applied in up to five places instead of one; `studio.ts`'s copy is functionally identical today but has no mechanism keeping it that way.
- **Fix sketch**: In `src/lib/images/studio.ts`, replace the local `hash()` function (lines 148-155) with `import { hashStr } from "@/lib/demo/prng.mjs";` and call `hashStr(...)` at its one call site (line 158, inside `demoSvg`). Delete the local function.

## 2. `rateImage` hand-rolls a third raw Gemini REST call, bypassing the wrapper's single-chokepoint gate

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/leonardo/rate.ts:8-11,41-69`
- **Scenario**: `rate.ts` builds its own `fetch(`${BASE}/models/${MODEL}:generateContent?key=...`)` call, with its own `BASE = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"` fallback and its own `candidates?.[...]?.content?.parts?.[...]?.text` extraction — the same shape `src/lib/llm/byom/adapters.ts:234-278`'s `runGemini` (BYOM path) already implements against the identical endpoint. Unlike both existing Gemini paths, `rate.ts` doesn't use `responseMimeType`/`responseSchema` for native structured output; it prompt-engineers "Odpověz POUZE tímto JSON (bez markdown)" and then defensively strips ` ```json` fences and falls back to a regex scrape of `"score": N` — a weaker, more fragile JSON-extraction path that the schema-based wrapper (`src/lib/llm/gemini.ts`) doesn't need. Because `rate.ts` uses raw `fetch` (not `new GoogleGenAI(...)`), `test-llm/callsites.mjs`'s `checkChokepoint()` — which enforces "provider SDKs... live ONLY in the wrapper" by grepping for `new GoogleGenAI\b` — cannot see this call at all, so the doctrine documented at the top of `gemini.ts` is silently unenforced for vision scoring.
- **Root cause**: `rate.ts` needs multimodal (image + text) input, which `runGemini()` in `gemini.ts` doesn't currently accept (it only takes a string `prompt`), so a raw REST call was written from scratch instead of extending the wrapper's Gemini path to accept image parts.
- **Impact**: A future change to Gemini's response envelope (e.g. a `candidates` shape change, or migrating the wrapper to a new SDK version) has two independent REST implementations to update, and this one has zero test coverage from the LLM gate's real-model suite (it's absent from `HASHED_FILES` and carries no `// llm-tool:` tag), so a break here would only surface as vision scores silently going null in production, not as a blocked commit.
- **Fix sketch**: Extend `runGemini()` in `src/lib/llm/gemini.ts` to accept an optional multimodal `parts` array (image + text) alongside the existing string-`prompt` path, using the same `responseSchema` machinery for the `{score, defects}` shape instead of prompt-engineered JSON. Have `rate.ts` call the extended wrapper function instead of its own `fetch`, deleting the local `BASE`/fence-stripping/regex-fallback logic.
- **Gate impact**: The fix sketch edits `src/lib/llm/gemini.ts`, one of `HASHED_FILES` in `scripts/llm-gate.mjs` — this forces a full real-model gate re-run (all 19 tools, ~a few minutes, live API calls) rather than the incremental per-tool path, since the wrapper core changed. If `rateImage` is routed through `generateStructured(...)`, it would also need a new `// llm-tool: <id>` tag and a `test-llm/registry.mjs` entry to keep coverage complete.

## 3. `creativeRoas` — the designated shared ROAS helper — has zero callers; `CreativeAttribution.tsx` recomputes the same ratio inline instead

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/images/attribution-types.ts:53-55`
- **Scenario**: `creativeRoas(m: CreativeMetrics): number { return safeRatio(m.convValue, m.cost); }` is exported specifically so callers don't reimplement the zero-division guard, but a repo-wide grep for `creativeRoas` turns up only this definition — nothing imports or calls it. Meanwhile `src/components/ai/CreativeAttribution.tsx:270-275` (which already imports `CreativeMetrics` from this same file) computes the identical per-link ROAS by hand: `l.metrics.cost > 0 ? fmt.fmtMultiple(l.metrics.convValue / l.metrics.cost) : "—"`. The style-leaderboard `StyleStat.roas` field a few lines above *does* flow through `creativeRoas` (via `styleLeaderboard`), so the one file ends up computing the same ratio through two different code paths.
- **Root cause**: `creativeRoas` was exported alongside `styleLeaderboard`/`deriveStylePrior` as the module's public per-record helper, but the per-link display row in `CreativeAttribution.tsx` was added later and reached for an inline expression instead of the sibling import.
- **Impact**: Today the two expressions agree (both are `safeRatio(convValue, cost)`), so nothing is visibly broken — but `creativeRoas` is unused dead weight from this module's perspective, and if its guard or rounding ever changes, the inline copy in `CreativeAttribution.tsx` silently diverges from the leaderboard's numbers on the same screen.
- **Fix sketch**: In `src/components/ai/CreativeAttribution.tsx`, add `creativeRoas` to the existing `import type { CreativeLink, CreativeMetrics, StyleStat, StylePrior } from "@/lib/images/attribution-types"` (as a value import, not `type`), and replace the inline ternary at line ~270-275 with `l.metrics.cost > 0 ? fmt.fmtMultiple(creativeRoas(l.metrics)) : "—"`. No change needed in `attribution-types.ts` itself — this makes its existing export actually used.

## 4. `cleanupGeneration` is exported to solve a stated problem that nothing currently triggers

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/lib/leonardo/client.ts:166-175`
- **Scenario**: `cleanupGeneration(generationId)` is documented as "Best-effort cloud cleanup so generations don't pile up on the account," but a repo-wide grep for `cleanupGeneration` finds only its own definition — no route, script, or cron calls it. `generateImageSet()` in `studio.ts:139-141` explicitly opts out of calling it ("intentionally left in the cloud... so a follow-up background-removal can reference the image by id"), which explains why it isn't wired into the happy path, but leaves the stated goal (bounded Leonardo account storage) with no caller anywhere — not even a delete-creative or session-end hook.
- **Root cause**: The function was written in anticipation of a cleanup path (e.g. triggered once background-removal is no longer needed for a generation) that was never built.
- **Impact**: Minor — this is API-account storage growth on Leonardo's side, not an app bug, and Leonardo's own generation history has its own retention. But as written the function is unreachable code that a reader has to evaluate and rule out on every pass through this file.
- **Fix sketch**: Either wire a real caller (e.g. call `cleanupGeneration` from `src/app/api/images/nobg/route.ts` once background removal succeeds and the original generation is no longer needed) or, if cleanup is intentionally deferred, delete the export and fold a one-line TODO into the `generateImageSet` comment that already explains the tradeoff at `studio.ts:139-141`.

## 5. Two independent mime→extension maps for the same image set, with a silent behavioral gap

- **Severity**: Low
- **Category**: duplication
- **File**: `src/lib/images/store.ts:14-20`
- **Scenario**: `store.ts`'s `extFor(mime)` (used to pick the Storage file suffix) checks png/jpeg/jpg/svg/webp and defaults to `"bin"`. `src/components/ai/CreativeStudio.tsx:155-157`'s `extOf(mime)` (used to name client-side downloads of the same generated images) checks only svg/jpeg and defaults everything else — including `webp` — to `"png"`. The two functions solve the same problem for the same data (a Creative Studio image's mime type) but were written independently and have already diverged on the webp case.
- **Root cause**: One is a server helper for the Storage path, the other a client helper for the download `<a download>` filename; each was added locally to its own file rather than reaching for a shared one.
- **Impact**: Currently harmless — `generateCandidates`/`demoSvg` only ever produce `image/png` or `image/svg+xml`, so the webp branch is unreachable in practice today. But it's a live trap: if a future Leonardo model or a background-removal variation ever returns `image/webp` (Leonardo's `nobg` endpoint already returns PNG today, but that's a provider choice, not a contract), the downloaded filename would silently claim `.png` for webp bytes.
- **Fix sketch**: Add a single `imageExtFor(mime: string): string` to `src/lib/images/types.ts` (already framework-free, zero I/O, and already imported by both server code and the UI per its own header). Give it the more complete `store.ts` branch set (including webp) plus store.ts's `"bin"` fallback for the server path; have `CreativeStudio.tsx` call it directly for the download name (a `"bin"` fallback is a harmless filename suffix client-side too). Delete both local copies.
- **Build risk**: Low — `types.ts` is already imported directly by the client component `CreativeStudio.tsx` today (it imports `MAX_IMAGE_CANDIDATES`/`ImageStyle` etc. from the same file) and has no server-only imports of its own, so adding a pure string function to it does not cross the client/server boundary.
