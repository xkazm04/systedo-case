/** Merge website-scan competitor SUGGESTIONS into a project's stored set.
 *
 *  The onboarding apply used to call `saveCompetitors(...)` unconditionally, which
 *  REPLACED the whole set: a user who had curated their rivals lost them the next time
 *  they re-ran/re-applied the scan, and the unreviewed guesses that replaced them went
 *  straight into the recap/social LLM grounding. This is the fix, as a pure function:
 *
 *    · existing entries are never dropped, never reordered, never rewritten
 *      (their name, note, source and confirmed flag pass through untouched);
 *    · a suggestion whose folded name is already in the set is SKIPPED — it never
 *      downgrades a manual entry to `scan`, and never un-confirms one;
 *    · genuinely new suggestions are APPENDED as unconfirmed `scan` entries, so they
 *      are visible in the editor but excluded from grounding until the user keeps them;
 *    · the cap only ever costs SUGGESTIONS: once the set is full the remainder is
 *      reported as `dropped`, never swapped in over a stored entry.
 *
 *  Pure — the store I/O lives in the route. */
import {
  MAX_COMPETITORS,
  foldCompetitorName,
  type Competitor,
} from "./types";

export interface CompetitorMerge {
  /** the set to persist (identical to `existing` when nothing was added) */
  competitors: Competitor[];
  /** suggestions appended as new unconfirmed scan entries */
  added: number;
  /** suggestions the set already contained (folded-name match) */
  skipped: number;
  /** suggestions that did not fit under {@link MAX_COMPETITORS} */
  dropped: number;
  /** true when nothing changed — the caller can skip the write entirely */
  unchanged: boolean;
}

/** Merge scan-suggested names into the stored set. See the file header for the rules. */
export function mergeScanSuggestions(
  existing: Competitor[],
  suggestions: string[]
): CompetitorMerge {
  const competitors = [...existing];
  const seen = new Set(competitors.map((c) => foldCompetitorName(c.name)));
  let added = 0;
  let skipped = 0;
  let dropped = 0;

  for (const raw of suggestions) {
    const name = (typeof raw === "string" ? raw : "").trim().slice(0, 80);
    if (!name) continue;
    const key = foldCompetitorName(name);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    if (competitors.length >= MAX_COMPETITORS) {
      dropped++;
      continue;
    }
    seen.add(key);
    // Unconfirmed by construction: `confirmed` is absent, so isCurated() is false and
    // the entry cannot reach competitorGroundingText until the user keeps it.
    competitors.push({ name, source: "scan" });
    added++;
  }

  return { competitors, added, skipped, dropped, unchanged: added === 0 };
}
