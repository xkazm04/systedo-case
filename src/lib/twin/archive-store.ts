/** Per-project twin ARCHIVE store — backend dispatcher. Terminal outbox drafts
 *  (sent/rejected) evicted from the hot `twin` blob land here so audit records stop
 *  silently vanishing. Local node:sqlite when LOCAL_DB is on, else Firestore; the
 *  backend is imported LAZILY so the LOCAL_DB path never evaluates the Firestore
 *  module. Both backends enforce the ~1000/project cap on write (oldest-evicted,
 *  logged) and expose the bounded reads the rejection-pattern learning uses.
 *  Project-scoped, server-only. Mirrors twin/store.ts. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { TwinDraft } from "./types";

function backend() {
  return LOCAL_DB ? import("./archive-store.local") : import("./archive-store.firestore");
}

/** Append terminal drafts to the archive, evicting the oldest beyond the cap.
 *  Returns how many were evicted (0 when under the cap). Idempotent by draft id. */
export async function archiveDrafts(projectId: string, drafts: TwinDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  return (await backend()).archiveDrafts(projectId, drafts);
}

/** The most-recent archived drafts (newest first), bounded by `limit`. */
export async function listArchivedDrafts(projectId: string, limit?: number): Promise<TwinDraft[]> {
  return (await backend()).listArchivedDrafts(projectId, limit);
}

/** The most-recent archived REJECTS (newest first), bounded — folded back into the
 *  rejection tally so learning doesn't regress as older rejects move to history. */
export async function listArchivedRejects(projectId: string, limit?: number): Promise<TwinDraft[]> {
  return (await backend()).listArchivedRejects(projectId, limit);
}

/** Drop a project's whole archive (→ untrain wipes history too), tally included. */
export async function clearArchive(projectId: string): Promise<void> {
  return (await backend()).clearArchive(projectId);
}

/** The durable per-project tally of what the cap has evicted — the accounting the
 *  delete writes in the same atomic step (Firestore batch / sqlite transaction),
 *  because a deleted audit record cannot testify for itself. Null until the cap
 *  first fires. One field set for both backends (archive.ts EvictionAccounting). */
export async function readEvictionAccounting(
  projectId: string
): Promise<import("./archive").EvictionAccounting | null> {
  return (await backend()).readEvictionAccounting(projectId);
}
