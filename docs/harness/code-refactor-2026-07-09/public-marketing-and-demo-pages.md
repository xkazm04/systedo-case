# Public marketing & demo pages

> Context #30 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 20

## 1. Unify the duplicated article-page shell between `/clanek` and `/clanek/vykon`

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/clanek/page.tsx:90-297`
- **Scenario**: `src/app/clanek/vykon/page.tsx:51-184` reimplements the same "headless article shell" as `/clanek`: breadcrumb-trail construction, the `Article + BreadcrumbList (+FAQPage)` JSON-LD graph, the header block (`Breadcrumbs`/`Eyebrow`/`Pill`/date/reading-time), the sticky-TOC-aside + article-body grid, the tag list, and the FAQ `<details>` accordion. The two copies have already drifted: `/clanek`'s FAQ items get a stable `id` via `faqItemId(f)`, deep-link auto-open via `FaqHashOpen`, and a per-question permalink via `FaqPermalink` (`page.tsx:252-287`); `/clanek/vykon`'s FAQ accordion uses a bare `key={i}` index with no id, no hash-open, no permalink (`vykon/page.tsx:162-178`) — a developer fixing/extending FAQ behavior in one copy has no signal the other exists.
- **Root cause**: `/clanek/vykon` was added later as the "auto-generated report" twin of the hand-authored `/clanek` article and was built by copying the page rather than factoring out the shared shell.
- **Impact**: ~110 lines of near-identical JSX/JSON-LD-building logic maintained twice; the FAQ feature drift above means a future addition to one page (e.g. a new JSON-LD field, a new FAQ affordance) has to be remembered and re-applied to the other by hand, or the two surfaces silently diverge further.
- **Fix sketch**: Extract a shared `ArticlePageShell({ article, toc, breadcrumbs, jsonLdExtra?, faqLinkable? })`-style component (e.g. `src/components/article/ArticlePageShell.tsx`) that owns the breadcrumb JSON-LD, header, TOC/body grid, tag list and FAQ accordion (parametrized by whether FAQ items are deep-linkable, since `/clanek/vykon`'s FAQ intentionally omits that). Have both `src/app/clanek/page.tsx` and `src/app/clanek/vykon/page.tsx` render it, passing only what differs (figures/author/markdown-copy button for `/clanek`; the simpler `Organization` author for `/clanek/vykon`).

## 2. Reuse the existing `isCampaignPeriod` guard instead of re-deriving it

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/report/[token]/page.tsx:73-76`
- **Scenario**: `const period = shared.period as CampaignPeriod; const periodLabel = (period in { "7d": 1, "30d": 1, "90d": 1 }) ? campaignPeriodLabel(period, locale) : shared.period;` hand-rolls a period-validity check with an inline object literal. `shared.period` is a plain `string` on `SharedReport` (`src/lib/campaigns/shared-report.ts:27`, sourced from whatever `meta.period` the sync last wrote) — exactly the "narrow an unknown string to `CampaignPeriod`" job that `isCampaignPeriod(v): v is CampaignPeriod` already does in the very module this file imports `campaignPeriodLabel`/`CampaignPeriod` from (`src/lib/campaigns/types.ts:125-127`). That guard is already the established pattern at three other call sites: `src/lib/ai/validation.ts:729`, `src/app/api/campaigns/route.ts:100,130`, and `src/components/campaigns/ScoreTimeline.tsx:60`.
- **Root cause**: The page pre-dates or the author was unaware of `isCampaignPeriod`, and used an unsafe `as CampaignPeriod` cast plus an ad-hoc runtime check instead.
- **Impact**: The unsafe cast on line 73 means TypeScript already believes `period` is a valid `CampaignPeriod` regardless of the runtime `in` check that follows — the guard buys no type safety, only a value check maintained by hand. If `CAMPAIGN_PERIODS` ever gains or renames a value (it's a single-source-of-truth array specifically to prevent this), this literal has to be remembered and updated separately, unlike the three other call sites that just import the guard and get the update for free.
- **Fix sketch**: Replace lines 73-76 with `const periodLabel = isCampaignPeriod(shared.period) ? campaignPeriodLabel(shared.period, locale) : shared.period;` and add `isCampaignPeriod` to the existing `@/lib/campaigns/types` import (line 10-15). Drops the unsafe cast entirely — `isCampaignPeriod`'s type predicate narrows `shared.period` inline.

## 3. Centralize the JSON-LD `<script>` block — one of four copies escapes tenant HTML, the others don't

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/clanek/page.tsx:165-168`
- **Scenario**: The `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />` pattern is repeated verbatim in four places in this context: `src/app/clanek/page.tsx:165-168`, `src/app/clanek/vykon/page.tsx:96-99`, `src/app/mapa/page.tsx:94-97`, and `src/app/m/[slug]/page.tsx:107-112`. Only the last one escapes: `JSON.stringify(jsonLd).replace(/</g, "\\u003c")`, with a comment explaining it's needed because `config.brandName`/`clientName` are tenant-controlled. A repo-wide grep for `application/ld+json` and for a shared `JsonLd`/`StructuredData` component finds no such helper anywhere in `src/` — each page hand-rolls the tag from scratch.
- **Root cause**: The escaping fix was applied locally to `/m/[slug]` when someone noticed it renders tenant-supplied strings, instead of being pushed into a shared primitive all JSON-LD emitters use.
- **Impact**: None of today's other three copies currently serialize tenant-controlled data, so there's no live XSS today — but the pattern most likely to be copied by a future page (3 of 4 existing examples are unescaped) is the unsafe one. `report/[token]/page.tsx` in this same context already renders tenant-controlled `shared.brandName`/`accountName`/`logoUrl` and has no JSON-LD block yet; if one is added later by copying `/clanek` or `/mapa` instead of `/m/[slug]`, the escape is silently lost.
- **Fix sketch**: Add a small `JsonLd({ data }: { data: unknown })` component (e.g. in `src/components/JsonLd.tsx`) that always does the `.replace(/</g, "\\u003c")` escape, and swap all four `<script type="application/ld+json" ...>` blocks to render it.

## 4. `/kvalita-modelu` bypasses the shared `<Container>` primitive

- **Severity**: Medium
- **Category**: structure
- **File**: `src/app/kvalita-modelu/page.tsx:40`
- **Scenario**: Every other page in this context (`ai-asistent`, `cena`, `kampane`, `knihovna`, `lokalni-seo` (via its showcase), `mapa`, `socialni`, `clanek`, `clanek/vykon`) wraps its content in the shared `<Container>` (`src/components/ui.tsx:4-12`, `mx-auto w-full max-w-6xl px-4 sm:px-6`, overridable via `className`). `kvalita-modelu/page.tsx:40` instead hand-rolls `<div className="mx-auto w-4/5 py-12 sm:py-16">`. A repo-wide grep confirms `w-4/5` appears nowhere else in `src/`.
- **Root cause**: The page-scoped comment (`page.tsx:38-39`) explains the intent — hold the page to "a constant 80% of the viewport width... instead of the old 3xl/4xl mix" — but the author reached for a bespoke percentage wrapper instead of `<Container className="max-w-none w-4/5">` (or a new width variant on the primitive).
- **Impact**: The bespoke wrapper has no `px-4 sm:px-6` gutter that `Container` provides, so on a narrow-but-non-mobile viewport (e.g. a split-screen browser window) this page's content can sit flush against the edge where every sibling page has breathing room. It also means a future site-wide `Container` change (e.g. adding a max page width cap, adjusting the gutter) silently skips this one page.
- **Fix sketch**: Replace the bespoke div with `<Container className="max-w-none w-4/5">` (or add an explicit width prop/variant to `Container` if `w-4/5` should become a supported second layout) so the page keeps its 80%-width look but inherits the shared responsive padding and any future Container-wide changes.

## 5. Hand percent-encoded mailto subjects instead of `encodeURIComponent`

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/app/cena/page.tsx:189-191`
- **Scenario**: The Pro/BYOM mailto CTAs build their `subject=` query string by hand: `` `mailto:${SALES_EMAIL}?subject=Z%C3%A1jem%20o%20Adamant%20Vlastn%C3%AD%20kl%C3%AD%C4%8D` `` and `` `mailto:${SALES_EMAIL}?subject=Z%C3%A1jem%20o%20Adamant%20Pro` ``. Elsewhere in the codebase the same kind of mailto link uses `encodeURIComponent` on the literal string instead (`src/components/app/modules/AccountSecurity.tsx:167`: `` mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request%20(${encodeURIComponent(user.id)}) ``).
- **Root cause**: The Czech subject text with diacritics was percent-encoded once by hand (or by a tool) and pasted in as a literal, rather than wrapped in `encodeURIComponent` at the template-literal site.
- **Impact**: Low — the strings are correct today — but they're opaque and easy to get wrong on the next edit (a changed subject line has to be re-encoded by hand with no visual relationship between the Czech text and the `%XX` sequence a reviewer sees in the diff).
- **Fix sketch**: Replace both literals with `` `mailto:${SALES_EMAIL}?subject=${encodeURIComponent("Zájem o Adamant Vlastní klíč")}` `` and `` `mailto:${SALES_EMAIL}?subject=${encodeURIComponent("Zájem o Adamant Pro")}` ``, matching the `AccountSecurity.tsx` convention.
