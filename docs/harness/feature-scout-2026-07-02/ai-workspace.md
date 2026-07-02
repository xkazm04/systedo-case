# Feature Scout — AI Assistant Workspace (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/app/ai-asistent/page.tsx, src/components/ai/AiAssistant.tsx, src/components/ai/primitives.tsx, src/components/ai/useAiTool.ts, tests/ai-asistent.spec.ts

## 1. Hand the finished brief to the PPC ad generator (brief → ads handoff)
- **Impact**: 8/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: integration
- **File**: `src/components/ai/AiAssistant.tsx:75`
- **Opportunity**: The workspace already chains keywords → brief (`handleCreateBrief` seed + nonce + tab switch) and brief → article draft (`ArticleDraftPanel`), but the loop never reaches the ads tool: a marketer who just produced a keyword-grounded brief must retype the topic/audience into the PPC form by hand. Everything an `AdRequest` needs already exists on the brief side (`topic`, `audience`, keywords, outline points as benefits).
- **Why valuable**: Completes the research → content → performance loop that is the page's whole pitch ("Výzkum předává klíčová slova rovnou do briefu…") — one input now yields brief + article + ad set, which is exactly the workflow multiplication a prospect evaluating the agency wants to see.
- **Build sketch**: Mirror the existing pattern verbatim: add `adSeed`/`adNonce` state in `AiAssistant`, remount `AdGenerator` with `key={`ads-${adNonce}`}` and a new optional `seed?: Partial<AdRequest>` prop applied via lazy `useState` init (same as `ContentBriefGenerator.tsx:304`). In `ContentBriefGenerator`'s result action row (next to the "Stáhnout .md" button, ~line 483) add "Vytvořit inzeráty z briefu" that maps `product ← form.topic`, `audience ← form.audience`, `benefits ← r.outline.flatMap(points)`/`r.keywords` joined, then switches to the ads tab. No new LLM tool — reuses the existing `ads` mode; not gate-triggering.

## 2. Deep-link the active tool via a `?tool=` URL param
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/ai/AiAssistant.tsx:65`
- **Opportunity**: The active tab is plain `useState<TabId>("ads")` — a refresh always lands on PPC ads, and there is no way to share/bookmark a link straight to the brief, keyword or creative tool. Results already survive refresh (localStorage restore in `useAiTool.ts:73`), but the user is dumped back on the wrong tab to see them.
- **Why valuable**: A shareable "look at the keyword tool" link is the cheapest distribution feature for a case-study site (the owner sends prospects directly to a specific tool), and refresh keeping your place removes a small recurring annoyance the persisted results made visible.
- **Build sketch**: On mount, read `window.location.search` in an effect (the codebase's established `// eslint-disable-next-line react-hooks/set-state-in-effect` restore pattern, `useAiTool.ts:91` precedent — avoids a hydration mismatch and the `useSearchParams` Suspense requirement); validate against `TABS` ids before applying. On tab change, `history.replaceState` the `?tool=` param (no router churn, page is a server component and stays untouched). Extension: the dashboard's analysis CTA can then link `/ai-asistent?tool=analysis`. Add one e2e case navigating to `/ai-asistent?tool=brief`.

## 3. Persist each tool's form draft the way results already persist
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/ai/useAiTool.ts:54`
- **Opportunity**: `useAiTool` persists the *result* per tool (`systedo.ai.result.<mode>`, versioned), but the form inputs that produced it are volatile React state (`AdGenerator.tsx:302`, `ContentBriefGenerator.tsx:304`). After a refresh the panel shows a restored result next to an *empty* form — the user can't tweak-and-regenerate, and half-typed campaign briefs are lost to a stray reload.
- **Why valuable**: Symmetric persistence ("what I typed" + "what I got") makes the workspace feel like a real tool instead of a demo, and directly protects the multi-field forms (5 fields in the ad generator) that take the longest to fill.
- **Build sketch**: Add a small `usePersistedForm<T>(key, initial)` hook next to `useAiTool` reusing its exact conventions: effect-based restore with the eslint suppression (hydration-safe), versioned wrapper like `RESULT_SCHEMA_VERSION` (`useAiTool.ts:28`), write-through on change, try/catch around storage. Wire into `AdGenerator`, `ContentBriefGenerator` (seed from the keyword handoff must win over the stored draft — lazy-init order handles it) and `PerformanceAnalyst`'s `period`. Clear the draft in the tool's reset path.

## 4. Prove the keyless render path in e2e with a fixture response (and cover all five tabs)
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: functionality
- **File**: `tests/ai-asistent.spec.ts:37`
- **Opportunity**: Every result-rendering assertion is `test.skip(!HAS_KEY)` — without `GEMINI_API_KEY` only the structural + timeout tests run, so the entire result UI (TextRow counters, AdStrengthMeter, RsaPreview, demo pill, PromptDisclosure) is unverified in a keyless CI. Meanwhile the page's marquee claim is "Funguje i bez klíče". The tab smoke test is also stale: it asserts "the three Systedo tool tabs" while the workspace now has five (keywords and creative are never touched by the suite).
- **Why valuable**: Deterministic, seconds-fast coverage of the exact UI a prospect sees, on every run instead of only when someone supplies a paid key — this is the suite's biggest blind spot and costs no product code.
- **Build sketch**: Use `page.route("**/api/ai", route => route.fulfill({ json: FIXTURE }))` with a typed `AiResponse<AdResult>` fixture (`meta.demo: true`) — the same interception seam the timeout test already uses (`spec:125`). Assert headlines/`/30` counters, `ad-strength`, `rsa-preview`, the "Ukázkový režim" pill and the prompt disclosure. Update the tab test to five tabs and add structural assertions for the keywords + creative panels. Test-only file — not in the gate's HASHED_FILES, no build implications.

## 5. Make the tool tabs a real WAI-ARIA tablist (keyboard + panel wiring)
- **Impact**: 5/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/ai/AiAssistant.tsx:84`
- **Opportunity**: The tab strip declares `role="tablist"`/`role="tab"`/`aria-selected` but implements none of the behavior those roles promise: no arrow-key navigation, no roving `tabIndex`, no `aria-controls`/`id` pairing, and the panel wrappers (`data-testid="tool-*"`) lack `role="tabpanel"`/`aria-labelledby`. Screen-reader and keyboard users get announced "tab 1 of 5" and then find that arrow keys do nothing.
- **Why valuable**: Half-implemented ARIA is worse than none — it sets expectations it breaks. For a portfolio app selling engineering craft, matching the APG tabs pattern is a visible quality signal and a genuine usability win for keyboard users on a five-tab workspace.
- **Build sketch**: In the `TABS.map` render add roving `tabIndex={active ? 0 : -1}`, an `onKeyDown` on the tablist handling ArrowLeft/ArrowRight/Home/End (move focus + select, wrapping), and `id={`ai-tab-${id}`}`/`aria-controls={`tool-${id}`}`; on each panel div add `role="tabpanel"`, `id`, `aria-labelledby` and `hidden`-consistent semantics. Single-file client edit; add one e2e keyboard-navigation case. Run `next build` per the client-component rule.
