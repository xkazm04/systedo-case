/** Per-project twin store — backend dispatcher. Local node:sqlite when LOCAL_DB is
 *  on, else Firestore; the backend is imported LAZILY so the LOCAL_DB path never
 *  evaluates the Firestore module. Project-scoped (the trained voice, the style
 *  facts and the outbox belong to the project). Server-only. Mirrors
 *  organic-channels/store. */
/** KEYING INVARIANT: rows here are keyed by projectId ALONE (no uid), unlike the
 *  catalog/warehouse/project-state stores which key by (uid, projectId). This is safe
 *  ONLY because project ids are UUID-unique across all users and EVERY route into this
 *  store first passes requireOwnedProject (or rejectUnknownProject for the tenant-keyed
 *  callers) — never call it with a wire-supplied id that has not been ownership-checked.
 *  deleteProjectCascade scrubs by project id for the same reason. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { TwinState } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved twin, or null when nothing has been trained yet (→ the
 *  seeded per-type sample). */
export async function getTwin(projectId: string): Promise<TwinState | null> {
  return (await backend()).getTwin(projectId);
}

/** Replace the project's twin state. */
export async function saveTwin(projectId: string, state: TwinState): Promise<void> {
  return (await backend()).saveTwin(projectId, state);
}

/** ATOMIC per-project read-modify-write. The `mutator` receives the current sanitized
 *  blob (or null) and returns the next; the read and write happen inside ONE backend
 *  transaction, so a send and a concurrent full-state save can't read the same base and
 *  clobber each other (the send-race / lost-update the two twin write paths shared).
 *  Use this instead of getTwin→saveTwin whenever the write depends on the prior state. */
export async function mutateTwin(
  projectId: string,
  mutator: (prev: TwinState | null) => TwinState
): Promise<TwinState> {
  return (await backend()).mutateTwin(projectId, mutator);
}

/** Drop a project's twin (→ reverts to the seeded sample: untrained, no outbox). */
export async function clearTwin(projectId: string): Promise<void> {
  return (await backend()).clearTwin(projectId);
}

/** One tenant that owns a stored twin. */
export interface TwinTenant {
  userId: string;
  projectId: string;
}

/** WP S2 — every project with a stored twin, joined back to its OWNER.
 *
 *  The twin store is project-keyed (see the keying invariant above), which is fine
 *  for every request path because a guard has already established the owner. A CRON
 *  has no request and therefore no owner, and it needs one: the outbound event bus
 *  and the activity feed are `(userId, projectId)`-keyed. So this is the join —
 *  exactly the `listConversionTenants` bridge W3-C built for the same reason, and
 *  for the same reason it lives here rather than as an owner column on every row.
 *  A project whose row is gone (a mid-delete race) simply drops out of the work
 *  list rather than being processed under a guessed owner. */
export async function listTwinTenants(limit = 500): Promise<TwinTenant[]> {
  return (await backend()).listTwinTenants(limit);
}
