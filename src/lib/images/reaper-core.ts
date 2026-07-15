/** Pure decision logic for the Leonardo generation reaper — framework-free,
 *  firebase-free, no I/O, so the "what may we delete?" rule is fixture-testable in
 *  isolation. The orchestration (list the ledger, list referenced ids, call the
 *  Leonardo client) lives in ./reaper.
 *
 *  The problem it solves: every Creative Studio generation makes N candidates but
 *  only the winner is ever saved, so the other N-1 candidates' generation leaks on
 *  Leonardo's storage forever (cleanupGeneration existed but was never called).
 *
 *  The rule — a generation is reapable when BOTH hold:
 *    1. it is NOT referenced by a saved winner (referencedIds), and
 *    2. it is older than the grace window.
 *
 *  The nobg (background-removal) constraint drives (1): a saved winner can still be
 *  re-derived with a transparent background, which needs the winner's cloud image —
 *  and therefore its generation — to still exist. Because every saved winner's
 *  generationId is in `referencedIds`, a saved winner's generation is NEVER reaped,
 *  at any age, so a nobg re-derivation stays possible for the whole life of the
 *  saved creative. Only the discarded, unsaved generations (the actual leak) age out
 *  past the grace window and get deleted. */

/** One tracked generation from the ledger — the id and when it was created. */
export interface GenerationRecord {
  generationId: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
}

export const DEFAULT_GRACE_MS = 48 * 60 * 60 * 1000; // 48h

/** The generationIds that may be deleted from Leonardo: unreferenced AND older than
 *  the grace window. A referenced (saved-winner) generation is kept regardless of
 *  age. A record with an unparseable/absent createdAt is treated as NOT-yet-expired
 *  (kept) — we never reap on missing provenance. */
export function generationsToReap(
  records: GenerationRecord[],
  referencedIds: ReadonlySet<string>,
  now: Date,
  graceMs: number = DEFAULT_GRACE_MS
): string[] {
  const cutoff = now.getTime() - Math.max(0, graceMs);
  const out: string[] = [];
  for (const r of records) {
    if (!r.generationId) continue;
    if (referencedIds.has(r.generationId)) continue; // saved winner — nobg must survive
    const created = Date.parse(r.createdAt);
    if (!Number.isFinite(created)) continue; // no provenance → don't reap
    if (created < cutoff) out.push(r.generationId);
  }
  return out;
}
