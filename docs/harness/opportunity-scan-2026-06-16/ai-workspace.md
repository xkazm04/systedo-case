# AI Assistant Workspace — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Results evaporate on refresh — add per-tool run history & persistence
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/components/ai/useAiTool.ts, src/components/ai/AdGenerator.tsx, PerformanceAnalyst.tsx, ContentBriefGenerator.tsx
- **Opportunity**: `useAiTool` keeps `data` only in `useState`; a refresh or even a second run throws away every prior generation. There is no history, no "previous results" list, no recall. Yet the codebase already proves the pattern exists for Tool 4: `CampaignReport` + `ReportHistoryPoint` (with `createdAt`) are persisted and rendered, and `ResultMeta` already accepts a `createdAt` "generated X ago" stamp that the three workspace tools never pass.
- **Value**: An agency user generates 5–10 ad variants per campaign and compares them; losing all but the latest is the single biggest friction in a "tool I'd actually use daily." Persisted history is also the spine for every other feature here (favorites, refine, export). For a case-study/portfolio app it demonstrates real product thinking, not a one-shot demo.
- **Effort**: M
- **Fix sketch**: Have `useAiTool` push each successful `AiResponse<T>` into a `history` array keyed by `mode`, mirrored to `localStorage` (and optionally the existing SQLite report layer for parity with Tool 4). Render a compact history rail reusing `ResultMeta` with its existing `createdAt`/`fmtRelative` stamp so users can reopen any past run.

## 2. No "refine / regenerate" loop — every run starts from a blank slate
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/components/ai/AdGenerator.tsx, ContentBriefGenerator.tsx, src/components/ai/useAiTool.ts
- **Opportunity**: Once a result lands there is no way to say "more aggressive tone", "shorter headlines", "regenerate just the keywords", or "give me 5 more". The only path is to hand-edit the form and re-run the whole prompt. `AdResult`/`BriefResult` are richly sub-sectioned (headlines, descriptions, callouts, keywords) but regeneration is all-or-nothing, and the `AdStrengthMeter` already tells the user *what's missing* ("would push toward Excellent") without offering a one-click way to act on it.
- **Value**: Iterative refinement is the core loop of real AI copy tools (Jasper, Copy.ai) and the difference between a toy and a workflow. Wiring the strength meter's gaps to a "Vylepšit" button turns passive feedback into an action and dramatically lifts perceived intelligence and time-to-value.
- **Effort**: M
- **Fix sketch**: Add a `refine(instruction)` to `useAiTool` that re-POSTs `/api/ai` with the prior `result` + a delta instruction, plus per-`Group` "Generovat víc" / "Přepsat" buttons. Drive a one-click "Vylepšit na Excellent" from the `computeAdStrength` factors whose `status !== "pass"`.

## 3. Output is copy-only — add export & shareable links for client deliverables
- **Severity**: High
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/components/ai/primitives.tsx (CopyButton/ResultMeta), AdGenerator.tsx, PerformanceAnalyst.tsx
- **Opportunity**: The only egress is `CopyButton` / "Kopírovat vše" producing a plain-text blob. There is no CSV/XLSX of headlines+counts for bulk Google Ads upload, no PDF/Markdown of the analysis, and no shareable link. An agency's actual job is handing structured output to a client or pasting it into Google Ads Editor — neither is supported.
- **Value**: Export is where this stops being a demo and becomes billable agency infrastructure, and a shareable read-only result link is an organic growth/virality channel (every shared report carries the product's brand to a prospect). It's also the most credible monetization wedge: gated export/branded PDF is a natural paid tier.
- **Effort**: M
- **Fix sketch**: Add an "Export" control next to `ResultMeta`'s copy-all: CSV for `AdResult` rows (text + char count + over-limit flag), Markdown/PDF for `AnalysisResult`/`BriefResult`. Pair with #1's persistence to mint a `/ai-asistent/r/[id]` read-only share route rendering the stored `AiResponse`.

## 4. No prompt presets / saved campaign profiles — re-typing the same brand every time
- **Severity**: Medium
- **Lens**: Both
- **Category**: feature
- **File**: src/components/ai/AdGenerator.tsx (EXAMPLE/EMPTY, form state), ContentBriefGenerator.tsx
- **Opportunity**: There is exactly one hardcoded `EXAMPLE` ("Kešu ořechy") and an `EMPTY`. A real user runs the ad tool repeatedly for the *same* product/audience/brand voice and must re-enter `product`/`benefits`/`audience`/`tone` each time. No saved profiles, no favorites, no industry preset library.
- **Value**: Saved profiles are the retention hook — they make the second and third visit faster than the first, which is exactly what converts a tried-once demo into a habitual tool. A small library of CZ-market presets (e-shop, B2B služby, lokální podnik) also showcases domain depth to the case-study audience.
- **Effort**: S
- **Fix sketch**: Persist named form profiles to `localStorage` (reuse the `AdRequest`/`BriefRequest` shapes) with a "Uložit zadání" / preset dropdown beside the existing "Vyplnit ukázku" link, plus a starter set of 3–4 CZ industry presets.

## 5. Three siloed tabs — no multi-tool workflow chaining the marketing pillars
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: differentiation
- **File**: src/components/ai/AiAssistant.tsx, PerformanceAnalyst.tsx, AdGenerator.tsx
- **Opportunity**: The three tools map to Systedo's pillars (Analýzy → Reklama → Obsah) and all stay mounted with preserved state, but they never talk to each other. The `PerformanceAnalyst` surfaces `actions` ("zvyš rozpočet na kategorii X") and the `BriefResult` yields a topic/keyword — yet there is no "vytvořit inzerát z tohoto doporučení" or "napsat brief k tomuto klíčovému slovu" handoff. The natural agency funnel is hardcoded into the tab labels but not wired.
- **Value**: Cross-tool handoffs are the headline differentiator that turns three commodity generators into one connected "campaign workflow," which is precisely the story a portfolio/case-study app should tell. It also deepens engagement (more runs per session) and is genuinely hard for single-purpose competitors to copy.
- **Effort**: M
- **Fix sketch**: Lift the active-tab + a small handoff payload into `AiAssistant`; add "Vytvořit inzerát" on an analysis `action` and "Napsat brief" on a keyword that switch tabs and prefill the target tool's form (`AdRequest`/`BriefRequest`) from the source result.
