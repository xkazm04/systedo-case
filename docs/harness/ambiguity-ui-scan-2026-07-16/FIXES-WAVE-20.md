# Fixes — Wave 20 (Article reading experience + publishing pipeline)

Module-clustered tail wave over the article reading UI and the article/reporting
publishing pipeline. 1 High + 6 Medium + 1 Low = 8 findings, all fixed. No
findings skipped. Publishing #1 (microsite ownership guard) and #2 (article
provenance honesty) were closed in earlier waves — confirmed still resolved
(`microsite-identity.test.mjs`, the provenance cases in `article-validate.test.mjs`)
and left untouched.

## Commits

| Commit | Finding | Scope | One-line |
|--------|---------|-------|----------|
| 8af2a96 | reading #1 (High) | reading-resume.ts, ReadingProgress.tsx | resume by fraction + 30-day staleness gate |
| 66567b1 | reading #2 (M) | ShareBar, CopyMarkdownButton, HeadingAnchor, FaqPermalink | consolidate the four copy toasts |
| 7f7bc28 | reading #3 (M) | ReadingProgress.tsx | lift resume chip above the toast slot |
| 3145206 | reading #4 (M) | sticky-nav.ts (new), ArticleToc, ReadingProgress, HeadingAnchor | one source for the three nav offsets |
| 68a672f | reading #5 (M) | ArticleBody.tsx, ShareBar.tsx | preserve author-set UTM params |
| 3a086e4 | publishing #3 (M) | article-validate.ts | validate anchors across heading+FAQ namespace |
| 8c9e50f | publishing #4 (M) | article-markdown.ts | escape content metachars + baseUrl absolutization |
| e16e7c2 | publishing #5 (Low) | article-og.tsx | truncate OG eyebrow/footer fields |

## Narratives

**reading #1 — stale/mislaid resume.** `resumeReading` scrolled to a stored
absolute `scrollY`, valid only for the exact layout it was saved under, and any
saved position was offered forever. Cross-device or post-edit returns landed the
reader in an unrelated section. `shouldOfferResume` now expires positions older
than `RESUME_MAX_AGE_MS` (30 days, via the already-stored `ts`; takes an optional
`now` for testability), and `resumeReading` scrolls to the stored progress
*fraction* against the current layout via a new pure `resumeScrollTop(progress, maxScroll)`.

**reading #2 — duplicated toast.** ShareBar/CopyMarkdownButton re-inlined the
`CopyToast` markup and HeadingAnchor/FaqPermalink hand-rolled the
`copied` + `setTimeout(2200)` lifecycle that `useCopyFeedback` already owns. Both
the view and the state of one pattern existed multiple times. Migrated all four to
the shared `CopyToast` component and `useCopyFeedback` hook. No visual/behavioral change.

**reading #3 — overlay collision.** The resume chip and the four copy toasts both
claimed `fixed inset-x-0 bottom-6`; a toast (z-50) buried the chip (z-40) for ~2 s.
Chip moved to `bottom-20`.

**reading #4 — magic offsets.** The sticky nav height was hardcoded three
inconsistent ways (`-88px` observer margin, `top-16` progress bar, `scroll-mt-24`
heading margin). Added `sticky-nav.ts` (`STICKY_NAV_H = 64` — matching the site
`Nav` `h-16` — plus named deltas) and derived all three: the observer `rootMargin`
from `TOC_OBSERVER_TOP_MARGIN`, the progress bar `top` inline-styled from
`STICKY_NAV_H`, the heading `scrollMarginTop` from `HEADING_ANCHOR_OFFSET`.

**reading #5 — UTM clobber.** `utmHref` unconditionally overwrote utm_source/
medium/campaign, destroying an author's deliberately tagged cross-channel link.
Now leaves a URL untouched when it already carries any `utm_*` param; the same
guard is mirrored in ShareBar's `withUtm` and the precedence rule is documented.

**publishing #3 — validator namespace asymmetry.** The validator unified heading
and FAQ ids for uniqueness but validated anchor *targets* against headings only
and collected anchor *sources* from blocks only. `anchorHrefs` now also scans FAQ
answers, and targets resolve against `ids ∪ faqIds`. Error text became
"…has no matching heading or faq id" (two pinned test assertions updated to match).

**publishing #4 — incomplete Markdown escaping.** Only table pipes were escaped,
so content `*_#[]`, a `]` in link text or `)` in an href, or `**` in a bold run
corrupted the portable twin. Added `escapeMd` (every text run + link text) and
`mdHref` (percent-encodes parens; absolutizes site-relative hrefs/srcs against an
optional `baseUrl` threaded through `blockToMarkdown`/`faqToMarkdown`/
`articleToMarkdown`).

**publishing #5 — OG overflow.** Only title/perex were truncated; the eyebrow
category and footer author/role rendered raw and clipped mid-glyph on the fixed
1200px canvas. Capped category (40), author (40), role (48) with the existing helper.

## Verification

- `npx tsc --noEmit`: clean before every commit and at end.
- `npm run test:unit`: **1756 / 1756 pass, 0 fail** (baseline 1750 + 6 new tests).
- New tests: reading-resume staleness gate + `resumeScrollTop` (×2); validator FAQ
  dead-anchor + valid FAQ deep-link (×2); Markdown metachar escaping + `mdHref`
  baseUrl (×2).
- LLM contract eval green (unchanged; no LLM code touched).
- `git status`: the four untracked `uat/driver/*.mjs` remain untracked; nothing else.

## Behavior changes needing sign-off

- **reading #1**: resume now jumps to the stored progress *fraction*, not the exact
  saved pixel — slightly different landing spot vs before, and saved positions
  older than 30 days no longer offer the chip at all.
- **reading #5 / publishing #4**: attribution/serialization semantics changed
  (author UTM preserved; content metachars escaped). Both are the intended fixes;
  flagged in case any downstream consumer parsed the old (lossy) output.
- **publishing #3**: articles that previously *passed* the validator while linking
  to a dead anchor inside a FAQ answer will now fail the build loudly (correct, but
  could surface a latent bad link in existing content).

## Patterns

- Existing tests encoded assumptions the fix legitimately changes (an ancient
  `ts: 1` fixture that the new staleness gate rejects; a pinned error-message
  substring). Fix-forward the test alongside the behavior, in the same commit.
- Tailwind class magic numbers can't reference a JS constant, so consolidating a
  shared dimension means converting the class to an inline `style` derived from the
  constant — done for `top-16` and `scroll-mt-24`, observer margin stayed in JS.
