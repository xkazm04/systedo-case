/** Per-project organic-channels store — backend dispatcher. Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Project-scoped (the tracked channel
 *  status + pinned plan belong to the project). Server-only. Mirrors
 *  local-signals/store. */
/** KEYING INVARIANT: rows here are keyed by projectId ALONE (no uid), unlike the
 *  catalog/warehouse/project-state stores which key by (uid, projectId). This is safe
 *  ONLY because project ids are UUID-unique across all users and EVERY route into this
 *  store first passes requireOwnedProject (or rejectUnknownProject for the tenant-keyed
 *  callers) — never call it with a wire-supplied id that has not been ownership-checked.
 *  deleteProjectCascade scrubs by project id for the same reason. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { OrganicChannelState } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved channel state (statuses + optional pinned plan), or null
 *  when nothing has been tracked yet (→ seeded sample, no statuses). */
export async function getOrganicChannels(projectId: string): Promise<OrganicChannelState | null> {
  return (await backend()).getOrganicChannels(projectId);
}

/** Replace the project's channel state. */
export async function saveOrganicChannels(projectId: string, state: OrganicChannelState): Promise<void> {
  return (await backend()).saveOrganicChannels(projectId, state);
}

/** Drop a project's channel state (→ reverts to the seeded sample, no statuses). */
export async function clearOrganicChannels(projectId: string): Promise<void> {
  return (await backend()).clearOrganicChannels(projectId);
}
