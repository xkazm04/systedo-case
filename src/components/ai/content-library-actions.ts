"use server";
/** Server Actions for the saved content library: save the brief (and the article
 *  draft written from it) the workspace currently holds, list what a project has
 *  saved, and delete an entry.
 *
 *  All three are ownership-guarded — a caller can only read/write the library of a
 *  project they own (their own userId × an owned projectId) — so the client-supplied
 *  projectId can't reach another tenant's work. Demo project ids are never owned, so
 *  the marketing surface stores NOTHING and lists nothing: the demo stays a demo.
 *  Mirrors components/app/modules/distribution-actions.ts, deliberately including
 *  its ownerOf() shape so the two guards can be compared line by line. */
import { requireOwnedTenantProject } from "@/lib/projects/persist-guard";
import {
  deleteContentEntry,
  getContentLibrary,
  recordContentEntry,
} from "@/lib/content-library/store";
import { libraryEntries, sanitizeEntry, type SavedContentEntry } from "@/lib/content-library/entries";

/** The signed-in caller's id IFF they own `projectId`, else null (unauthenticated,
 *  a demo/marketing id, or not their project). The handshake itself lives in the
 *  shared write-path guard — this file no longer re-derives demo-ness. */
async function ownerOf(projectId: string): Promise<string | null> {
  return (await requireOwnedTenantProject(projectId))?.uid ?? null;
}

/** Persist what the workspace currently holds. The payload is untrusted: it is
 *  sanitized and bounded before it lands (see lib/content-library/entries). Returns
 *  the saved entry's id, or null when the save was refused (unowned project, demo,
 *  or a payload with no usable brief). */
export async function saveContentEntryAction(
  projectId: string,
  payload: unknown
): Promise<{ id: string } | null> {
  const uid = await ownerOf(projectId);
  if (!uid) return null;
  const entry = sanitizeEntry(payload);
  if (!entry) return null;
  await recordContentEntry(uid, projectId, entry);
  return { id: entry.id };
}

/** Everything the project has saved, newest first ([] for an unowned/demo project
 *  or one that has never saved). */
export async function listContentEntriesAction(projectId: string): Promise<SavedContentEntry[]> {
  const uid = await ownerOf(projectId);
  if (!uid) return [];
  try {
    return libraryEntries(await getContentLibrary(uid, projectId));
  } catch {
    // A store hiccup shows an empty library rather than breaking the module; the
    // entries themselves are untouched and reappear on the next load.
    return [];
  }
}

/** Drop one saved entry. Returns the remaining entries so the caller can adopt the
 *  server's view instead of guessing at it. */
export async function deleteContentEntryAction(
  projectId: string,
  id: string
): Promise<SavedContentEntry[]> {
  const uid = await ownerOf(projectId);
  if (!uid || !id) return [];
  return libraryEntries(await deleteContentEntry(uid, projectId, id));
}
