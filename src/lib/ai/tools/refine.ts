/** Shared "refine with instructions" prompt fragment for the non-gate-locked AI
 *  tools. A re-run may carry a free-text user note („kratší", „více na benefity",
 *  „vynech ceny") that steers the next iteration; the note is appended to the
 *  USER prompt only — never to the system prompt or schema — so each tool's
 *  gate/eval contract fingerprint stays untouched. Because the note travels
 *  inside the validated request, it also naturally busts the /api/ai input-hash
 *  cache (an identical re-submit no longer returns the byte-identical result).
 *  Pure helpers, unit-tested in test-unit. */

import { clamp } from "./_shared";

/** Hard length cap for a refine note (validated server-side and re-applied here
 *  so any direct caller stays bounded too). */
export const REFINE_MAX = 500;

/** Prompt lines for an optional refine note — `[]` when there is none. Safe for
 *  both builder styles: plain `.join("\n")` keeps the blank separator, builders
 *  that `.filter((line) => line !== "")` just drop it. */
export function refineLines(refine?: string): string[] {
  const note = (refine ?? "").trim();
  if (!note) return [];
  return [
    "",
    "DODATEČNÉ POKYNY UŽIVATELE k této iteraci (uprav podle nich předchozí výstup; pravidla a formát výše zůstávají v platnosti):",
    clamp(note, REFINE_MAX),
  ];
}
