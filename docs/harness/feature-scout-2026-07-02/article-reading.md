# Feature Scout — Article Reading Experience (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/app/clanek/page.tsx, src/components/article/ArticleBody.tsx, src/components/article/ArticleToc.tsx, src/components/article/Breadcrumbs.tsx, src/components/article/HeadingAnchor.tsx, src/components/article/ReadingProgress.tsx, src/components/article/ShareBar.tsx, src/components/article/section-store.ts, tests/clanek-anchors.spec.ts

## 1. Give mobile readers a table of contents (collapsible, above the body)
- **Impact**: 8/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/app/clanek/page.tsx:185`
- **Opportunity**: The entire TOC apparatus — sticky rail, IntersectionObserver active-section tracking, permalink→highlight sync via section-store — is wrapped in `hidden lg:block`, so below 1024px it simply doesn't exist. Mobile readers (typically the majority of content traffic) get a 12-minute article with zero in-page navigation; the section-permalink touch affordance was added (HeadingAnchor `[@media(hover:none)]`), but there is no way to *jump* to a section.
- **Why valuable**: In-page navigation is the single most expected long-form reading feature; its absence on the dominant device class undercuts the "content craft showcase" the page exists to demonstrate.
- **Build sketch**: Render a `lg:hidden` `<details>` block ("Obsah článku") between the header section and the body in page.tsx, fed by the same `toc` array already computed from `tableOfContents(article)` — anchor `<a href="#id">` links need no JS at all. Optional polish as a tiny client child: close the `<details>` on link tap and call `announceSection(id)` so the desktop/mobile behaviors share the section-store contract. Extend `tests/clanek-anchors.spec.ts` with a mobile-viewport case.

## 2. Export the article as Markdown ("Copy for AI" + a text route)
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/lib/article.ts:158`
- **Opportunity**: The article already lives as a typed block model (`Block`/`Inline` unions, validated by `parseArticle`), which makes a lossless Markdown serialization a ~60-line pure function — yet the only export surface is social share links. Docs and content sites now routinely ship "Copy page as Markdown / open in ChatGPT" affordances and `llms.txt`; this page has the perfect data model for it and doesn't use it.
- **Why valuable**: For readers it's a practical "take this with me / feed it to my assistant" feature; for a reviewer it demonstrates the payoff of the headless JSON model better than any comment could.
- **Build sketch**: Add a framework-free `articleToMarkdown(article)` (headings, lists, callouts as blockquotes, stat/figure/faq sections; reuse `inlineToText` for inline flattening) next to `src/lib/article.ts`. Server page passes the pre-serialized string to a small client button beside ShareBar that copies it (reuse ShareBar's clipboard+toast pattern) — or wire `downloadText` from `src/lib/export.ts` for a `.md` download. Optionally add a `GET /clanek/markdown` route handler returning `text/markdown`. No LLM call anywhere, so no gate exposure; add a unit test asserting round-trip block coverage (the `BLOCK_TYPES` set is the checklist).

## 3. Make FAQ questions deep-linkable and auto-open the targeted one
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/app/clanek/page.tsx:214`
- **Opportunity**: Each FAQ answer is a `<details key={i}>` with no `id` — the page's deep-linking story (heading permalinks with UTM, TOC hash sync, FAQPage JSON-LD) stops dead at the FAQ. You can't link a customer/colleague to a specific answer, and arriving with a hash can't open the accordion.
- **Why valuable**: FAQ answers are the most share-worthy atoms of a support-style article, and the page already trains readers to expect section permalinks; the FAQPage rich result can land users on a question the page then can't reveal.
- **Build sketch**: Add optional `id` to `FaqItem` (article.ts:76) with a slug fallback + a `parseArticle` uniqueness check mirroring the heading-id check. Render `<details id={...}>` and a compact copy-permalink affordance reusing the HeadingAnchor UTM-stamped copy pattern (`utm_source=permalink`). A tiny client effect (read `location.hash` in `useEffect`, listen to `hashchange` — LANDMINE 2: never during render) sets `open` on the matching `<details>` and scrolls with the existing `scroll-mt` convention.

## 4. Remember reading position and offer a "Pokračovat ve čtení" resume chip
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/article/ReadingProgress.tsx:7`
- **Opportunity**: ReadingProgress already computes exact scroll progress on every frame, then throws it away. A 12-minute article (`meta.readingMinutes`) is read in multiple sittings, but a returning reader always starts at the top with no memory of where they left off.
- **Why valuable**: Resume-reading is a standard long-form pattern (news apps, Medium, docs) that directly serves the case study's "reader engagement" narrative — and it's nearly free given the progress plumbing that already exists.
- **Build sketch**: In ReadingProgress's existing rAF handler, debounce-persist `{scrollY, ts}` to `localStorage` (keyed by pathname). On mount, read it via a lazy `useState(() => ...)` initializer (LANDMINE 2: no `Date.now()`/storage reads during render) and, if progress was >5% and <95%, render a dismissible fixed chip ("Pokračovat ve čtení") that scrolls back smoothly and then clears itself. Also show remaining minutes on the chip: `Math.ceil(readingMinutes * (1 - progress))` — pass `readingMinutes` as a prop from page.tsx.

## 5. Print/PDF-friendly article rendering (expand FAQ, hide chrome)
- **Impact**: 5/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/app/clanek/page.tsx:136`
- **Opportunity**: Printing or save-as-PDF is the classic offline path for a buying-guide article, but today it emits the reading-progress bar, share pill row, empty TOC column, TaskPager, and — worst — every FAQ answer collapsed (closed `<details>` content doesn't print). No `print:` utility exists anywhere in `src/`.
- **Why valuable**: A parents' buying guide (merino sizing/care) is exactly the genre people print or PDF; a broken printout undermines the content-quality story at the last step.
- **Build sketch**: Add Tailwind `print:hidden` to ReadingProgress's wrapper, ShareBar, the TOC `<aside>`, AuthorBio's action links and TaskPager; `print:break-inside-avoid` on callout/stat/figure cards. For the FAQ, a ~10-line client hook (in the page's one existing client seam or a tiny `PrintExpand` island) that opens all `<details>` on `beforeprint` and restores prior state on `afterprint`. Verify with `page.emulateMedia({ media: "print" })` in a Playwright spec alongside `tests/clanek-anchors.spec.ts`.
