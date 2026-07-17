/** Read-path guard for persisted twin blobs. Both store backends do a bare
 *  `JSON.parse(row.data) as TwinState` — a legacy blob (written before `drafts`/
 *  `channels` existed), a hand-edited doc, or a partially-written row parses fine
 *  but lacks the arrays. `resolveTwin` only guards the `getTwin` CALL, so the
 *  subsequent `mergeVoices(saved.voices, …)` / `saved.channels.length` run OUTSIDE
 *  its try and throw `TypeError` on `undefined`, bricking the twin module for that
 *  project. types.ts documents "everything the wire can supply passes through
 *  `sanitizeTwinState` first" — this makes the READ path honor that same invariant,
 *  so one bad row self-heals to a clean bounded blob instead of crashing.
 *  Pure + framework-free so it is unit-testable in isolation. */
import { sanitizeTwinState, type TwinState } from "./types";

/** Parse + sanitize a stored twin blob. Returns null only when the string is not
 *  valid JSON; a well-formed-but-malformed blob (missing/junk arrays) is coerced to
 *  a valid `TwinState`. `updatedAt` (which `sanitizeTwinState` drops) is preserved
 *  when the stored blob carried a string one, so `resolveTwin` still surfaces it. */
export function parsePersistedTwin(data: string): TwinState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  const state = sanitizeTwinState(parsed);
  const updatedAt = (parsed as { updatedAt?: unknown } | null)?.updatedAt;
  return typeof updatedAt === "string" ? { ...state, updatedAt } : state;
}
