/** Shared helper for the article's "copy a deep link" affordances — the heading
 *  permalinks (HeadingAnchor) and the FAQ question permalinks (FaqPermalink)
 *  build the exact same UTM-stamped artifact, so the link format lives here once.
 *  `buildSectionPermalink` is pure (unit-tested). The clipboard write itself is
 *  the shared `@/lib/clipboard` helper (`copyTextWithFallback`). */

/** The UTM tag stamped onto copied section/FAQ permalinks, so a link a reader
 *  shares is attributable in the dashboard's analytics story. The address bar
 *  itself stays clean (#id only) — only the copied artifact carries it. */
const UTM = { utm_source: "permalink", utm_medium: "anchor", utm_campaign: "clanek" } as const;

/** Build the UTM-stamped deep link for an in-page anchor (heading or FAQ item). */
export function buildSectionPermalink(origin: string, pathname: string, id: string): string {
  const url = new URL(`${origin}${pathname}`);
  for (const [key, value] of Object.entries(UTM)) url.searchParams.set(key, value);
  url.hash = id;
  return url.toString();
}
