/** Per-project revenue-goal store — FIRESTORE backend. One doc at
 *  `projectGoals/{projectId}` holding the {goal, history} blob. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import { sanitizeProjectGoal, type ProjectGoal } from "./types";

function goalDoc(projectId: string) {
  return firestore.collection("projectGoals").doc(projectId);
}

export async function getProjectGoal(projectId: string): Promise<ProjectGoal | null> {
  const doc = await goalDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return sanitizeProjectGoal(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveProjectGoal(projectId: string, goal: ProjectGoal): Promise<void> {
  await goalDoc(projectId).set({
    data: JSON.stringify(goal),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearProjectGoal(projectId: string): Promise<void> {
  await goalDoc(projectId).delete();
}
