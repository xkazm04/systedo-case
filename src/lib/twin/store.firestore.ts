/** Per-project twin store — FIRESTORE backend. One doc at `twins/{projectId}`
 *  holding the {voices, channels, facts, drafts} blob. Server-only (firebase-admin
 *  is Node-only); imported lazily by the dispatcher so the LOCAL_DB path never
 *  pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import { parsePersistedTwin } from "./persisted";
import type { TwinState } from "./types";

function twinDoc(projectId: string) {
  return firestore.collection("twins").doc(projectId);
}

export async function getTwin(projectId: string): Promise<TwinState | null> {
  const doc = await twinDoc(projectId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  const raw = data?.data;
  if (typeof raw !== "string") return null;
  const state = parsePersistedTwin(raw);
  if (!state) return null;
  // The doc's own `updatedAt` field is the honest server "last saved" — surface it
  // (over any client-supplied blob `updatedAt`) so ResolvedTwin.updatedAt is real
  // instead of the effectively-always-undefined blob field it used to read.
  const updatedAt = data?.updatedAt;
  if (typeof updatedAt === "string") state.updatedAt = updatedAt;
  return state;
}

/** Atomic read-modify-write inside a Firestore transaction: the doc is read and
 *  written in one transaction (the loser retries against the fresh doc), closing the
 *  check-then-act gap between getTwin and saveTwin. The mutator gets the sanitized
 *  prev blob (or null when nothing is stored yet). Mirrors mutateLocalSignals. */
export async function mutateTwin(
  projectId: string,
  mutator: (prev: TwinState | null) => TwinState
): Promise<TwinState> {
  const ref = twinDoc(projectId);
  return firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    let prev: TwinState | null = null;
    if (doc.exists) {
      const raw = doc.data()?.data;
      if (typeof raw === "string") prev = parsePersistedTwin(raw);
    }
    const next = mutator(prev);
    tx.set(ref, { data: JSON.stringify(next), updatedAt: new Date().toISOString() });
    return next;
  });
}

export async function saveTwin(projectId: string, state: TwinState): Promise<void> {
  await twinDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearTwin(projectId: string): Promise<void> {
  await twinDoc(projectId).delete();
}
