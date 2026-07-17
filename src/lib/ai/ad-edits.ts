/** Persistence for AdGenerator's in-place headline/description edits — the one
 *  hand-crafted artifact that used to live only in transient component state, so
 *  a refresh, a history-chip switch or a re-generate silently discarded it while
 *  the form draft and the raw generation were both persisted.
 *
 *  Edits are keyed by the history entry's `savedAt` so each generation keeps its
 *  own polished copy, and the map is pruned to the entries still present in
 *  history so the slot can't grow without bound. Pure (no React, no storage) so
 *  the merge/prune logic is unit-testable. */
import type { AdResult } from "@/lib/ai-types";

/** savedAt (as string) → the user's edited copy of that generation. */
export type EditedMap = Record<string, AdResult>;

/** Parse the persisted slot; anything malformed yields an empty map. */
export function readEditedMap(raw: string | null): EditedMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as EditedMap;
    }
  } catch {
    /* corrupt slot — start fresh */
  }
  return {};
}

/** Next state of the map after (maybe) recording an edit for `savedAt`:
 *   - store `edited` under `savedAt` when there is one,
 *   - drop that key when `edited` is null (reverted to the generation),
 *  then keep only keys that still correspond to a live history entry. */
export function nextEditedMap(
  map: EditedMap,
  savedAt: number | null,
  edited: AdResult | null,
  validSavedAts: readonly number[]
): EditedMap {
  const valid = new Set(validSavedAts.map(String));
  const out: EditedMap = {};
  for (const [k, v] of Object.entries(map)) if (valid.has(k)) out[k] = v;
  if (savedAt != null) {
    const key = String(savedAt);
    if (edited) out[key] = edited;
    else delete out[key];
  }
  return out;
}

/** The stored edit for a given generation, or null when none is persisted. */
export function editedFor(map: EditedMap, savedAt: number | null): AdResult | null {
  if (savedAt == null) return null;
  return map[String(savedAt)] ?? null;
}
