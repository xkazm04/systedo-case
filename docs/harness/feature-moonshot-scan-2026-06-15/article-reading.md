# Feature + Moonshot Scan — Article Reading Experience

> Context: ctx_1781547850562_hsivipf
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Related-articles rail + content hub backed by a real `/clanek?kategorie=` listing
- **Severity**: High
- **Lens**: feature-scout
- **Category**: feature
- **File**: `src/lib/nav.ts:categoryHubPath` + `src/app/clanek/page.tsx` (footer slot after `TaskPager`)
- **Scenario**: `categoryHubPath()` already emits `/clanek?kategorie=<slug>` and the breadcrumb's category crumb (`src/app/clanek/page.tsx:30`) links to it — but no listing exists, so the link and the `BreadcrumbList` JSON-LD point at a dead end. There is exactly one article (`src/data/article.json`) and zero internal cross-linking at the foot of the read. For an app whose whole pitch is "content-as-SEO," a single orphan page is the weakest possible demo: no internal link graph, no topic cluster, no "next read."
- **Opportunity**: Promote `src/data/article.json` to `src/data/articles/*.json` (an array the `article.ts` model already supports as `Article[]`), add 2–3 short companion case studies, and render a "Související články" rail below `TaskPager`. Make `/clanek?kategorie=<slug>` a real filtered hub (server component reading the same model) so the existing breadcrumb link resolves. Each related card reuses `meta.title`, `meta.perex`, `readingMinutes`, `category`.
- **Impact**: Turns a dead-end page into a topic cluster — the canonical SEO demo move (pillar + cluster internal linking), boosts dwell time/pages-per-session, and makes the breadcrumb + JSON-LD self-consistent instead of pointing nowhere.
- **Implementation sketch**: Generalize `article.ts` to export `articles: Article[]` keyed by `slug`; add `relatedArticles(current, byCategory|byTag)`. New `RelatedArticles.tsx` card grid. Add a `searchParams`-aware listing branch in `src/app/clanek/page.tsx` (or a sibling route) that filters by `kategorie`. Add `ItemList` JSON-LD for the hub.

## 2. AI-assisted TL;DR / "klíčové body" summary card at the top of the article
- **Severity**: High
- **Lens**: feature-scout
- **Category**: automation
- **File**: `src/app/clanek/page.tsx` (header section, after `meta.perex`) + new `src/data/article.json` field
- **Scenario**: The header shows `perex` + reading time but no scannable summary, and the project already ships Gemini/Claude infra (`src/lib/llm/claude.ts`, `src/lib/llm/gemini.ts`, `src/app/api/ai/route.ts`). The renderer already walks the full `blocks[]` (`ArticleBody.tsx`) and `inlineToText()` (`article.ts`) flattens inline nodes to plain text — so the raw material for a summary is one helper away. Readers skimming a long Czech marketing piece get no 20-second payoff.
- **Opportunity**: Add a build-time AI step that feeds `blocks` (via `inlineToText`) to the existing LLM lib and writes a `meta.summary: Inline[]` (3–5 bullet "klíčové body") back into `article.json`. Render it as a dismissible callout-style card under the perex, reusing the `CALLOUT_STYLES.tip` look from `ArticleBody`. Promote it into the `Article` JSON-LD as `abstract`.
- **Impact**: Showcases the product's AI value *inside* the content surface (not just the standalone assistant), improves skimmability and the SERP snippet, and demonstrates the "AI summarizes your marketing content" capability the case study is selling — at zero runtime cost (pre-generated).
- **Implementation sketch**: Add `summarizeArticle(blocks)` to `src/lib/llm/*` using the existing client; a small `scripts/gen-summary.ts` writes `meta.summary` into `article.json`. Extend the `Article` type in `article.ts`. Render a `SummaryCard` in `page.tsx`; add `abstract` to the Article node in `jsonLd`.

## 3. Reading analytics: scroll-depth + section-dwell + share events feeding the UTM/dashboard story
- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: integration
- **File**: `src/components/article/ReadingProgress.tsx` + `src/components/article/ArticleToc.tsx` (IntersectionObserver) + `src/components/article/ShareBar.tsx`
- **Scenario**: `ShareBar` already stamps every share with `utm_source/medium/campaign` "so the dashboard can attribute the reach" (comment at `ShareBar.tsx:8`), and `ArticleToc` already runs an `IntersectionObserver` that knows exactly which section is active. But nothing *records* engagement — the analytics story is asserted, not demonstrated. The case study claims a marketing-analytics product yet its own flagship content collects no first-party signal.
- **Opportunity**: Add a tiny client analytics shim that emits events on (a) scroll-depth milestones from `ReadingProgress` (25/50/75/100%), (b) per-section dwell from the existing TOC observer, and (c) share/copy clicks in `ShareBar`. Persist to the project's existing SQLite (same pattern as the campaigns API) via a `POST /api/article/events` route, then surface a "Engagement článku" tile on the dashboard.
- **Impact**: Closes the loop the UTM tags promise — proves end-to-end attribution (share → read → scroll-depth) with real first-party data, the single most credible artifact for a marketing-analytics portfolio.
- **Implementation sketch**: New `src/lib/article-analytics.ts` (`track(event)` → `navigator.sendBeacon`). Hook milestone emits into `ReadingProgress.update`, section-change emits into the `setActive` path in `ArticleToc`, click emits in `ShareBar.copyLink/nativeShare`. New `src/app/api/article/events/route.ts` mirroring `src/app/api/campaigns/route.ts` SQLite writes. Add a dashboard tile reading the aggregate.

## 4. AI Content Engine — draft these structured articles directly from dashboard performance data
- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: automation
- **File**: `src/lib/article.ts` (the `Block`/`Inline` content model) + `src/data/performance.json` + `src/app/api/ai/route.ts`
- **Scenario**: The article is already a typed, schema-validated JSON document (`Block[]` discriminated union in `article.ts`) — a perfect LLM *output* target — and the app already owns the upstream data (`src/data/performance.json`), an AI route, and two LLM clients. Today a human authors `article.json` by hand. The end state: a marketer clicks "Vygenerovat článek" on the dashboard and the system writes a publication-ready, SEO-structured case study *about that client's own numbers* (stat blocks, callouts, FAQ, figures) — the exact artifact this whole page renders.
- **Opportunity**: Build a generator that takes `performance.json` (visits/cost/conversions/revenue/PNO) and prompts the LLM to emit a *valid `Article`* JSON (headings with stable `id`s, `stat` blocks fed from real KPIs, a `faq[]`, `cta` to the dashboard). Validate against the `Article` type, then render through the *existing untouched* `ArticleBody`/`ArticleToc`/JSON-LD pipeline. The renderer becomes the runtime for machine-authored content.
- **Impact**: Category-defining — collapses "we have your ad data" and "we publish your SEO content" into one button. Every dashboard becomes a content factory; the structured-JSON renderer is the moat (LLM output is constrained and instantly rich-result-ready). This is the platform story the case study should be *demonstrating*, not just describing.
- **Implementation sketch**: Add `generateArticleFromPerformance(perf)` in `src/lib/llm/*` with a JSON-schema-constrained prompt emitting `Block[]`+`faq[]`; reuse `slugify` (`nav.ts`) for heading `id`s and `tableOfContents`/`figureBlocks` unchanged. Zod/type-guard validation before persist. New dashboard action → `POST /api/ai` variant → writes a new `src/data/articles/<slug>.json` consumed by opportunity #1's hub.

## 5. Interactive "Zeptej se článku" — RAG-style Q&A grounded in the article's own blocks
- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: user_benefit
- **File**: `src/components/article/section-store.ts` (pub/sub bridge) + `src/components/article/ArticleToc.tsx` + `src/app/api/ai/route.ts`
- **Scenario**: The page already has a working client-island bridge (`section-store.ts` `announceSection`/`subscribeSection`) that lets one island steer the TOC highlight, an FAQ that answers *fixed* questions (`page.tsx` FAQ section), and an AI backend. The natural 10x: let readers ask *their own* question and get an answer cited from the article — with the answer's source heading auto-scrolled and highlighted via the existing `announceSection` channel. The static FAQ becomes a live, self-grounding assistant.
- **Opportunity**: Add an "Zeptej se článku" box (sticky, beside the TOC) that sends the question + `inlineToText(blocks)` context to `/api/ai`, returns a short grounded answer plus the `id` of the most relevant `h2`/`h3`, and calls `announceSection(id)` so the TOC slides and the page scrolls to the cited section. Reuse `HeadingAnchor` ids as citation targets.
- **Impact**: Turns a read-only article into a conversational knowledge surface and a live demo of grounded (non-hallucinating, citation-anchored) AI — far more persuasive in a marketing-AI case study than the canned FAQ. The citation-scroll is a memorable, screenshot-worthy "wow" that reuses infrastructure already shipped.
- **Implementation sketch**: New `AskArticle.tsx` client island in the `aside` of `page.tsx`; pass it `blocks` serialized via `inlineToText`. `POST /api/ai` with a "answer only from context, return `{answer, sourceId}`" prompt. On response, `el.scrollIntoView()` the heading + `announceSection(sourceId)` (already imported pattern from `HeadingAnchor`). Optionally feed unanswered questions into opportunity #3's analytics to mine real FAQ gaps.
