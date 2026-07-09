/** Per-project onboarding store — backend dispatcher. Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Project-scoped. Server-only. Mirrors
 *  organic-channels/store. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { OnboardingState } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's onboarding state, or null when the project is untouched (fresh). */
export async function getOnboarding(projectId: string): Promise<OnboardingState | null> {
  return (await backend()).getOnboarding(projectId);
}

/** Replace the project's onboarding state. */
export async function saveOnboarding(projectId: string, state: OnboardingState): Promise<void> {
  return (await backend()).saveOnboarding(projectId, state);
}

/** Drop a project's onboarding state. */
export async function clearOnboarding(projectId: string): Promise<void> {
  return (await backend()).clearOnboarding(projectId);
}
