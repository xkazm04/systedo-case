/** Per-project organic-channels store — FIRESTORE backend. One doc at
 *  `organicChannels/{projectId}` holding the {statuses, plan?} blob. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { OrganicChannelState } from "./types";

function channelsDoc(projectId: string) {
  return firestore.collection("organicChannels").doc(projectId);
}

export async function getOrganicChannels(projectId: string): Promise<OrganicChannelState | null> {
  const doc = await channelsDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as OrganicChannelState;
  } catch {
    return null;
  }
}

export async function saveOrganicChannels(projectId: string, state: OrganicChannelState): Promise<void> {
  await channelsDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearOrganicChannels(projectId: string): Promise<void> {
  await channelsDoc(projectId).delete();
}
