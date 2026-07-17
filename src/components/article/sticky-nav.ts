/** Single source for the one physical quantity three article-reading surfaces
 *  each used to hardcode independently — the sticky site nav's height (article-
 *  reading #4). The site Nav is Tailwind `h-16` (4rem = 64px); every scroll
 *  offset that must clear it is derived from that here, with the intentional
 *  deltas named, so a nav height change updates all of them together. */

/** Height of the sticky site nav (`src/components/site/Nav.tsx` → `h-16`). */
export const STICKY_NAV_H = 64;

/** Top of the TOC IntersectionObserver band: nav height + a little breathing
 *  room, so the "active section" starts just below the nav rather than under it.
 *  Fed into ArticleToc's `rootMargin` (`-88px 0px …`). */
export const TOC_OBSERVER_TOP_MARGIN = STICKY_NAV_H + 24; // 88

/** Scroll-margin above an anchored heading so it lands below the nav (with a bit
 *  more headroom than the observer band) when a permalink scrolls to it. */
export const HEADING_ANCHOR_OFFSET = STICKY_NAV_H + 32; // 96
