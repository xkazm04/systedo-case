# Feature Scout — Srovnání & SEO (`/app/[projectId]/srovnani-seo`)

> Module: src/components/app/modules/CompareSeoModule.tsx
> Project type: app
> Total: 5 ideas

## 1. "vs/alternativa" draft pipeline into Obsah (brief-seed handoff)
- **Category**: functionality
- **Impact**: 9
- **Effort**: 4
- **Risk**: 2
- **Gap today**: The only outbound action is a static link to `/app/${projectId}/obsah` (CompareSeoModule.tsx:38-47) that carries nothing — it just opens the brief tool empty. Each row already knows `query`, `intent`, `volume` (compute.ts `ScoredQuery`), but none of it travels.
- **Proposal**: Add a per-row "Vytvořit srovnávací obsah" action that builds a `BriefSeed` (`{ topic, primaryKeyword, keywords }`, KeywordResearch.tsx:20-24) from the selected query and writes it to `sessionStorage` under `briefSeedKey(projectId)` (brief-seed.ts:5) before `router.push` to `obsah` — reusing the exact bridge the keyword module already uses, which `ContentModule` reads on mount (ContentModule.tsx:18-33). Pre-seed an intent-specific brief skeleton (vs → comparison table + verdict; alternativa → "X alternatives" listicle + migration angle; cena → pricing-breakdown + FAQ). Convert the component to a client component (or a thin client action wrapper) so it can set storage + navigate.
- **User value**: Turns the opportunity table from a read-only list into a one-click "spot it → draft it" loop; the highest-opportunity comparison query becomes a structured brief in two clicks instead of a manual copy-paste into an empty form.
- **Fit**: Directly realizes the module's own promise ("Předat dotaz do AI briefu", line 44) and mirrors the established keyword→content seam already shipped in this app type.

## 2. Competitor & SERP-feature tracking per query (white-space → who-owns-it)
- **Category**: feature
- **Impact**: 8
- **Effort**: 6
- **Risk**: 3
- **Gap today**: The model knows only our own `rank` (sample.ts:15) and a generic "prostor v SERP" claim in the footer (CompareSeoModule.tsx:84-87), but stores zero data about *who* ranks or *what* SERP features exist. There is no competitor or SERP-feature model anywhere in the repo (confirmed: no `competitor`/`SERP`/`share of voice` types under `src/lib`).
- **Proposal**: Extend `CompareQuery` with `competitors: { domain: string; rank: number }[]` and `serpFeatures: ("featured_snippet" | "paa" | "shopping" | "reviews")[]`. Surface a "Kdo rankuje" column (top 1-3 domains as pills) and a SERP-feature badge row, and fold real SERP space into `rankFactor`/score instead of the current constant `1.3` for unranked terms (compute.ts:27-32). A query where a featured snippet is up for grabs scores above an identical query locked by an entrenched brand.
- **User value**: "High opportunity" stops being a volume/difficulty proxy and becomes grounded: the user sees the competitor wall and the actual SERP real estate before investing in a page.
- **Fit**: Honors the file's own real-integration seam ("Search Console + a keyword tool", sample.ts:2-3) and sharpens the opportunity score the module is built around.

## 3. Opportunity-score tuning panel (intent weights + thresholds)
- **Category**: user_benefit
- **Impact**: 6
- **Effort**: 4
- **Risk**: 3
- **Gap today**: `INTENT_WEIGHT`, `rankFactor`, the `Math.max(20, difficulty)` floor, and the 0.66/0.33 high/medium cutoffs are all hardcoded constants (compute.ts:12-17, 27-32, 36, 42). A user who knows pricing pages convert hardest for *their* SaaS can't tilt the ranking, and the static footer formula (CompareSeoModule.tsx:84-87) can't be reconciled with their reality.
- **Proposal**: Add a collapsible "Ladění skóre" panel exposing intent-weight sliders and the high/medium normalization thresholds, parameterizing `scoreQueries(queries, weights)`. Persist per-project via `localStorage` (no DB needed, matching the JSON-in-repo constraint). Re-rank live and show how each query's tier shifts. Ship sensible app-type defaults.
- **User value**: Makes the ranking trustworthy and ownable — agencies running several app projects can encode each client's conversion economics instead of accepting one global weighting.
- **Fit**: Pure, client-tunable extension of the existing scoring engine; no new data dependency, respecting the no-DB rule.

## 4. SERP/position monitoring over time (movers, won/lost snippets)
- **Category**: feature
- **Impact**: 7
- **Effort**: 6
- **Risk**: 4
- **Gap today**: `rank` is a single scalar snapshot (sample.ts:14-15) with no history; the table shows a static "Pozice" value (CompareSeoModule.tsx:74) and nothing about whether it's improving, sliding, or newly lost. Published comparison pages have no feedback loop back into the module.
- **Proposal**: Add a `rankHistory: { date: string; rank: number | null }[]` to the query model plus a lightweight sparkline + delta-vs-last-period column ("+4", "−2", "nová pozice"). Add a "Hýbe se" filter and a top "Pohyby" summary card (biggest gains/losses, snippets won/lost). Drives a new "watched query → published page → it moved" recommendation that can feed `appRecs` in insights/aggregate.ts (currently only emits one static high-opportunity rec, aggregate.ts:80-84).
- **User value**: Closes the loop after the user ships a comparison page — they see whether the bet paid off, and which queries are slipping and need a refresh.
- **Fit**: Natural evolution of the single-snapshot rank model toward the rank-tracking the registry blurb implies; plugs into the existing cross-module recommendation hub.

## 5. Comparison-page template generator ("vs" table + verdict + FAQ schema)
- **Category**: functionality
- **Impact**: 6
- **Effort**: 5
- **Risk**: 3
- **Gap today**: Generic content generation lives in `ContentBriefGenerator`/`brief.ts`, but nothing produces the *comparison-specific* structure (side-by-side feature table, verdict box, alternatives list, pricing-comparison block, FAQ/structured data) that high-intent vs/alternativa/cena pages need to win SERP features. The hand-off (idea #1) seeds a generic brief, not a comparison scaffold.
- **Proposal**: Add an intent-aware template generator that, from the selected query + competitor data (idea #2), produces a comparison-page outline via the server-side `src/lib/llm` wrapper: a feature-comparison table skeleton, a "verdikt" section, an alternatives/migration angle, and FAQPage + (where relevant) Product/Offer JSON-LD stubs. Output flows into the brief seed (idea #1) as a richer `BriefSeed`, so Obsah receives a comparison scaffold rather than a blank topic.
- **User value**: Power users get a publish-ready comparison skeleton tuned for the SERP features these queries trigger, instead of re-deriving "what does a good vs-page look like" every time.
- **Fit**: Builds on the module's intent taxonomy and the one-LLM-wrapper rule; complements (not duplicates) the existing generic brief tool by adding the comparison-only structure the module specializes in.
