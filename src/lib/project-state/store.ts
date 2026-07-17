/** Per-(user, project, key) state store — backend dispatcher. Resolves to the
 *  local node:sqlite store when LOCAL_DB is on, else Firestore. The backend is
 *  imported LAZILY so the LOCAL_DB path never evaluates the Firestore module.
 *  Both backends export an identical interface. Server-only.
 *
 *  SIZE ENVELOPE: each key holds ONE whole JSON blob (blob-per-key design), so
 *  growth-prone callers (content schedule, review triage, the twin) must keep a
 *  key's blob small. The Firestore backend has a hard 1 MiB document cap; the
 *  sqlite dev backend has none, so an oversized blob would 500 only in production
 *  and never in local dev. To make both backends fail identically, saveProjectState
 *  asserts a serialized-size budget BELOW the Firestore cap and throws
 *  ProjectStateTooLargeError past it — callers should prune/archive old entries
 *  rather than let a key grow unbounded. */
import { LOCAL_DB } from "@/lib/local-mode";

/** Serialized-blob budget, kept under Firestore's 1 MiB (1048576 B) document cap
 *  with headroom for the doc's other fields + Firestore's own overhead. */
export const PROJECT_STATE_MAX_BYTES = 900 * 1024;

/** Thrown by saveProjectState when a key's serialized blob exceeds the budget — a
 *  typed error so callers can distinguish "too big" from a backend/network failure. */
export class ProjectStateTooLargeError extends Error {
  readonly key: string;
  readonly bytes: number;
  constructor(key: string, bytes: number) {
    super(
      `project-state blob for key "${key}" is ${bytes} bytes, over the ${PROJECT_STATE_MAX_BYTES}-byte budget — prune old entries before saving`
    );
    this.name = "ProjectStateTooLargeError";
    this.key = key;
    this.bytes = bytes;
  }
}

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The stored blob for (user, project, key), or null if never saved (→ caller seed). */
export async function getProjectState<T>(userId: string, projectId: string, key: string): Promise<T | null> {
  return (await backend()).getProjectState<T>(userId, projectId, key);
}

/** Replace the stored blob for (user, project, key). Throws ProjectStateTooLargeError
 *  if the serialized blob exceeds PROJECT_STATE_MAX_BYTES, so both backends reject an
 *  oversized blob identically instead of only Firestore failing at its 1 MiB cap. */
export async function saveProjectState<T>(userId: string, projectId: string, key: string, data: T): Promise<void> {
  const bytes = Buffer.byteLength(JSON.stringify(data), "utf8");
  if (bytes > PROJECT_STATE_MAX_BYTES) throw new ProjectStateTooLargeError(key, bytes);
  return (await backend()).saveProjectState<T>(userId, projectId, key, data);
}

/** Drop EVERY stored blob for (user, project, *) — all keys at once. */
export async function deleteProjectState(userId: string, projectId: string): Promise<void> {
  return (await backend()).deleteProjectState(userId, projectId);
}
