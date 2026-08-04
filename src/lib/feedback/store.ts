/** Feedback store — backend dispatcher. Local node:sqlite when LOCAL_DB is on,
 *  else Firestore; the backend is imported LAZILY so the LOCAL_DB path never
 *  evaluates the Firestore module. Append-only (submissions are a support inbox,
 *  not user state). Server-only. Mirrors onboarding/store. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { FeedbackEntry } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** Persist one feedback submission. */
export async function addFeedback(entry: FeedbackEntry): Promise<void> {
  return (await backend()).addFeedback(entry);
}

/** Recent submissions, newest first (support/admin reads + tests). */
export async function listFeedback(limit = 100): Promise<FeedbackEntry[]> {
  return (await backend()).listFeedback(limit);
}
