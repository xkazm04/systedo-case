# L1 (theoretical) certification — Eva × brief-to-publishable-draft

**Level:** L1 — reasoned over the **code surface model**, no browser. **Method:** build the affordances/inputs/flow/grounding from code, then walk the journey in-character against the 7 rubric dimensions + Eva's scored criteria.

## Surface model (from code — what Eva *can* see and do)
- Entry `/ai-asistent` → `AiAssistant.tsx`: a `role="tablist"` with tabs incl. **"Obsahový brief"** (`AiAssistant.tsx:28`). Tab switch is client state — instant, no nav. ✓ affordance present.
- Brief tool `ContentBriefGenerator.tsx`: form inputs **Téma / Hlavní klíčové slovo / Cílová skupina** + **Typ obsahu** buttons + **"Vyplnit ukázku"** (prefill) + submit **"Vytvořit brief"** (`:250–336`). On done: `ResultMeta`, **export .md**, **`SerpPreview`** + **`Scorecard`** + SEO metadata + outline + FAQ + keywords + internal links + rationale (`:356–`), then **`ArticleDraftPanel`** (`:464`).
- Generation `ai/tools/brief.ts`: `BRIEF_SYSTEM` + `buildBriefPrompt` ground the model in topic/keyword/audience (+ optional keyword-planner volumes); `BRIEF_SCHEMA` forces title/meta within SEO limits, 5–7 H2 outline, FAQ, 8 keywords, internal links. Prompt **requires the primary keyword in title, meta AND the first H2** (`:19,52`).
- Draft `ArticleDraftPanel.tsx`: **"Rozepsat článek"** → `useAiTool("article-draft")` → renders the draft with the same `ArticleBody` as `/clanek`, with **preview/JSON toggle + export .md/.json** (`:146–238`). → **the loop closes in code.**
- Quality oracle `content/seo-score.ts:scoreBrief`: scores keyword-in-title/meta/first-section, readability, E-E-A-T.
- Lifecycle `useAiTool.ts`: aborts at `AI_TIMEOUT_MS` = **dev `CLAUDE_TIMEOUT_MS+30` (180s)** / prod 60s.

## In-character walkthrough (theoretical)
1. **Find the tool** — tab "Obsahový brief" is right there. *Knows what to do.* ✓
2. **Fill it** — three plain inputs + a "Vyplnit ukázku" shortcut. Low effort, clear. ✓
3. **Generate brief** — one click. The prompt is grounded + the schema is structured + keyword placement is *required in code* → the brief will have the right shape and keyword coverage **by construction**. (senior-quality, *designed*: plausible. time-saved, *designed*: one form + one call vs ~45–60 min by hand. ✓)
4. **Judge before committing** — SERP preview + scorecard + metadata are all present. ✓
5. **Close the loop** — "Rozepsat článek" is wired to a real generator that renders a publishable article + exports. **Structurally, brief → publishable draft completes.** ✓

## L1 findings

| id | cert | dimension | sev | finding | code_check |
|----|------|-----------|-----|---------|------------|
| EvL1-1 | L1 | time-saved | major | The dev abort ceiling is **180s** and the article-draft is a *large* structured generation on a slow dev provider — the design carries a real long-wait / borderline-timeout risk. The exact latency is **unverifiable at L1** (→ L2). | present (`useAiTool.ts` ceiling const + draft schema size) |
| EvL1-2 | L1 | senior-quality | — | The brief's structure, grounding and keyword placement are *guaranteed by the prompt + schema*, so the **designed** output is senior-shaped. But actual prose quality / brand-specificity / factual correctness is **not decidable from code** (→ L2). | n-a (needs live output) |

**L1 verdict: `L1-pass` (structurally sound).** The brief→draft loop is fully wired in code, the design supports time-saved, and the generation is built for senior-grade structure. Two items are explicitly handed to L2 (actual latency; actual prose quality).

> **Retrospective value check (the point of L1):** had we run L1 on the code *before* the fixes, it would have caught — with **no browser** — both of this journey's real defects:
> - **EV2** (brief failed its own scorecard): L1 cross-reads `brief.ts` (generation prompt) against `seo-score.ts` (scorecard) and sees the prompt never required the keyword in meta/first-section that the scorecard grades → *predicted scorecard failures*. A pure code-level inconsistency, L1-catchable.
> - **EV1** (loop blocked by a 60s abort): L1 reads `AI_TIMEOUT_MS = 60_000` against a heavy draft generation on a slow dev provider → *predicted timeout risk*. The exact 126s needed L2; the **risk** was visible in code.
> So L1 would have flagged the structural essence of both — cheaply, in parallel — and L2's job would have been to confirm magnitude. That's the cheap-filter value.

## Honest character feedback (Eva, first-person — prototype of the multi-dimensional concept)
*"Look, I've used a dozen of these. What I like here, on paper: it doesn't dump a wall of text on me — it gives me a brief I can judge (the search preview is the bit most tools skip), and it actually carries through to a draft instead of stranding me at an outline. That respects how I work. What I can't tell without using it: whether the prose sounds like me or like every other AI — that's the whole game, and a schema can't promise it. And I'm wary of the wait; if 'Rozepsat článek' makes me sit for two minutes and hands me something I'd rewrite anyway, I was faster in Google Docs. Trust-wise, I appreciate that it shows me its own scorecard and the prompt — most tools hide that. Would I adopt it? On this evidence: I'd try it for one real article and judge it by whether that first draft was publishable with light edits. If yes, it saves me an afternoon a week. If no, it's a toy with a nice preview."*

— Dimensions this surfaces beyond pass/fail: **craft-identity** (does it sound like her), **patience economics** (wait vs payoff), **transparency-as-trust**, **conditional adoption** (try-once, judge-by-output). These are richer than a finding table and only emerge when the Character speaks.
