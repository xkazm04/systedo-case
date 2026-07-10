/** Copy arbitrary text to the clipboard from the browser, degrading gracefully.
 *
 *  Tries the async Clipboard API first; if it is missing or rejects (older
 *  browsers, insecure contexts, denied permission), it falls back to the classic
 *  hidden-`<textarea>` + `document.execCommand("copy")` trick. Never throws — a
 *  fully unavailable clipboard simply resolves `false` (callers show an
 *  optimistic toast regardless).
 *
 *  Returns whether the copy is believed to have succeeded: `true` from the
 *  Clipboard API path, or the `execCommand` result from the fallback path.
 *
 *  Pure DOM — no framework or server-only imports — so it is safe to import from
 *  any client component (article permalinks, share bar, distribution module,
 *  dev inspector) that previously hand-rolled this exact sequence. */
export async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      /* clipboard unavailable — nothing more we can do */
    }
    document.body.removeChild(ta);
    return ok;
  }
}
