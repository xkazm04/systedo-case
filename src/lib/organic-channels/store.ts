/** Per-project organic-channels store — backend dispatcher. Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Project-scoped (the tracked channel
 *  status + pinned plan belong to the project). Server-only. Mirrors
 *  local-signals/store. */
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
