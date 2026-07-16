/** Per-project local-signals store — FIRESTORE backend. One doc at
 *  `localSignals/{projectId}` holding the {meta, ladder} blob. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { LocalSignals } from "./types";

function signalsDoc(projectId: string) {
  return firestore.collection("localSignals").doc(projectId);
}

export async function getLocalSignals(projectId: string): Promise<LocalSignals | null> {
  const doc = await signalsDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as LocalSignals;
  } catch {
    return null;
  }
}

export async function saveLocalSignals(projectId: string, signals: LocalSignals): Promise<void> {
  await signalsDoc(projectId).set({
    data: JSON.stringify(signals),
    updatedAt: new Date().toISOString(),
  });
}

/** Atomic read-modify-write inside a Firestore transaction (D2): the doc is read and
 *  written in one transaction, so two concurrent section imports don't read the same
 *  base and clobber each other (Firestore retries the loser against the fresh doc).
 *  The mutator gets the RAW parsed blob (the dispatcher normalizes before calling). */
export async function mutateLocalSignals(
  projectId: string,
  mutator: (prev: LocalSignals | null) => LocalSignals
): Promise<LocalSignals> {
  const ref = signalsDoc(projectId);
  return firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    let prev: LocalSignals | null = null;
    if (doc.exists) {
      const raw = doc.data()?.data;
      if (typeof raw === "string") {
        try {
          prev = JSON.parse(raw) as LocalSignals;
        } catch {
          prev = null;
        }
      }
    }
    const next = mutator(prev);
    tx.set(ref, { data: JSON.stringify(next), updatedAt: new Date().toISOString() });
    return next;
  });
}

export async function clearLocalSignals(projectId: string): Promise<void> {
  await signalsDoc(projectId).delete();
}
