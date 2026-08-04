/** Feedback store — FIRESTORE backend. One doc per submission at
 *  `feedback/{id}`. Server-only (firebase-admin is Node-only); imported lazily by
 *  the dispatcher so the LOCAL_DB path never pulls firebase-admin in. Mirrors the
 *  local backend. */
import { firestore } from "@/lib/firebase";
import type { FeedbackEntry } from "./types";

function feedbackCol() {
  return firestore.collection("feedback");
}

export async function addFeedback(entry: FeedbackEntry): Promise<void> {
  await feedbackCol().doc(entry.id).set(entry);
}

export async function listFeedback(limit = 100): Promise<FeedbackEntry[]> {
  const snap = await feedbackCol().orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as FeedbackEntry);
}
