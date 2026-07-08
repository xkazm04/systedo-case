/** Per-project competitor store — FIRESTORE backend. One doc at
 *  `competitorSets/{projectId}` holding the CompetitorSet blob. Server-only; imported
 *  lazily by the dispatcher so the LOCAL_DB path never pulls firebase-admin in. */
import { firestore } from "@/lib/firebase";
import type { CompetitorSet } from "./types";

function setDoc(projectId: string) {
  return firestore.collection("competitorSets").doc(projectId);
}

export async function getCompetitors(projectId: string): Promise<CompetitorSet | null> {
  const doc = await setDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as CompetitorSet;
  } catch {
    return null;
  }
}

export async function saveCompetitors(projectId: string, set: CompetitorSet): Promise<void> {
  await setDoc(projectId).set({ data: JSON.stringify(set), updatedAt: new Date().toISOString() });
}

export async function clearCompetitors(projectId: string): Promise<void> {
  await setDoc(projectId).delete();
}
