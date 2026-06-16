# Headless Article Content — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. The snapshot-to-article bridge is the product — surface it as a live "generate report" action, not one frozen static page
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: src/lib/snapshot-to-article.ts, src/app/clanek/vykon/page.tsx
- **Opportunity**: `snapshotToArticle()` already deterministically turns any `MetricsSnapshot` into a publish-ready typed `Article` — wins, risks, anomalies, recommended actions, FAQ — but it is invoked exactly once, hard-wired to a single 90-day snapshot at module scope in `/clanek/vykon`. The dashboard already lets users switch periods; that selected period never produces a report. Expose "Vygenerovat report" from the dashboard that feeds the chosen `SnapshotPeriod` into `snapshotToArticle` and renders/downloads it.
- **Value**: This is the single most differentiating story in the whole case study — "your dashboard writes its own SEO-ready, schema-marked report." Demonstrating it on-demand (period picker → article) turns a static artifact into a sellable feature ("automated client reporting") instead of a screenshot.
- **Effort**: M
- **Fix sketch**: Wire `buildMetricsSnapshot(performance, selectedPeriod)` → `snapshotToArticle` behind a dashboard button; render via the existing `ArticleBody` + JSON-LD pipeline (or a print/PDF view). Reuse the period model already in `metrics.ts` (`SnapshotPeriod`).

## 2. Single-article model with a self-admitted dead-end hub — promote `Article` to a multi-article content collection
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/lib/article.ts, src/lib/nav.ts (`categoryHubPath`), src/data/article.json
- **Opportunity**: The loader hard-binds one JSON file (`export const article = data as Article`) and `categoryHubPath()` literally comments that it points at `/clanek` "until a real listing hub exists" so its breadcrumb/JSON-LD link "isn't dead." There is no `slug`, no article registry, no listing page — yet `slugify()` already exists in nav.ts unused for this purpose. Introduce an articles index (`src/data/articles/*.json` + a `getArticle(slug)`/`listArticles()` loader) and a `/clanek` hub that lists cards by category/tag.
- **Value**: A content hub is what makes this read like a real publishing product (and a real agency deliverable) rather than a one-off page. It unlocks SEO surface area (category/tag landing pages, `CollectionPage`/`ItemList` JSON-LD, internal linking depth) and gives the snapshot reports a home to accumulate over time.
- **Effort**: M
- **Fix sketch**: Add `meta.slug` to the `Article` interface, replace the single `import data` with a directory loader returning `Article[]`, build a `/clanek` listing using `tableOfContents`/`meta.tags`, and make `categoryHubPath()` emit a real `?kategorie=` filter.

## 3. ~90% duplicated page shell between hand-authored and generated articles — extract one `ArticleLayout`
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/app/clanek/page.tsx, src/app/clanek/vykon/page.tsx
- **Opportunity**: The two article routes copy the header section, sticky-TOC grid, tags row, FAQ `<details>` accordion, and most of the JSON-LD `@graph` verbatim. They have already drifted: `/clanek/vykon` omits the figure→`ImageObject` promotion entirely and renders FAQ answers with `inlineToText` (flattening links to plain text) while `/clanek` renders rich inline links. Any new block type or schema fix must be done twice and will keep diverging.
- **Value**: One `ArticleLayout({ article, path, eyebrow, icon })` component makes every future article (finding #2) and every generated report (finding #1) consistent for free, and fixes the live regression where generated-report FAQ links are silently stripped. Less duplication directly lowers the cost of every other opportunity here.
- **Effort**: M
- **Fix sketch**: Lift the shared JSX + `jsonLd` builder into `components/article/ArticleLayout.tsx` driven by `figureBlocks`, `tableOfContents`, `inlineToText`; render FAQ answers with the inline renderer (as `/clanek` does) instead of `inlineToText`, so both surfaces keep links.

## 4. AI-assisted authoring grounded in dashboard data — close the loop between the AI assistant and the article model
- **Severity**: Medium
- **Lens**: Both
- **Category**: feature
- **File**: src/lib/snapshot-to-article.ts, src/lib/gemini.ts, src/lib/article.ts
- **Opportunity**: `snapshotToArticle` is deterministic and template-shaped (great for accuracy, flat in prose), while `gemini.ts` already runs an LLM analysis over the same snapshot for the AI assistant. Neither feeds the `Article` block model. A grounded authoring step could take the deterministic `Block[]` as a factual skeleton and ask the LLM only to enrich narration (intro perex, section transitions) while leaving every number/`stat`/`anomaly` block untouched — "AI writes the story, never the numbers."
- **Value**: Solves the credibility problem of AI content (hallucinated metrics) by construction and showcases the strongest agency pitch: data-grounded content generation. It differentiates from generic "AI blog writer" tools whose output can't be trusted with client figures.
- **Effort**: L
- **Fix sketch**: Add an optional `enrichArticle(article, callLLM)` that passes the typed blocks as context and merges back only `p`/`perex` prose; reuse `gemini.ts` provider plumbing and its demo-fallback so prod (Gemini) and dev (Claude CLI) both work.

## 5. Block vocabulary too thin for data-stories — add `table`, `chart`/`embed`, and `related` block types
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: feature
- **File**: src/lib/article.ts (`Block` union), src/components/article/ArticleBody.tsx
- **Opportunity**: The `Block` union covers prose primitives (`p`, `ul`, `stat`, `figure`, `cta`…) but a "performance report" has no way to render a channel comparison **table**, an embedded **chart**, or a **related-articles** strip — so `snapshotToArticle` flattens rich channel/anomaly data into bullet lists and `figureBlocks` only promotes static SVGs. Add `TableBlock` (promotable to `Table`/`ItemList` JSON-LD), a `ChartBlock`/`EmbedBlock` (reuse the dashboard's chart components inline), and a `RelatedBlock` for cross-linking (depends on #2's registry).
- **Value**: Richer, more authoritative articles with better dwell time and more SERP-eligible structured data, and it lets generated reports show the channel breakdown as a real table instead of prose — closer to what an agency would actually ship to a client.
- **Effort**: M
- **Fix sketch**: Extend the `Block` discriminated union with `table`/`chart`/`related`, add the matching `case` arms in `ArticleBody.tsx`, and have `snapshotToArticle` emit a `table` from `snapshot.channels` instead of (or alongside) the wins/risks bullet lists.
