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

/** WP S2 — the (owner, project) work list for the `twin-dispatch` ledger step.
 *
 *  Two reads rather than an owner field on every twin doc: the first names the
 *  projects that actually HAVE a twin, the second maps a project back to the user
 *  whose subcollection it lives in (`users/{uid}/projects/{pid}`). A project whose
 *  doc is gone (a mid-delete race) drops out of the work list rather than being
 *  dispatched under a guessed owner. Mirrors `listConversionTenants` exactly. */
export async function listTwinTenants(limit = 500): Promise<{ userId: string; projectId: string }[]> {
  const twins = await firestore.collection("twins").select().limit(limit).get();
  const projectIds = twins.docs.map((d) => d.id).sort();
  if (projectIds.length === 0) return [];

  const owners = new Map<string, string>();
  const projects = await firestore.collectionGroup("projects").select().get();
  for (const doc of projects.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (uid) owners.set(doc.id, uid);
  }

  const out: { userId: string; projectId: string }[] = [];
  for (const projectId of projectIds) {
    const userId = owners.get(projectId);
    if (userId) out.push({ userId, projectId });
  }
  return out;
}
