# Feature Scout — Headless Article Content (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/lib/article.ts, src/data/article.json, public/clanek/prehled-druhu.svg, public/clanek/skladovani.svg

## 1. Give the article its own Open Graph share card
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: user_benefit
- **File**: `src/app/clanek/page.tsx:55`
- **Opportunity**: The article page ships a `ShareBar` (LinkedIn/Twitter/copy) and rich meta (`title`, `perex`, `category`, `readingMinutes`, `dateModifiedISO`), yet its `openGraph` metadata has no `images` — shares fall back to the root `src/app/opengraph-image.tsx`, which renders the generic *portfolio* card ("Tři úkoly, jeden klient…"), not the article. The in-article figures can't fill the gap either: they are SVGs, which social scrapers don't render as og:image.
- **Why valuable**: Sharing is a first-class flow on this page; an article-specific branded card (title + category + reading time) instead of the unrelated portfolio card is the single biggest CTR lever for shared links, and it demos exactly the SEO/content craft the agency sells.
- **Build sketch**: Add `src/app/clanek/opengraph-image.tsx` cloning the root `ImageResponse` pattern (same gradient/brand tokens, `size`/`contentType`/`alt` exports) but fed from `article.meta` — title as headline, `category` + `readingMinutes` as the eyebrow, `perex` truncated as subline. Next.js auto-wires it as og:image + twitter:image for the segment, overriding the root card; no metadata-object change needed. Optionally repeat for `/clanek/vykon` using the generated report's meta.

## 2. Add a `table` block type to the content model
- **Impact**: 7/10
- **Effort**: 4/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: feature
- **File**: `src/lib/article.ts:66`
- **Opportunity**: The block model (h2/h3/p/ul/ol/callout/quote/cta/stat/figure) has no tabular block. The article works around it: the "Malý přehled: co se na co hodí" buying-guide comparison is prose + a static SVG (`prehled-druhu.svg`), and the generated performance report (`snapshotToArticle`) narrates the per-channel ROAS/PNO breakdown as bullet lists — data that is naturally a table.
- **Why valuable**: Comparison tables are the workhorse of buying-guide SEO (scannable, snippet-eligible, sortable data as real text instead of pixels in an SVG), and they immediately upgrade the auto-generated channel breakdown in `/clanek/vykon` and the `/m/{slug}` microsites.
- **Build sketch**: Add `TableBlock { type:"table"; caption?: string; header: string[]; rows: Inline[][][] }` to the `Block` union, register it in `BLOCK_TYPES` (article.ts:102) and validate in `parseArticle` (non-empty header, every row same length). Render a semantic `<table>` in `ArticleBody.tsx` (server component — reuse the `border-line`/`bg-surface`/`tnum` styling of the stat block; its `default` case means nothing breaks before the case lands). Then have `snapshotToArticle` emit the paid-channel breakdown as a table. Do NOT extend the AI draft tool's output schema — that would touch gate-hashed files; the panel's `blockToMarkdown` has a safe `default: return ""` and can gain a table case later.

## 3. Run generated and AI-drafted articles through the same validation guard as the CMS JSON
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: functionality
- **File**: `src/lib/article.ts:127`
- **Opportunity**: `parseArticle` (unknown block types, figure fields, heading-id uniqueness, dead anchors, FAQ ≥1) is module-private and guards only the hand-authored `article.json`. The other two Article producers bypass it entirely: `snapshotToArticle` (powering `/clanek/vykon` and every `/m/{slug}` microsite on *every request*) and the AI draft panel's downloadable "Article JSON". A future template edit in the bridge — say a duplicate `id:"shrnuti"` or an anchor to a renamed heading — ships silently to public microsite URLs.
- **Why valuable**: The whole point of the load-time guard was "fail the build, not the page"; generated content is the surface most likely to drift (it's assembled from conditionals) and currently the only one with zero protection.
- **Build sketch**: Export `parseArticle` as `validateArticle(raw: unknown, source: string)` (keep the `article.json` call as-is, add the source label to the error message). Call it at the end of `snapshotToArticle` — it's pure and cheap (tens of blocks). Add the first `test-unit/article.test.mjs` per the compute-module convention: valid fixture passes, dead anchor / dup id / empty FAQ fail, plus a `snapshotToArticle(buildMetricsSnapshot(...))` round-trip assertion. (Optional follow-up: validate the draft panel's JSON before download — that edit is [CLIENT] and can be deferred.)

## 4. Publish a Markdown twin of the article from a shared serializer
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: integration
- **File**: `src/components/ai/ArticleDraftPanel.tsx:55`
- **Opportunity**: A Block→Markdown serializer already exists but is buried in the `"use client"` AI draft panel (`blockToMarkdown`), collapses all links to plain text via `inlineToText`, and serves only unsaved drafts. The published article — the flagship content deliverable — has no machine-readable/portable form at all.
- **Why valuable**: An `llms.txt`-era Markdown endpoint makes the article consumable by AI crawlers and answer engines (the exact "AI visibility" pitch a 2026 marketing agency makes), and doubles as the agency's content-handoff format (client delivery, repurposing into the distribution module) with links preserved.
- **Build sketch**: Hoist the serializer into a pure `src/lib/article-markdown.ts`: `inlineToMarkdown` (keeps `[text](href)` for links, `**bold**`), `articleToMarkdown(a)` (front-matter from `meta`, blocks, FAQ section). Serve it from a new `src/app/clanek/markdown/route.ts` GET returning `text/markdown; charset=utf-8` (server-only, reuses the singleton `article`), and link it via `<link rel="alternate" type="text/markdown">` in the page metadata. Refactor `ArticleDraftPanel` to import the shared lib (this client-file edit is why the wave must finish with a full `next build`).

## 5. Complete the article's off-page metadata: JSON-LD publisher/mainEntityOfPage/inLanguage + sitemap lastModified
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: functionality
- **File**: `src/app/clanek/page.tsx:87`
- **Opportunity**: The Article JSON-LD node has author/dates/images but omits the other fields Google's Article guidance leans on: `publisher` (Organization), `mainEntityOfPage`/`url`, and `inLanguage`. Meanwhile `meta.dateModifiedISO` — added specifically as the freshness signal ("powers the freshness stamp + Article.dateModified", article.ts:92) — never reaches `src/app/sitemap.ts`, which emits no `lastModified` for any route, so crawlers get no recrawl hint when the article is updated.
- **Why valuable**: These are the cheapest remaining rich-result eligibility and freshness signals for the case study's SEO showcase page; an SEO-savvy reviewer will notice both gaps in one View-Source.
- **Build sketch**: In the `jsonLd` graph add `mainEntityOfPage: articleUrl`, `inLanguage: "cs"` (or from `getServerLocale()`), and a `publisher` Organization node (name/url from the existing `src/lib/site.ts` canonical/site constants, logo via `canonical("/icon.svg")`). In `sitemap.ts`, special-case `/clanek` with `lastModified: article.meta.dateModifiedISO ?? article.meta.dateISO` (import from `@/lib/article` — it's a server module) while leaving the nav-derived entries untouched.
