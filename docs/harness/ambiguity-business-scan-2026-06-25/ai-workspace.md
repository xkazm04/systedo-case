# AI Assistant Workspace — Ambiguity + Business scan
> Context: Tabbed AI workspace hosting the marketing tools, with shared form/result primitives, a copy-prompt transparency panel, and a request-lifecycle hook with an animated loading timer + env-aware timeout.
> Files analyzed: 5
> Total findings: 5

## 1. Timeout e2e test (and live-result waits) assume a dead 60s ceiling; the dev ceiling is now 180s
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: tests/ai-asistent.spec.ts:14-16, 115-130 (also useAiTool.ts:35-36, playwright.config:18,27)
- **Problem/Opportunity**: The suite runs under `npx next dev` (playwright.config:27), so `NODE_ENV !== "production"` and `AI_TIMEOUT_MS = CLAUDE_TIMEOUT_MS (150_000) + 30_000 = 180_000ms` (useAiTool.ts:35-36). But the "timeout illustration" test waits only `70_000ms` for `ai-timeout` (spec:127), the per-test cap is `100_000ms` (config:18), and `RESULT_TIMEOUT = 65_000` (spec:16). The comments still say "the app aborts at 60s". The abort now fires at 180s, so this test cannot reach the timeout state, and a genuine dev-Claude run ("routinely 50–90s") can blow past the 65s live-result wait.
- **Why it matters**: A case-study app whose entire pitch is "kontrola limitů / controls" ships an e2e suite that silently can't pass its own timeout/latency assertions — exactly the behavior it's demonstrating.
- **Fix sketch**: Derive the test waits from the real constant instead of a stale literal — import `AI_TIMEOUT_MS`/`AI_TIMEOUT_SECONDS` (or read `CLAUDE_TIMEOUT_MS`) and set `RESULT_TIMEOUT` and the `ai-timeout` wait + per-test `timeout` above `AI_TIMEOUT_MS`; OR have the timeout test force a short ceiling. Update the three stale "60s" comments (spec:14-16, config:16-18). Not gate-triggering (test/config only).

## 2. The marketed "copy-prompt" transparency panel has no copy button
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/components/ai/primitives.tsx:248-271 (CopyButton already exists at 95-119; unused `copyAll` key at T:27)
- **Problem/Opportunity**: `PromptDisclosure` renders the exact prompt in a `<pre>` but offers no one-click copy — users must hand-select multi-line monospace text. The context is literally described as a "copy-prompt transparency panel," and a ready `CopyButton` primitive sits in the same file.
- **Why it matters**: The transparency angle is a selling point ("strukturovaný výstup / doménová pravidla v promptu", page.tsx:13-34); letting prospects copy and reuse the engineered prompt turns a passive demo into a takeaway, reinforcing the craftsmanship story at near-zero cost.
- **Fix sketch**: In `PromptDisclosure`, add `<CopyButton text={prompt} label={t("copyAll")} />` (or a dedicated "Kopírovat prompt" label) in the header row next to the show/hide toggle. Pure UI primitive edit; not gate-triggering.

## 3. `reset()` can't abort an in-flight request, so a late response clobbers the cleared state
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/components/ai/useAiTool.ts:73-124
- **Problem/Opportunity**: The `AbortController` is local to `run()` (line 78) and never stored, so `reset()` (114-124) only flips state to idle — it cannot cancel the live fetch. With a 180s dev ceiling and all tools staying mounted (AiAssistant.tsx:125-127), a user who resets/retries can have the original request resolve later and overwrite the cleared/newer result via `setData`/`setStatus("done")` (94-95). There's also no double-submit guard at the hook level and no user-facing "Cancel" during a long generation.
- **Why it matters**: A stale response silently repopulating the panel (or two overlapping runs racing to "win") produces confusing, non-deterministic UI on exactly the slow dev path the timeout machinery was built for.
- **Fix sketch**: Hold the controller in a ref, abort it in `reset()` and at the top of a new `run()`, and tag each run with a sequence id so only the latest run's resolution may call `setData`/`setStatus`. Optionally early-return from `run()` when `status === "loading"`. Hook-only change; not gate-triggering.

## 4. Only the *last* result per tool is kept — no generation history or export
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: src/components/ai/useAiTool.ts:23-24, 96-97
- **Problem/Opportunity**: `resultKey(mode)` stores a single result that each new run overwrites (line 97); there's no list of past generations and no download/export (only an in-memory `copyAll`). Marketers iterate — they want to compare yesterday's ad set vs today's and hand a file to a client. (Keyword/ad-variant saving exists via SavedKeywordLists/AdExperiments, but briefs/analysis have nothing.)
- **Why it matters**: "History of generations + save/export" is the canonical retention hook for generative tools; it converts a one-shot demo into something a user returns to, and demonstrates product thinking beyond a single API call.
- **Fix sketch**: Promote the localStorage value to a small capped ring (e.g. last 10 per mode) with timestamps; render a compact "recent generations" strip that re-loads a past result, plus a Markdown/CSV download built from the already-typed result. Realism: keep it free (portfolio app) — flag any "Pro history" paywall as hypothetical, not built. Client-only; not gate-triggering.

## 5. Restored results look freshly generated and aren't schema-validated
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/components/ai/useAiTool.ts:58-71 (renders via primitives.tsx ResultMeta:174-245)
- **Problem/Opportunity**: On mount the hook rehydrates from localStorage and sets `status: "done"` with no "from a previous session" marker — the panel shows the same "Vygenerováno modelem · X s" badge (primitives.tsx:196-199) as a live run, so users can't tell a result is stale. The restore also does `JSON.parse(raw) as AiResponse<T>` with zero shape/version check (lines 61-62); after any deploy that changes `AiResponse`/result shapes, parse still succeeds and the UI renders against missing fields.
- **Why it matters**: Trust hinges on knowing what's live vs cached, and an unversioned blind cast turns a routine schema change into a render crash from week-old stored data — a silent edge case the happy path ignores.
- **Fix sketch**: Persist a small wrapper `{ v: SCHEMA_VERSION, savedAt, payload }`; on restore, drop entries whose `v` mismatches and surface "from earlier" by feeding `savedAt` into `ResultMeta`'s existing optional `createdAt` relative-time pill (primitives.tsx:200-205). Client-only; not gate-triggering.
