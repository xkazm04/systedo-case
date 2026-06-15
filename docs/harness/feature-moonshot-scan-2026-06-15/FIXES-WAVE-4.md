# Fix Wave 4 — AI Content Engine (data-story) (systedo-case)

> 2 atomic commits. The analytics pillar feeds the content pillar: the dashboard
> snapshot is published as a structured, SEO-rich data-story article through the
> existing headless-article renderer.
> Baseline preserved: 0 TS / 0 lint → 0 / 0. Production build ✓ (`/clanek/vykon` static).

Date: 2026-06-15. Delivered the *deterministic* core of the content-engine theme —
the convergent "data → article" finding — closing the loop on Wave 1's snapshot.
The fully AI-generated-Article-from-a-topic moonshot is deferred (see "What remains").

## Commits

| Commit | Fix | Finding |
|---|---|---|
| `d62772a` | `snapshotToArticle` adapter (pure) | article-content #5 / article-reading #4 |
| `5577ea3` | `/clanek/vykon` data-story page + dashboard link | same |

## What was built

1. **`src/lib/snapshot-to-article.ts`** — `snapshotToArticle(snapshot, client, asOf)`
   deterministically composes a Wave-1 `MetricsSnapshot` into the existing typed
   `Article` model: headline KPIs → a `StatBlock`, a period-summary paragraph, a
   PNO-vs-goal `callout` (tip/warn), wins & risks → `ul` under `h2` (slugged ids that
   feed the TOC), the top dated anomalies → a section, recommended actions → an `ol`,
   a `faq`, and a `cta` back to the dashboard. No AI, no I/O — pure adapter.
2. **`/clanek/vykon`** — a new static route that renders the generated article via the
   **existing** `ArticleBody` + `ArticleToc` + `Breadcrumbs`, with Article /
   BreadcrumbList / FAQPage JSON-LD (mirrors the hand-authored `/clanek` chrome).
   Built at build time from `buildMetricsSnapshot`, so the report reconciles with the
   dashboard by construction. A "Datový report →" link on the dashboard surfaces it.

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 (per commit) |
| `eslint` | 0 |
| `next build` | ✓ — `/clanek/vykon` prerenders static |
| LLM gate | pass (no LLM code touched) |

## Patterns established (catalogue, cont.)

18. **One snapshot, two pillars** — the same `MetricsSnapshot` that powers the
    dashboard composes a publishable article; analytics → content reconciles when both
    read the one contract (Wave 1 paying off).
19. **Deterministic before AI** — the data-story ships AI-free (reuses the snapshot +
    existing renderer), so it's demoable key-less and can't hallucinate totals; an AI
    text pass is an *optional* enhancement layered on top, not a prerequisite.
20. **Reuse the renderer, not the page** — a new content surface reuses `ArticleBody`/
    `ArticleToc` verbatim and only re-implements the lightweight page chrome, avoiding
    the bigger collection refactor (article-content #1).

## What remains (content theme)

- **AI-generated Article from a topic** (article-content #4, Critical moonshot) — the
  hard part is expressing the `Block` discriminated union as a Gemini/Claude structured
  schema (`type` enum + variant-optional props + defensive `normalizeArticle`). L effort.
  Once built it reuses `generateStructured` + this same render path.
- **Article collection + `/clanek/[slug]`** (article-content #1) — turns `/clanek` and
  `/clanek/vykon` into a real multi-article hub; prerequisite for indexing many reports.
  Would also let `/clanek/vykon` fold into the standard article chrome.
- **"Vysvětlit vývoj" AI narration** on the trend chart (trend-chart #4) — a flat
  `{headline, drivers, risks, nextSteps}` schema through `/api/ai`, tractable.
- Other open waves (INDEX): 6 (locale), 7 (pipeline/SEO).
  Done: Wave 5, Wave 1, Wave 1b, Wave 2, Wave 3, Wave 4.
