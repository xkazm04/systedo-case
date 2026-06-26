# Article Reading Experience — Ambiguity + Business scan
> Context: The published `/clanek` article page — typed block renderer, sticky TOC, reading-progress bar, hover-to-copy heading permalinks, UTM share bar, FAQ accordion and rich JSON-LD.
> Files analyzed: 9
> Total findings: 5

## 1. No in-article lead capture / conversion step at the natural end of reading
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/app/clanek/page.tsx:192-244 (article tail), src/lib/article.ts:61-69 (Block union)
- **Problem/Opportunity**: The article showcases SEO/content craft beautifully, but a reader who finishes has nowhere to convert: the tail is tags → FAQ → `TaskPager` (case-study nav). The only CTAs are author-supplied `cta` blocks (ArticleBody.tsx:153) that link out — there is no email/newsletter opt-in or lead-magnet capture. For a marketing-agency case study, "great content, zero funnel" is the most conspicuous gap.
- **Why it matters**: A reviewer judging content marketing will look for the conversion mechanism; demonstrating funnel thinking (capture → nurture) is higher-signal than another rich-result tweak.
- **Fix sketch**: Add a `lead`/`subscribe` block to the `Block` union (article.ts:61) and a renderer case in ArticleBody.tsx, plus a fixed end-of-article opt-in card in page.tsx after the FAQ. Keep it honest for a portfolio: a static, accessible `<form>` posting to a stub route (or a "demo only" note) rather than a fake live backend — the point is to show the pattern, not invent monetization.

## 2. Section permalinks are unattributed while share links carry UTM — the reach loop is half-closed
- **Lens**: 🚀 Business (with 🌀 inconsistency)
- **Value**: Medium
- **Effort**: S
- **File**: src/components/article/HeadingAnchor.tsx:58, src/components/article/ShareBar.tsx:43-49,183-198
- **Problem/Opportunity**: ShareBar stamps every channel with `utm_source/medium/campaign` so the dashboard "can attribute the reach" (ShareBar.tsx:37-41). But HeadingAnchor copies a bare `origin + pathname + #id` with no UTM, so when a reader shares a *specific section* (a strong engagement signal) that traffic lands as direct/organic and is undercounted. Separately, the outbound share/copy clicks themselves fire no analytics event — only inbound attribution works, so which network/section was shared is invisible.
- **Why it matters**: The app explicitly tells an attribution story; the most interesting behaviour (deep-section sharing) is exactly what falls through the gap.
- **Fix sketch**: Route HeadingAnchor's copied link through the same `withUtm` helper (e.g. `utm_source=permalink`, preserving the `#id`), exporting `withUtm` from ShareBar or a small shared util. Optionally add a `data-share-channel` hook / lightweight event on copy + social clicks.

## 3. Four independently-defined "below the sticky nav" offsets that silently disagree
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/components/article/ArticleToc.tsx:53, src/components/article/ReadingProgress.tsx:31, src/components/article/HeadingAnchor.tsx:28-29, src/app/clanek/page.tsx:184
- **Problem/Opportunity**: The nav offset is encoded as a magic number in four places that don't match: progress bar `top-16` (64px), TOC sticky `top-24` (96px), heading `scroll-mt-24` (96px), and the IntersectionObserver `rootMargin: "-88px ..."` (88px). Why 88 vs 96 vs 64 is unexplained, and nothing ties them to the actual nav height. If the nav ever resizes, anchors scroll under the header and the TOC's "active" band misaligns — a classic happy-path coupling.
- **Why it matters**: These constants must move together but currently can't; the discrepancy is a latent layout bug waiting on a nav height change.
- **Fix sketch**: Define one `--nav-h` CSS variable (or a `NAV_OFFSET` constant) and derive `scroll-mt`, the sticky `top`, the progress-bar `top`, and the rootMargin top from it. Add a one-line comment recording why the band's lower bound is `-55%`.

## 4. Empty / heading-less article renders a dangling, labelled-but-empty TOC sidebar
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/app/clanek/page.tsx:182-190, src/components/article/ArticleToc.tsx:24,32
- **Problem/Opportunity**: `tableOfContents` returns only H2 blocks (article.ts:107-111); if an article has no H2s it returns `[]`. The page still renders the `<aside>` with the "Obsah článku" label and an empty bordered `<nav>` (page.tsx:183-189), while ArticleToc bails in its effect (`if (headings.length === 0) return;`) and seeds `active = items[0]?.id ?? ""` — i.e. a visible empty rail with a heading and no links. The happy path assumes H2s always exist.
- **Why it matters**: A reusable typed renderer should degrade cleanly; a labelled empty sidebar looks broken and wastes the 220px column.
- **Fix sketch**: Gate the whole `<aside>` on `toc.length > 0` in page.tsx (and/or have ArticleToc render `null` when `items` is empty), so the body column spans full width when there is nothing to list.

## 5. Touch readers can never reach the section-permalink feature, with no fallback
- **Lens**: 🌀 Ambiguity (UX trade-off)
- **Value**: Low
- **Effort**: M
- **File**: src/components/article/HeadingAnchor.tsx:38-39,98
- **Problem/Opportunity**: The "#" copy button is `opacity-0`, revealed via `group-hover`/`focus-visible`, and hard-gated behind `[@media(hover:hover)]:inline-flex`. The comment records the reasoning (avoid an invisible, unrevealable control on touch), but the net effect is that all touch/tablet/phone users — typically the majority of content traffic — lose the deep-link-to-section capability entirely, with no alternative affordance. The trade-off is documented but its cost (excluding mobile) is implicit.
- **Why it matters**: Section deep-linking is a sharing/engagement feature; silently disabling it for mobile contradicts the attribution ambitions in finding #2.
- **Fix sketch**: Offer a touch-reachable path instead of a dead end — e.g. a small always-visible copy glyph on touch, or a "copy section link" action surfaced from the sticky TOC items (which already track the active section via `section-store.ts`). Record the chosen alternative in the existing comment block.
