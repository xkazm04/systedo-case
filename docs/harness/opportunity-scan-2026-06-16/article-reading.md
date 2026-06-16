# Article Reading Experience — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. AI-generated TLDR / key-takeaways box above the fold
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/app/clanek/page.tsx, src/lib/snapshot-to-article.ts, src/lib/ai-types.ts
- **Opportunity**: The article opens with a hand-written `meta.perex` but no scannable "co se dozvíte" summary. The app already ships a full LLM tool layer (`useAiTool`, `ContentBriefGenerator`, `AdGenerator`) yet the flagship long-form article — 8 min read — has zero AI-assisted comprehension aid.
- **Value**: A 3-5 bullet TLDR is the single highest-converting addition for long content: it lifts scroll depth, lowers bounce, and is the most demo-able proof that "this agency builds with AI end-to-end" — the exact story the case study sells. Czech B2B readers skim first.
- **Effort**: M
- **Fix sketch**: Add a `summary: Inline[]` field to the `Article` meta type and a `BriefResult`-style generator that condenses `blocks` into 4 bullets; render a dismissible "Shrnutí (TL;DR)" callout in `page.tsx` between the perex and the `ShareBar` row. Deterministic fallback can reuse the H2 list from `tableOfContents(article)`.

## 2. Newsletter / lead-capture block reusing the existing UTM machinery
- **Severity**: High
- **Lens**: Business Visionary
- **Category**: growth
- **File**: src/app/clanek/page.tsx (after FAQ / before TaskPager), src/components/article/ShareBar.tsx (UTM helper)
- **Opportunity**: A reader who finishes an 8-minute article is the warmest lead the site produces, yet the page ends with a generic case-study `TaskPager` and no email/lead capture. `ShareBar.withUtm()` already proves the team thinks in attributable channels, but no inbound capture exists anywhere in `src`.
- **Value**: Converts earned attention into a first-party audience — the one growth asset an agency client actually pays for. Even as a case study it demonstrates the full "obsah → poptávka" funnel, differentiating from competitors who only show dashboards.
- **Effort**: M
- **Fix sketch**: Add an `<ArticleLeadCapture>` island (email + GDPR consent) rendered after the `faq` section in `page.tsx`; tag the submit event with the same `utm_campaign="clanek"` brand tag from `ShareBar` so a captured lead is attributable in the dashboard's analytics story. Server action can stub-persist to JSON like `article.json` does.

## 3. Topic-related content rail instead of the generic task pager
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/components/site/TaskPager.tsx, src/app/clanek/page.tsx, src/lib/article.ts (meta.tags / meta.category)
- **Opportunity**: The article ends with `TaskPager`, which walks the *reviewer* through the case study (Dashboard → AI asistent → Kampaně) but offers no *content-relevant* next read. `meta.tags` and `meta.category` already exist and are rendered as inert `#tag` pills with no links or hub.
- **Value**: Related-content rails are the proven on-site retention lever (pages/session, dwell time) and the strongest internal-linking SEO signal. Making the tag pills clickable into a `categoryHubPath()` hub turns dead decoration into a navigation surface.
- **Effort**: M
- **Fix sketch**: Link each `meta.tags` pill in `page.tsx` to a filtered hub via `categoryHubPath()`; add a "Mohlo by vás zajímat" rail above `TaskPager` that selects sibling articles by shared `meta.tags`/`category`. Since there is one article today, seed it from `snapshot-to-article.ts` generated stories so the rail is non-empty.

## 4. Derive reading time and surface section progress (estimated read time)
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: user_benefit
- **File**: src/lib/article.ts, src/data/article.json, src/components/article/ReadingProgress.tsx
- **Opportunity**: `meta.readingMinutes` is hand-authored (`8` in `article.json`, `2` hardcoded in `snapshot-to-article.ts`) and drifts from actual content. `ReadingProgress` tracks a single page-wide scroll bar but never tells the reader how much time remains or which section they're in.
- **Value**: Accurate, auto-derived read time builds trust ("the number matches reality") and a "X min zbývá" indicator measurably increases completion on long reads. Removes a manual authoring chore and a guaranteed-to-rot field.
- **Effort**: S
- **Fix sketch**: Add a `readingMinutes(a: Article)` helper in `article.ts` that counts words from `inlineToText` across `blocks` (≈200 wpm CZ) and use it instead of the literal; optionally have `ReadingProgress` interpolate remaining minutes from the same word count and current `scrollY` ratio.

## 5. Instrument FAQ, TOC and share interactions for engagement analytics
- **Severity**: Medium
- **Lens**: Both
- **Category**: differentiation
- **File**: src/components/article/ShareBar.tsx, src/app/clanek/page.tsx (FAQ `<details>`), src/components/article/ArticleToc.tsx, src/components/article/ReadingProgress.tsx
- **Opportunity**: The page is full of intent-revealing interactions — which FAQ opened, which share channel clicked, scroll-depth milestones, TOC jumps — but none emit any event. The `ShareBar` UTM tags only fire *after* a click lands elsewhere; on-page behaviour is invisible.
- **Value**: This is a *marketing-analytics product*: instrumenting its own article is the cheapest, most on-brand proof that the team measures what it builds. Scroll-depth + FAQ-open data also tells the client which questions to answer earlier, closing the content loop.
- **Effort**: S
- **Fix sketch**: Add a tiny `track(event, props)` util and call it on `details` `onToggle` (FAQ id), `ShareBar` channel click, `ArticleToc` link click, and `ReadingProgress` 25/50/75/100% thresholds. Surface the aggregate as a demo "engagement" tile that reuses the dashboard's existing KPI card styling.
