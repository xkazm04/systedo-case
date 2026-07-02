/** Pure helpers for the per-tool generation history persisted by useAiTool.
 *  Each AI tool keeps a bounded, newest-first list of its last generations in a
 *  single localStorage slot, so a re-run no longer destroys the previous result
 *  the user paid quota for. Framework-free (unit-tested in test-unit). */

import type { AiResponse } from "../ai-types";

/** How many past generations a tool keeps. Small on purpose: the value is
 *  "get yesterday's brief back / compare two ad batches", not an archive. */
export const HISTORY_LIMIT = 5;

/** Bump when the persisted AiResponse shape changes, so a stale entry from a
 *  previous deploy is dropped on restore instead of rendered against missing
 *  fields. (Moved here from useAiTool — the guard travels with the storage.) */
export const RESULT_SCHEMA_VERSION = 1;

export interface AiHistoryEntry<T> {
  /** epoch ms when the generation arrived */
  savedAt: number;
  payload: AiResponse<T>;
}

/** Parse a persisted history slot. Accepts BOTH stored shapes:
 *   - the legacy single-result `{ v, savedAt, payload }` (pre-history deploys),
 *     migrated in place as a one-entry history, and
 *   - the current list `{ v, entries: [{ savedAt, payload }, …] }`.
 *  Anything malformed, version-mismatched or empty yields `[]`. */
export function parseStoredHistory<T>(raw: string | null): AiHistoryEntry<T>[] {
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as Record<string, unknown> | null;
    if (!stored || typeof stored !== "object" || stored.v !== RESULT_SCHEMA_VERSION) return [];
    // Legacy single-slot shape — keep the one result the user already had.
    if (stored.payload) {
      return [
        {
          savedAt: typeof stored.savedAt === "number" ? stored.savedAt : 0,
          payload: stored.payload as AiResponse<T>,
        },
      ];
    }
    if (!Array.isArray(stored.entries)) return [];
    const entries: AiHistoryEntry<T>[] = [];
    for (const item of stored.entries) {
      if (entries.length >= HISTORY_LIMIT) break; // cap on valid entries
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      if (!e.payload || typeof e.payload !== "object") continue;
      entries.push({
        savedAt: typeof e.savedAt === "number" ? e.savedAt : 0,
        payload: e.payload as AiResponse<T>,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

/** Prepend a new generation (newest first) and evict the oldest past the cap. */
export function pushHistory<T>(
  entries: AiHistoryEntry<T>[],
  entry: AiHistoryEntry<T>,
  limit = HISTORY_LIMIT
): AiHistoryEntry<T>[] {
  return [entry, ...entries].slice(0, Math.max(1, limit));
}

/** Serialize a history list into the persisted `{ v, entries }` wrapper. */
export function serializeHistory<T>(entries: AiHistoryEntry<T>[]): string {
  return JSON.stringify({ v: RESULT_SCHEMA_VERSION, entries: entries.slice(0, HISTORY_LIMIT) });
}
