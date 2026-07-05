/** Project catalog store — FIRESTORE backend (cloud / production). Offerings persist
 *  as one JSON blob at `users/{userId}/projectCatalogs/{projectId}`. Server-only
 *  (firebase-admin is Node-only); the dispatcher imports this lazily so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { Offering } from "./offering";

function catalogDoc(userId: string, projectId: string) {
  return firestore.collection("users").doc(userId).collection("projectCatalogs").doc(projectId);
}

/** The project's saved offerings, or null if it has never been saved (→ seed). */
export async function listOfferings(userId: string, projectId: string): Promise<Offering[] | null> {
  const doc = await catalogDoc(userId, projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Offering[]) : null;
  } catch {
    return null;
  }
}

/** Replace the project's whole catalog. */
export async function saveOfferings(userId: string, projectId: string, offerings: Offering[]): Promise<void> {
  await catalogDoc(userId, projectId).set({
    data: JSON.stringify(offerings),
    updatedAt: new Date().toISOString(),
  });
}
