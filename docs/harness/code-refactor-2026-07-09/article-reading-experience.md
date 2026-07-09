# Article Reading Experience

> Context #9 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 20

## 1. Three independent reimplementations of UTM link-stamping

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/article/ShareBar.tsx:40-49`
- **Scenario**: `ShareBar.withUtm(url, source)` (local, module-level `UTM_MEDIUM`/`UTM_CAMPAIGN` constants) builds the exact same "set utm_source/utm_medium/utm_campaign on a URL" artifact as `ArticleBody.utmHref(href, campaign)` at `src/components/article/ArticleBody.tsx:11-22`, and both duplicate `src/lib/distribution/utm.ts:35-41`'s `withUtm(url, { source, medium, campaign })` — whose own doc comment says "Mirrors the article ShareBar's `withUtm()` shape", proving the author knew about ShareBar's copy and wrote a third one instead of importing it.
- **Root cause**: The distribution module needed the same "brand-tag a URL" primitive later and, rather than lifting ShareBar's version into a shared module, rewrote it with a different call signature (object param, configurable medium) — and `ArticleBody` independently wrote a third variant (adds an `http(s)://` guard and a default campaign).
- **Impact**: Three call signatures for one concept (positional vs. object param, different default sourcing) mean a tagging-scheme change (new param, an encoding fix, a source-slug rule) has to be hunted down and applied in up to three places; `lib/distribution/utm.ts` is the one place a distribution-focused engineer would look, so the two article copies are the likeliest to silently drift.
- **Fix sketch**: Have `ArticleBody.utmHref` and `ShareBar`'s local `withUtm` both call `withUtm` from `src/lib/distribution/utm.ts` (`import { withUtm } from "@/lib/distribution/utm"`), passing `{ source: "clanek", medium: "content", campaign: campaign ?? "obsah" }` and `{ source, medium: UTM_MEDIUM, campaign: UTM_CAMPAIGN }` respectively; delete the two private `utmHref`/`withUtm` functions. `ArticleBody.utmHref`'s internal-link/anchor short-circuit (`if (!/^https?:\/\//i.test(href)) return href;`) stays as a caller-side guard before invoking the shared helper.

## 2. CopyMarkdownButton and ShareBar bypass this same directory's own shared copy helpers

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/article/CopyMarkdownButton.tsx:35-52,76-87`
- **Scenario**: `permalink.ts` exports `copyTextWithFallback` (clipboard API + hidden-textarea fallback) and `CopyToast.tsx` exports the bottom-center confirmation toast, and both are already reused by `HeadingAnchor.tsx` and `FaqPermalink.tsx` in this exact directory. `CopyMarkdownButton.tsx:35-52` and `ShareBar.tsx:133-153` each hand-roll a byte-for-byte identical clipboard-with-textarea-fallback block instead of calling `copyTextWithFallback`, and `CopyMarkdownButton.tsx:76-87` / `ShareBar.tsx:213-224` each hand-roll JSX that is byte-for-byte identical to `CopyToast`'s render output instead of rendering `<CopyToast>`.
- **Root cause**: `CopyMarkdownButton` and `ShareBar` were most likely written by copy-pasting the toast/clipboard pattern from an earlier component (or each other) before `permalink.ts`/`CopyToast.tsx` were carved out as the shared version for `HeadingAnchor`/`FaqPermalink`, and never got backfilled to use them.
- **Impact**: The clipboard-fallback trick and toast markup now have four copies (two shared via helpers, two inline) instead of one; a fix to the fallback (e.g. a Safari clipboard-permission quirk) or a toast styling/aria change must be applied in up to three extra places, with no compiler signal if one is missed.
- **Fix sketch**: In `CopyMarkdownButton.tsx`, replace the inline try/catch clipboard block with `await copyTextWithFallback(markdown)` (import from `./permalink`) and replace the inline toast `<div role="status">…</div>` with `{copied && <CopyToast>{t("toast")}</CopyToast>}` (import from `./CopyToast`). Apply the same two swaps in `ShareBar.tsx`'s `copyLink` and its toast block.

## 3. The "copied flag + 2200ms auto-hide timer" hook is hand-rolled 4 times

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/article/FaqPermalink.tsx:29-33,46-48`
- **Scenario**: `FaqPermalink.tsx`, `HeadingAnchor.tsx:52-57,71-74`, `CopyMarkdownButton.tsx:29-33,53-55`, and `ShareBar.tsx:120-131` (its `flashCopied`) each independently declare `const [copied, setCopied] = useState(false)` + `const timer = useRef<number | undefined>(undefined)`, clear the timer on unmount in a `useEffect`, and on success run `setCopied(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCopied(false), 2200);` — the same ~7-line block, four times, with the same magic `2200`.
- **Root cause**: No shared hook exists for "flash a boolean true, then auto-reset after N ms, cancelling on unmount"; each copy-affordance component grew its own copy alongside its own action (clipboard, permalink, share) rather than extracting the state-machine part.
- **Impact**: Low risk today (all four copies behave identically), but any future change to the affordance — e.g. a longer toast duration, or debouncing rapid re-clicks — needs the same edit in four files; a fifth copy-button component would very likely paste a fifth copy instead of noticing the pattern.
- **Fix sketch**: Add a small hook, e.g. `useCopyFeedback(ms = 2200)` returning `[copied, flash]`, to `src/components/article/` (or a shared client-hooks location if one exists) encapsulating the `useState`/`useRef`/cleanup-`useEffect`/timeout logic; have all four components call `const [copied, flash] = useCopyFeedback();` and replace their `setCopied(true); …` sequences with `flash()`.

## 4. `TocItem` interface duplicated verbatim in ArticleToc and MobileToc

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/article/ArticleToc.tsx:12-15`
- **Scenario**: `ArticleToc.tsx:12-15` and `MobileToc.tsx:12-15` each declare an identical local `interface TocItem { id: string; text: string; }`. Both components are fed by the same call, `tableOfContents(article)` from `src/lib/article.ts:141-145`, whose return type is already the structurally identical `{ id: string; text: string }[]` — MobileToc's own doc comment even says it is "fed by the same `tableOfContents(article)` data" as the desktop rail.
- **Root cause**: `tableOfContents()`'s return type was written as an inline object-literal type rather than a named, exported type, so each consuming component re-declared its own local copy instead of importing one.
- **Impact**: Low today (the shapes can't currently drift unnoticed since both are structural matches for the same call), but a future field added to one `TocItem` (e.g. an `active`/`level` flag) risks being added to only one of the two interfaces, and a reviewer has to manually confirm both copies still match `tableOfContents()`'s real return shape.
- **Fix sketch**: In `src/lib/article.ts`, extract `export interface TocItem { id: string; text: string; }` and change `tableOfContents`'s return type to `TocItem[]`; in `ArticleToc.tsx` and `MobileToc.tsx`, delete the local `interface TocItem` and `import type { TocItem } from "@/lib/article"` instead.

## 5. Two unused public exports in reading-resume.ts

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/components/article/reading-resume.ts:40-41`
- **Scenario**: `RESUME_MIN_PROGRESS` and `RESUME_MAX_PROGRESS` are exported but only ever referenced inside the same file (`shouldOfferResume` at line 53). A repo-wide grep for both names turns up nothing outside `reading-resume.ts` — not even `test-unit/reading-resume.test.mjs`, which imports `RESUME_MIN_DISTANCE_PX` (the third threshold constant, also declared here) alongside `parseReadingPosition`, `readingPositionKey`, `remainingMinutes`, and `shouldOfferResume`, but never these two.
- **Root cause**: All three threshold constants were exported together for symmetry when the module was written, but only `RESUME_MIN_DISTANCE_PX` ended up needed by a test; the other two never gained an external caller.
- **Impact**: Minimal — two extra names in the module's public surface that nothing depends on, slightly overstating what `ReadingProgress.tsx` and the test file actually need from this module.
- **Fix sketch**: Drop the `export` keyword from `RESUME_MIN_PROGRESS` and `RESUME_MAX_PROGRESS` in `reading-resume.ts` (keep them as file-local `const`s used by `shouldOfferResume`); no other file needs a change.
