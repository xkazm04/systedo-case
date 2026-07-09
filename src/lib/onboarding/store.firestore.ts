/** Per-project onboarding store — FIRESTORE backend. One doc at
 *  `onboarding/{projectId}` holding the {scan, scanApplied, dismissed} blob.
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so
 *  the LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend. */
import { firestore } from "@/lib/firebase";
import type { OnboardingState } from "./types";

function onboardingDoc(projectId: string) {
  return firestore.collection("onboarding").doc(projectId);
}

export async function getOnboarding(projectId: string): Promise<OnboardingState | null> {
  const doc = await onboardingDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return null;
  }
}

export async function saveOnboarding(projectId: string, state: OnboardingState): Promise<void> {
  await onboardingDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearOnboarding(projectId: string): Promise<void> {
  await onboardingDoc(projectId).delete();
}
