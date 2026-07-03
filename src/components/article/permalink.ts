/** Shared helpers for the article's "copy a deep link" affordances — the
 *  heading permalinks (HeadingAnchor) and the FAQ question permalinks
 *  (FaqPermalink) build the exact same UTM-stamped artifact, so the link format
 *  lives here once. `buildSectionPermalink` is pure (unit-tested in
 *  test-unit/article-permalink.test.mjs); `copyTextWithFallback` is browser-only. */

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

/** Copy text via the async clipboard API, degrading to the hidden-textarea
 *  trick for browsers without it. Never throws — a fully unavailable clipboard
 *  simply results in no copy (the UI toast is optimistic either way). */
export async function copyTextWithFallback(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fallback for browsers without the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* clipboard unavailable — nothing more we can do */
    }
    document.body.removeChild(ta);
  }
}
