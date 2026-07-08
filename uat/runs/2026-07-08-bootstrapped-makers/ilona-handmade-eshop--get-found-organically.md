# UAT L1 — Ilona (handmade e-shop maker) · Journey: "Get found organically"

- **Character:** Ilona — one-person handmade maker, marketing/analytics novice, hates jargon, tiny budget, no ad account.
- **Surface:** `eshop` (demo-eshop = "Mionelo", nuts/seeds/superfoods catalog)
- **Cert level:** L1 (theoretical, code-grounded, no browser)
- **Journey:** `uat/journeys/get-found-organically.md`
- **Date:** 2026-07-08

---

## Ilona's review (in her voice)

I don't have money for ads, so "get found in search for free" is the dream. I found **Klíčová slova** in the sidebar and it's friendlier than I feared. I type "ořechy", hit **"Najít klíčová slova"**, and it gives me a list of related searches, each with a little **"Příležitost"** (opportunity) score and a bar. That's the one thing I actually needed — *which words are worth my time* — and it's shown as a plain score, not a spreadsheet. It even prefills an example so I'm not staring at an empty box. Good.

What I glaze over: next to each word it shows "CPC 3–7 Kč" and the footer talks about the "Google Ads Keyword Planner." I don't run ads, so bid prices mean nothing to me and make me wonder if this tool is even for people like me. And there's a **"Seskupit do klastrů"** button that makes "pillar pages" and "supporting keywords" — I *think* that means "one big post and a few smaller ones"? but nobody told me that in my words.

The nice part: I can tick a couple of words and hit **"Vytvořit brief"** and it whisks me over to the **Obsahový engine** with my topic already filled in, ready to draft an article. So the path from "which words" to "here's a draft" does exist, and it seems to know it's my shop. Whether the draft actually sounds like me — I'd have to see it. But structurally, yes, I could get from "I need to be found" to "here's a post to publish" without touching an ad account or a budget. That's the promise, and the skeleton is there. It just keeps sprinkling in words (CPC, pillar, brief, intent) that make me feel like I wandered into an SEO agency.

---

## Reachability check (eshop)

- `klicova-slova` — availableFor `ALL` (`src/lib/projects/modules.ts:90`) ✓
- `obsahovy-engine` — availableFor `ALL` (`modules.ts:100`) ✓ — the brief/draft handoff target

Both entry points resolve for `eshop`. **Reachability: pass.**

## Grounding audit (per AI surface)

| Surface | Real context reaches prompt? | Score |
|---|---|---|
| Keyword research (`/api/keywords`) | Seed + optional URL only — **no catalog/project grounding** passed (`KeywordResearch.tsx:168-172`, `route.ts:31-47`). She supplies the seed, so it's grounded in what she types, not in her shop | **1/2** |
| Brief / draft (Obsahový engine) | `projectId` carried on the handoff (`ContentEngine.tsx:221`), so brief/draft can pull the project's brand context | **grounded (design)** |

**Journey grounding: adequate — the keyword tool is seed-driven (fine for a tool she seeds herself), and the draft is project-grounded by design.**

## Jargon / ease audit

- **Good:** the decision she came for — *which queries are worth it* — is surfaced as a plain **"Příležitost" 0–100 score + bar** and intent labels, and there's a prefilled example. No ad-account or budget wall: the tool degrades to sample data when no Google Ads is connected (`KeywordResearch.tsx:79`, `route.ts` comment lines 1-4).
- **Friction:** per-keyword **CPC bid ranges in CZK** and a **"Google Ads Keyword Planner"** footer inject paid-search jargon she has no use for (`KeywordResearch.tsx:40`, `:541-545`). The clustering UI speaks **"pilíř / pillar page / supporting keywords / brief / intent"** with no plain-language gloss (`:58-59, 97-98, 593-599`).
- No ROAS/POAS/PNO on this path — her worst pet peeve is avoided here.

---

## Findings

### F5 — STRENGTH: "Opportunity" score answers her core question in plain language
- **type:** strength · **dimension:** clarity / completion · **severity:** polish
- **expected:** Leave knowing the *few* queries worth targeting, ranked by winnable intent not raw volume.
- **got:** Ideas are ranked by an `opportunity` 0–100 score (high volume × low competition) with a visual bar and intent tags, plus a prefilled example seed — exactly the "which words" decision, without a spreadsheet. `src/components/ai/KeywordResearch.tsx:548-559`, `:296-307`.
- **verdict:** confirmed · **l2_priority:** low

### F6 — Keyword + clustering path leaks paid-search / SEO-pro jargon on a no-budget maker
- **type:** confusion · **dimension:** clarity / effort · **severity:** minor
- **impact:** frequency=high, reachability=high, trust_erosion=medium ("is this even for me?")
- **expected:** Getting-found help phrased for a maker, not an SEO pro (her scored criterion).
- **got:** Every keyword row shows a **CPC bid range** and the footer cites the **"Google Ads Keyword Planner"** — meaningless to someone with no ad account (`KeywordResearch.tsx:40, 541-545`). The cluster feature offers **"pillar page + supporting keywords"** and hands off a **"brief"** with no plain-language translation (`:58-59, 97-98, 593-599`).
- **verdict:** confirmed · **l2_priority:** medium
- **scope_note:** Journey 2 *is* the SEO path, so some vocabulary is inherent; the finding is the absence of a maker-friendly gloss (e.g. "CPC" hidden by default, "pillar" → "your main post").

### F7 — Keyword research isn't grounded in her catalog
- **type:** quality-gap · **dimension:** trust / missing-pieces · **severity:** minor
- **impact:** frequency=medium, reachability=high, trust_erosion=low
- **expected:** For a shop with a populated catalog, the tool could seed itself from her products ("suggest queries for what I sell").
- **got:** `/api/keywords` receives only the seed + optional URL; no `projectId`/catalog is passed, so there's no product awareness — she must know and type her own seed (`KeywordResearch.tsx:168-172`; `src/app/api/keywords/route.ts:31-47`). Acceptable for a seed-driven tool, but a missed grounding opportunity vs. the Social surface.
- **verdict:** confirmed · **l2_priority:** low

### F8 — STRENGTH: keyword → brief → draft handoff is project-grounded
- **type:** strength · **dimension:** completion · **severity:** polish
- **got:** Selecting keywords (or a cluster) routes to the Obsahový engine with the topic/keywords seeded via session storage, and the engine carries `projectId` so the brief/draft can ground in the project's brand context (`KeywordsModule.tsx:18-25`, `ContentEngine.tsx:207-221`). The "which query → shippable draft" spine exists end-to-end.
- **verdict:** confirmed · **l2_priority:** high (verify the *draft* clears her senior-quality bar live)

---

## Verdict

- **Journey verdict:** **L1-conditional** — the full spine (pick winnable query → project-grounded brief → draft) exists and requires no ad account or budget, and the core "which words" decision is delivered in plain language. But the path is tinted throughout with paid-search/SEO-pro vocabulary (CPC, Keyword Planner, pillar, brief, intent) that this jargon-averse persona would find alienating, and draft quality is unverifiable at L1.
- **Grounding score:** Keyword research **1/2** (seed-only); brief/draft **grounded by design**.
- **Time-saved if it works:** Manually guessing which searches to target + writing a rankable article is a half-day she never spends; opportunity-ranked queries + one-click brief could cut it to ~20–30 min. **Medium confidence** — hinges on (a) the draft reading like her, not filler, and (b) her not bouncing off the jargon before she reaches the payoff.
- **Biggest L2 risk:** the article draft's voice/quality (F8), and whether the jargon (F6) causes her to abandon before the brief handoff.
