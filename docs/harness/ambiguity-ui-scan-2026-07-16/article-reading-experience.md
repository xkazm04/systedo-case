# Article Reading Experience — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 4 medium / 0 low)

## 1. Reading-resume stores an absolute pixel offset with no layout invalidation or expiry
- **Severity**: High
- **Lens**: ambiguity
- **Category**: stale-resume-position
- **File**: src/components/article/reading-resume.ts:8 (and src/components/article/ReadingProgress.tsx:115)
- **Scenario**: A reader gets halfway through an article on their phone, returns a week later on a desktop (different breakpoint, different line wrapping), or returns after the article was edited/images resized. They tap "Pokračovat ve čtení" and land in the middle of an unrelated section — or past the end.
- **Root cause**: `ReadingPosition.y` is an absolute `scrollY` in pixels, valid only for the exact layout it was saved under. The fraction `p` is stored too but only used for the minutes-left label; `resumeReading()` scrolls to `resume.y`. `ts` is saved but explicitly "not used for expiry today", so a months-old position is offered forever against content that may have changed.
- **Impact**: The flagship "continue reading" feature actively misleads readers cross-device or after any content change — worse than not offering resume at all, since the reader trusts the jump.
- **Fix sketch**: Resume by fraction (`scrollTo(p * (scrollHeight - innerHeight))`) or, better, store the nearest heading id at save time and scroll to it. Add a cheap staleness gate in `shouldOfferResume` (e.g. `Date.now() - ts < 30 days`) — `ts` already exists.

## 2. Three parallel implementations of the same copy-feedback toast
- **Severity**: Medium
- **Lens**: ui
- **Category**: duplicated-toast-pattern
- **File**: src/components/article/ShareBar.tsx:184; src/components/article/CopyMarkdownButton.tsx:51; src/components/article/HeadingAnchor.tsx:53
- **Scenario**: A future tweak to the toast (position, animation, dark mode, dismiss) is made to `CopyToast` — and the visually identical inline copies in ShareBar and CopyMarkdownButton silently drift.
- **Root cause**: `CopyToast` exists precisely for this markup, but ShareBar and CopyMarkdownButton re-inline the exact same `role=status` pill instead of importing it. On the state side, HeadingAnchor and FaqPermalink hand-roll `copied` + `setTimeout(2200)` + cleanup while `useCopyFeedback` (used by the other two) encapsulates the same lifecycle — so both the view and the state of one pattern each exist twice.
- **Impact**: Style/behavior drift across the four copy affordances on the same page; every fix must be applied in 3–4 places; the 2200 ms timeout is duplicated as a magic number.
- **Fix sketch**: Replace the inline toast JSX in ShareBar/CopyMarkdownButton with `<CopyToast>`; migrate HeadingAnchor/FaqPermalink to `useCopyFeedback` (parameterize its delay if needed). Pure consolidation, no visual change.

## 3. Bottom-center overlay slot is contested: resume chip and copy toasts stack on each other
- **Severity**: Medium
- **Lens**: ui
- **Category**: overlay-collision
- **File**: src/components/article/ReadingProgress.tsx:129 (chip, `bottom-6 z-40`); src/components/article/CopyToast.tsx:15 and ShareBar.tsx:188, CopyMarkdownButton.tsx:55 (toasts, `bottom-6 z-50`)
- **Scenario**: A returning reader sees the "Pokračovat ve čtení" chip, then copies the article link or a heading permalink. The toast renders at the identical `fixed inset-x-0 bottom-6` position, z-50 over the chip's z-40 — the chip's buttons are visually buried under the toast for ~2 s. Copying a section link and the article link in quick succession likewise paints two toasts on top of each other.
- **Root cause**: Four independent islands each claim the same fixed bottom-center slot with no coordination (no shared toast host, no offset when the chip is present).
- **Impact**: Momentarily unreadable/obscured controls at the exact moment the user is interacting with them; overlapping toasts look broken. Toasts are `pointer-events-none` so nothing is unclickable, but the chip's dismiss/resume affordance disappears visually.
- **Fix sketch**: Single toast host (one `role=status` region that renders the latest message — falls out naturally from finding 2's consolidation), and lift the resume chip to `bottom-20` (or hide it while a toast is live).

## 4. The sticky-header height is encoded as three unrelated magic numbers across the context
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: magic-offset-drift
- **File**: src/components/article/ArticleToc.tsx:53 (`rootMargin: "-88px …"`); src/components/article/ReadingProgress.tsx:121 (`top-16`); src/components/article/HeadingAnchor.tsx:31 (`scroll-mt-24`)
- **Scenario**: The sticky nav grows by 8 px (a banner, a second row). The progress bar now floats mid-air or hides under the nav, anchored headings scroll under the header, and the TOC's "active section" band starts at the wrong line — three separate regressions from one change, none of them flagged by types or tests.
- **Root cause**: The same physical quantity — the sticky nav's height — is independently hardcoded as `-88px`, `top-16` (64 px), and `scroll-mt-24` (96 px), with no shared token and no comment linking them. The values don't even agree with each other, so it's unclear which (if any) is currently correct.
- **Impact**: Silent visual/scroll misalignment on any header change; a new developer cannot tell whether 88 vs 64 vs 96 is intentional slack or accumulated drift.
- **Fix sketch**: Define the offset once (CSS var `--sticky-nav-h` or a shared TS/Tailwind constant), derive all three usages from it, and comment the intentional deltas (e.g. "+8 px breathing room in the observer band").

## 5. `utmHref` silently clobbers author-set UTM parameters on external links
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: utm-overwrite
- **File**: src/components/article/ArticleBody.tsx:11
- **Scenario**: A content author links to `mionelo.cz/...?utm_source=newsletter&utm_campaign=spring-sale` inside an article body (a coordinated cross-channel campaign). The renderer unconditionally `searchParams.set`s all three UTM keys, rewriting the link to `utm_source=clanek&utm_campaign=obsah` — the author's attribution is destroyed with no warning.
- **Root cause**: The helper's contract is undocumented on this edge: the docstring covers the per-link `campaign` override but never states that any pre-existing UTM values are overwritten. `set()` replaces silently, so authored data loss is invisible in both the editor and the rendered page (the href only differs in query params).
- **Impact**: Analytics attribution corrupted for exactly the links someone cared enough to tag manually; downstream funnel numbers mis-credit "obsah" for campaign traffic. Debugging this later means diffing rendered hrefs against source content.
- **Fix sketch**: Preserve existing values — `if (!url.searchParams.has("utm_source")) …` per key (or skip stamping entirely when any `utm_*` is already present) — and state the precedence rule in the docstring. Mirror the same rule in ShareBar's `withUtm` for consistency.
