# Article Reading Experience

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Unguarded `decodeURIComponent` on the URL hash crashes the FAQ deep-link island

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/article/FaqHashOpen.tsx:16`
- **Scenario**: A reader opens (or is sent) an article URL whose fragment contains a malformed percent-escape — e.g. `/clanek#50%off`, `/clanek#%`, `/clanek#%E0%A4` — or any campaign/chat link that appended a stray `%`. On mount `openFromHash()` runs `decodeURIComponent(window.location.hash.replace(/^#/, ""))` **before** the `idSet.has(id)` guard, so the malformed sequence throws `URIError` immediately. The same throw recurs on every `hashchange`.
- **Root cause**: The code assumes `window.location.hash` is always a well-formed, decodable string; it decodes first and validates second, with no try/catch around the decode (unlike the sibling `reading-resume.ts`, which decodes/parses everything defensively).
- **Impact**: The `URIError` is thrown synchronously inside a `useEffect` callback, which React 19 propagates to the nearest error boundary (or unmounts the client tree if none exists) — the article's client interactivity dies on load from a crafted/mistyped link; on `hashchange` it becomes an uncaught listener exception that fires on every subsequent hash edit.
- **Fix sketch**: Wrap the decode in a helper that returns `null` on failure, e.g. `let id: string; try { id = decodeURIComponent(...); } catch { return; }`, then keep the existing `if (!id || !idSet.has(id)) return;` guard. Mirror `parseReadingPosition`'s "malformed input degrades to no-op" posture.

## 2. "Continue reading" jumps to a stale absolute pixel offset, ignoring the stored progress fraction

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/article/ReadingProgress.tsx:115`
- **Scenario**: A reader reaches ~60 % of an article on a wide desktop window (saved as `{ y: 4200, p: 0.6 }`), then returns later on a phone / narrower window / after the article was edited — anything that changes total document height. The resume chip is offered, and clicking it runs `window.scrollTo({ top: resume.y })` with the raw stored pixel offset. On the taller narrow layout `y=4200` might now be 30 % of the page (or, on a shortened edited article, be clamped to the bottom), landing the reader far from where they actually left off.
- **Root cause**: The position is persisted with BOTH an absolute `y` and a viewport-independent progress fraction `p`, but the resume jump uses only `y`. Absolute scroll offsets are not stable across reflow, viewport width, font metrics, or content edits — and `ts` is explicitly never used for expiry, so a months-old offset is honored verbatim.
- **Impact**: Wrong scroll destination on resume (the headline feature of the resume chip) whenever the reader's viewport or the article changed between sittings — silently degrades rather than errors.
- **Fix sketch**: Derive the target from the durable fraction: `const max = document.documentElement.scrollHeight - window.innerHeight; window.scrollTo({ top: Math.round(resume.p * max), ... })`, keeping `y` only as a same-layout fast path. Optionally add a `ts`-based staleness cap in `shouldOfferResume`.

## 3. TOC "you are here" highlight snaps to the LAST section on load for intro-heavy / short articles

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/article/ArticleToc.tsx:44`
- **Scenario**: An article whose first `<h2>` sits below the 45 %-of-viewport line at rest (a long perex/intro, or a short non-scrollable piece) is opened at the top. The IntersectionObserver's initial callback finds **no** heading inside the `-88px 0px -55% 0px` band, so `inBand` is empty; the `else` branch then evaluates `atBottom = scrollY + innerHeight >= scrollHeight - 4`, which is `true` for any page shorter than (or barely taller than) the viewport, and calls `setActive(items[items.length - 1].id)`.
- **Root cause**: The "nothing in band ⇒ we must be at the bottom, highlight the last section" heuristic conflates "no heading in the narrow band" with "reader is at the end", but at initial load the reader is at the *top* with the first heading merely below the band.
- **Impact**: The desktop TOC rail highlights the wrong (final) section immediately on load and stays wrong until a heading scrolls through the band — a user-visible incorrect reading-position indicator.
- **Fix sketch**: Only trust `atBottom` when the reader has actually scrolled near the end — gate it on `scrollY > 0` (or `progress` from a shared store), otherwise fall back to the first item / leave `active` unchanged. Alternatively seed `active` from the topmost heading above the band rather than the last item.

## 4. Final reading position is dropped by the save throttle with no exit flush

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/article/ReadingProgress.tsx:73`
- **Scenario**: A reader scrolls to a new spot and navigates away (or backgrounds the tab) within `SAVE_INTERVAL_MS` (500 ms) of the previous persist. The `if (now - lastSave >= SAVE_INTERVAL_MS)` throttle skips that last write, and there is no `pagehide`/`visibilitychange`/`beforeunload` handler to flush the current position on exit, so the most-recent scroll position is never stored.
- **Root cause**: The persistence is purely leading-edge throttled with no trailing flush; it optimizes for write frequency during scroll but assumes the reader keeps scrolling long enough for the next tick, which the moment-of-leaving violates.
- **Impact**: The resume chip offers a position up to ~500 ms of scrolling stale (or the previous save entirely if the reader made one quick jump and left) — minor UX imprecision, not data loss.
- **Fix sketch**: Add a `pagehide`/`visibilitychange==="hidden"` listener in the same effect that writes the current `{ y, p, ts }` once unconditionally (bypassing the throttle), and remove it in cleanup.

## 5. Duplicated imperative `prefers-reduced-motion` matchMedia check

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/article/ReadingProgress.tsx:114`
- **Scenario**: `ReadingProgress.tsx:114` and `FaqHashOpen.tsx:25` each inline the identical `const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;` before a `scrollTo`/`scrollIntoView`. A repo grep shows these are the only two imperative reduced-motion reads (the marketing/Kinetics surfaces use framer-motion's `useReducedMotion`), and there is no shared helper. This is not the UTM/clipboard/toast/copied-flag/TocItem duplication catalogued in the 2026-07-09 report — it is a distinct, un-named pair.
- **Root cause**: Both scroll-affordance islands needed to honor reduced-motion for a programmatic scroll and each hand-rolled the media-query read rather than sharing a one-liner.
- **Impact**: Trivial today (two identical copies), but any change to the query string or a fallback for missing `matchMedia` (SSR/older engines) must be made in both places with no compiler signal.
- **Fix sketch**: Add `export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;` to a shared client util (e.g. `@/lib/clipboard`'s neighbor or a `@/lib/motion` client helper) and call it from both sites.
