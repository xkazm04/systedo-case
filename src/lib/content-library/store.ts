/** Per-project saved content library — the read-modify-write layer behind "your
 *  generated brief and article draft are SAVED, not just downloaded". The pure
 *  transitions + sanitizer live in ./entries; this is the thin store dispatcher.
 *  Server-only.
 *
 *  STORAGE CHOICE (documented, following the round-13/14 precedent set by
 *  lib/distribution/variants-store.ts): this store RIDES the existing
 *  `project_state` table under the key "contentLibrary" rather than adding a table
 *  and a DDL migration. Reasons:
 *   1. project_state exists for exactly this — "module state that used to live only
 *      in the browser" — and a generated brief living in `localStorage` under
 *      `systedo.ai.result.brief` is the textbook case;
 *   2. it gives BOTH backends (Firestore + LOCAL_DB sqlite) for free through the
 *      project_state trio, with no new table on either side, so "works on both
 *      backends" needs no per-backend code;
 *   3. it adds NO migration, so it cannot repeat the failure mode where a table
 *      added straight into the base SCHEMA string is never created on an existing
 *      database, and cannot collide with the shared version ledger;
 *   4. project deletion already cascades project_state, so a deleted project takes
 *      its library with it without a second cleanup path.
 *  The size question this raises is answered in ./entries: figure data-URLs are
 *  stripped, one entry is capped, and the blob is pruned oldest-first to stay far
 *  under the 900 KB dispatcher budget — a dedicated store would have bought a
 *  migration, a second cleanup path and per-backend code to hold text we can
 *  already bound.
 *
 *  Every function here is tenant-scoped by (userId, projectId); the ownership check
 *  itself belongs to the calling Server Action. */
import "server-only";
import { getProjectState, saveProjectState } from "@/lib/project-state/store";
import {
  removeEntry,
  upsertEntry,
  type ContentLibraryState,
  type SavedContentEntry,
} from "./entries";

/** The project_state key the library blob lives under. */
const LIBRARY_KEY = "contentLibrary";

/** The project's saved library, or null when nothing has ever been saved. */
export async function getContentLibrary(
  userId: string,
  projectId: string
): Promise<ContentLibraryState | null> {
  return getProjectState<ContentLibraryState>(userId, projectId, LIBRARY_KEY);
}

/** Replace the project's whole library blob. */
export async function saveContentLibrary(
  userId: string,
  projectId: string,
  state: ContentLibraryState
): Promise<void> {
  return saveProjectState(userId, projectId, LIBRARY_KEY, state);
}

/** Read-modify-write: save one (already sanitized) entry, replacing the same id in
 *  place. A store hiccup on the READ degrades to a fresh blob so a first save never
 *  fails on a missing doc; a WRITE failure propagates, because silently losing the
 *  save is the exact bug this store exists to fix. Returns the persisted blob. */
export async function recordContentEntry(
  userId: string,
  projectId: string,
  entry: SavedContentEntry
): Promise<ContentLibraryState> {
  let cur: ContentLibraryState | null = null;
  try {
    cur = await getContentLibrary(userId, projectId);
  } catch {
    cur = null;
  }
  const next = upsertEntry(cur, entry);
  await saveContentLibrary(userId, projectId, next);
  return next;
}

/** Read-modify-write: drop one entry by id. Returns the persisted blob. */
export async function deleteContentEntry(
  userId: string,
  projectId: string,
  id: string
): Promise<ContentLibraryState> {
  let cur: ContentLibraryState | null = null;
  try {
    cur = await getContentLibrary(userId, projectId);
  } catch {
    cur = null;
  }
  const next = removeEntry(cur, id);
  await saveContentLibrary(userId, projectId, next);
  return next;
}
