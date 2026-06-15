# Feature + Moonshot Scan — AI Assistant Workspace

> Context: ctx_1781547850538_baysbo0
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Persist generated results into a per-tool run history (and wire up the already-built `createdAt` stamp)

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **File**: `src/components/ai/useAiTool.ts:run` + `src/components/ai/primitives.tsx:ResultMeta`
- **Scenario**: A user generates ad sets, content briefs and an analysis, switches tabs (state survives — `AiAssistant.tsx` keeps all three panels mounted), then reloads or comes back later. Everything is gone. There is no record that a generation ever happened, even though it cost a real model call and 15–18s of waiting.
- **Opportunity**: Add lightweight client-side persistence keyed by tool mode. On every successful `run`, push `{ payload, response, createdAt: new Date().toISOString() }` into a capped (e.g. last 10) `localStorage` ring per mode. Surface a compact "Poslední výstupy" history strip above each tool's result area; clicking an entry rehydrates the result (and the form) without a new model call. Crucially, this finally feeds the `createdAt` prop that `ResultMeta` already renders (`fmtRelative`/`fmtDateTime`, lines 133–138) but which no tool currently passes — a built-but-unwired primitive.
- **Impact**: Turns three one-shot generators into a real workspace. Removes wasted re-runs, lets users compare iterations, and demonstrates state/persistence discipline — exactly the "demo vs. production" narrative the page's own "Jak je nástroj postavený" section sells.
- **Implementation sketch**: New `src/lib/ai-history.ts` (read/write/append/cap helpers over `localStorage`, SSR-guarded). Extend `useAiTool` to accept an `onStored` callback or append on `setStatus("done")`. Add a `<RunHistory mode={mode} onPick={...} />` primitive in `primitives.tsx`; render it in `AdGenerator`/`ContentBriefGenerator`/`PerformanceAnalyst` and pass `createdAt` into `ResultMeta`.

## 2. Shareable result permalinks (encode the run, deep-link back into the workspace)

- **Severity**: High
- **Lens**: feature-scout
- **Category**: integration
- **File**: `src/app/ai-asistent/page.tsx` + `src/components/ai/AiAssistant.tsx:tab` + `src/components/ai/primitives.tsx:ResultMeta`
- **Scenario**: Each tool already assembles a `copyAllText` blob (`AdGenerator.tsx:190`), but the only way to share an output is to paste raw text into Slack/e-mail. For a portfolio/job-application case study, the high-value action is "send a reviewer a link that shows exactly this generated result, on this page."
- **Opportunity**: Add a "Sdílet odkaz" action next to "Kopírovat vše" in `ResultMeta`. Encode `{ mode, payload, result, meta }` into a URL fragment (base64 of compact JSON, kept in the hash so it never hits the server) plus a `?tool=` query param read by `AiAssistant` to open the right tab. On load, if a payload hash is present, hydrate the matching tool in a read-only "shared result" state — no model call, a small "sdílený výstup" badge.
- **Impact**: Converts every generation into a portable artifact the recruiter/reviewer can open with one click and see verbatim. Strong network/virality lever for a showcase app and a clean demonstration of stateless deep-linking.
- **Implementation sketch**: New `src/lib/ai-share.ts` (encode/decode + size guard, fall back to history-id link if too large). Lift `tab` in `AiAssistant` to read an initial value from `useSearchParams`. Add `ShareButton` to `primitives.tsx`; on shared-hydrate, render results through the existing `done` branch with `run`/`reset` disabled.

## 3. A reusable prompt library: save, name and re-run input presets per tool

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: feature
- **File**: `src/components/ai/AdGenerator.tsx:EXAMPLE` + `src/components/ai/primitives.tsx`
- **Scenario**: Today each tool has exactly one hardcoded "Vyplnit ukázku" preset (`EXAMPLE` in `AdGenerator.tsx:159`, with siblings in the brief/analysis tools). A power user running ads for several products has to retype the whole campaign brief every time; there is no way to keep a set of frequently used inputs.
- **Opportunity**: Generalize the single example into a small preset library. Keep the shipped demo preset, but let users "Uložit zadání" (save current form as a named preset) and pick from a dropdown of saved + built-in presets. Stored in `localStorage` per mode, mirroring idea #1's storage layer. Combined with the prompt transparency panel, this becomes a genuine prompt-management surface.
- **Impact**: Removes the biggest repeat-friction in the workspace and showcases product thinking (presets/templates) without any backend. Naturally complements the history feature — presets are "inputs I want again," history is "outputs I already got."
- **Implementation sketch**: New `src/lib/ai-presets.ts` (per-mode named records + built-in seeds). Add a `<PresetPicker mode={mode} value={form} onApply={setForm} />` primitive. Replace the lone "Vyplnit ukázku" button in all three tools with the picker (built-in demo stays as the first entry).

## 4. Stream the model response token-by-token through the request-lifecycle hook

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: functionality
- **File**: `src/components/ai/useAiTool.ts:run` + `src/app/api/ai/route.ts:POST` + `src/components/ai/primitives.tsx:LoadingTimer`
- **Scenario**: The hook currently does one `fetch` → `await res.json()` → render-all (`useAiTool.ts:34–47`), and the user stares at the `LoadingTimer` ring (target 18s, hard ceiling 60s) with zero feedback until the entire structured object lands. For an LLM-wrapper showcase, a blank 15-second wait is the weakest moment of the whole page.
- **Opportunity**: Move to incremental delivery. The structured-JSON contract makes full token streaming tricky, but two strong paths exist: (a) stream partial JSON and progressively reveal completed fields (headlines first, then descriptions, then keywords), or (b) emit Server-Sent "stage" events ("Analyzuji zadání" → "Generuji nadpisy" → "Kontroluji limity") that drive a real progress narrative instead of a fake timer. Either way, the ring gains a meaningful progress source rather than wall-clock estimate.
- **Impact**: Transforms the marquee interaction from "loading spinner" to "watch it think," dramatically improving perceived performance and credibility — the single highest-leverage upgrade for a page whose entire point is demonstrating production-grade LLM integration.
- **Implementation sketch**: Make `route.ts` return a `ReadableStream` (SSE) when an `Accept: text/event-stream` / `?stream=1` flag is set; keep the JSON path for tests/back-compat. Add `runStreaming` to `useAiTool` using `fetch` + `getReader()`, exposing a `progress`/`stage` value alongside `status`. Wire `stage` into `LoadingTimer` so the ring/copy reflect real stages. Guard with the existing `AbortController` ceiling.

## 5. Cross-tool workflow chaining: "Continue with…" handoffs between the three tools

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: automation
- **File**: `src/components/ai/AiAssistant.tsx:tab` + `src/components/ai/AdGenerator.tsx` (+ brief/analysis tools)
- **Scenario**: The three tools sit side-by-side as isolated tabs (`AiAssistant.tsx:TABS`) with no relationship, even though they are obvious stages of one marketing workflow: analyze performance → brief content for the weak area → generate ads for it. A user must manually re-type product/keyword/audience context into each tool, and the model never sees what the previous stage produced.
- **Opportunity**: Add contextual "Pokračovat v…" handoffs that carry structured output forward as the next tool's input. From an Analysis result's recommended action → prefill a Content Brief (topic/keyword/audience derived from the action). From a Brief's primary keyword + H1 → prefill the Ad Generator's product/benefits/audience. `AiAssistant` switches tabs and seeds the target tool's form via a shared transfer object; the receiving tool shows a "převzato z…" provenance chip. This is the seed of an agentic marketing pipeline built entirely from primitives already on the page.
- **Impact**: Reframes the workspace from "three calculators" into a guided, compounding marketing workflow — the category-defining move for the product. Each tool's output makes the next call smarter, creating a force-multiplier the competing single-prompt tools can't match, and it tells a far stronger product story than three independent demos.
- **Implementation sketch**: Add a `pendingTransfer` state in `AiAssistant` plus a `setTab` exposed to children (lift via context or props). Define `src/lib/ai-handoff.ts` mapping each source result → target form shape (e.g. `analysisActionToBrief`, `briefToAdRequest`). Add a "Pokračovat" button in each tool's result footer that calls the mapper, sets `pendingTransfer`, and switches tabs; the target tool consumes the transfer into its `form` and renders a provenance chip.
