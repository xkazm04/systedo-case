# Headless Article Content — Ambiguity + Business scan
> Context: A single-file headless-CMS content model — structured `article.json` plus a typed loader (`article.ts`) that derives the ToC, FAQ schema, first-class links, and ImageObject figures.
> Files analyzed: 4 (article.ts read in full; article.json shape sampled end-to-end; both SVGs confirmed present + referenced)
> Total findings: 5

## 1. The "CMS" is a hardcoded singleton — one article, no path to a content hub
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/lib/article.ts:1, src/lib/article.ts:97
- **Problem/Opportunity**: The loader does `import data from "@/data/article.json"` and exports a single `article` const. The block model is clean and reusable, but the entry point hard-binds to exactly one file, so the system can never become the multi-article content cluster a marketing-agency case study should showcase. Every external link points at mionelo.cz categories (orechy, seminka, susene…), so a cluster of articles would compound topical authority and internal/outbound linking — the exact SEO value the agency is selling.
- **Why it matters**: "Content scaling" is the headline selling point of a headless CMS; demonstrating one article only undersells it, and the singleton import is the one line blocking the leap.
- **Fix sketch**: Replace the singleton import with `getArticleBySlug(slug)` reading `src/data/articles/<slug>.json` (or `import.meta.glob`-style eager map), keep `article` as a thin back-compat alias, and add a `listArticles()` returning meta for an index/related-articles grid. Surface `meta.tags` (currently unused by the loader) via a `relatedByTag()` helper to wire the cluster.

## 2. `data as Article` is an unchecked cast — malformed JSON, missing image or empty FAQ fail silently
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: M
- **File**: src/lib/article.ts:97
- **Problem/Opportunity**: The JSON is force-cast to `Article` with zero runtime validation. A block with an unknown `type`, a `figure` missing `src`/`alt`, a `meta` missing `dateISO`, or an empty `faq: []` (Google requires ≥1 question for FAQPage) all type-check fine yet crash the renderer or emit invalid schema. The implicit assumption "the author always hand-writes valid JSON" is exactly the assumption that breaks the moment finding #1 multiplies the files.
- **Why it matters**: A headless model with no schema guard turns every content edit into a deploy-time roulette; invalid JSON-LD silently loses rich-result eligibility rather than erroring loudly.
- **Fix sketch**: Add a lightweight zod (or hand-rolled) `parseArticle(data)` mirroring the existing interfaces, called in place of the `as Article` cast; in dev, assert each `figure.src` resolves under `public/` and that `faq.length > 0` before emitting FAQPage schema. Fail the build, not the page.

## 3. Anchor links and heading IDs are never cross-checked (broken in-page links) — and the ToC silently drops every H3
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/lib/article.ts:106, src/data/article.json:25
- **Problem/Opportunity**: Inline links with `kind:"anchor"` (`#kvalita`, `#kolik`, `#skladovani`) are first-class, but nothing verifies they match an actual `HeadingBlock.id`. Today they happen to resolve; a renamed heading or a typo produces a dead jump-link with no warning. Separately, `tableOfContents` filters to `type==="h2"` only, so the three H3s under "Malý přehled" (prehled-orechy/seminka/susene, json:82/91/100) vanish from the ToC — a reasonable choice whose reasoning is nowhere recorded.
- **Why it matters**: Broken in-page anchors hurt UX and waste crawl signals; an undocumented H2-only rule looks like a bug to the next author and invites "fixes" that bloat the ToC.
- **Fix sketch**: Add a tiny `validateAnchors(a)` (dev/test) asserting every `kind:"anchor"` href (minus `#`) is in the set of heading IDs and that IDs are unique; add a one-line comment at article.ts:106 stating "H2-only by design — H3 are sub-points." Cheap unit test, no schema change.

## 4. First-class links carry no attribution metadata — the article narrates a funnel it can't measure
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/article.ts:8, src/data/article.json:223
- **Problem/Opportunity**: The closing callout explicitly ties this content to a "výkonnostní dashboard" (`/dashboard`) and "AI asistent" (`/ai-asistent`), yet every outbound mionelo.cz link is a bare `href` with no campaign/UTM or analytics hook. The case study claims content→shop attribution but the data model can't express it, so the dashboard story is unfalsifiable.
- **Why it matters**: Measurable content→conversion attribution is the marketing-agency value proposition; an optional tag on the link type makes the funnel real instead of narrated.
- **Fix sketch**: Extend the `Inline` link variant (and `CtaBlock`) with an optional `campaign?: string`, have the renderer append a UTM param / `data-campaign` attribute for `kind:"external"` links, and let the referenced dashboard read those. Optional field keeps the model headless and backward-compatible.

## 5. Figure `width`/`height` are optional but load-bearing for ImageObject + CLS; `readingMinutes` is a hand-typed magic number
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/article.ts:52, src/lib/article.ts:89
- **Problem/Opportunity**: `FigureBlock.width?`/`height?` are optional, yet the doc-comment says they feed both the JSON-LD ImageObject and CLS-avoidance — both of which degrade silently if an author omits them (Google recommends dimensions on ImageObject; next/image needs them or `fill`). Both current SVGs supply 1200×675, masking the gap. Likewise `meta.readingMinutes: 8` (json:12) is hand-maintained while the ToC and figures are auto-derived — it drifts every time the body is edited.
- **Why it matters**: Optional-but-required fields are an undocumented trap that surfaces only once content scales (finding #1); a stale reading time is a small but visible credibility ding on a polished case study.
- **Fix sketch**: Make `width`/`height` required on `FigureBlock` (or document a fallback at article.ts:52), and add a `readingMinutes(a)` helper deriving the estimate from concatenated block/inline word count (≈200 wpm), keeping the JSON field only as an optional override.
