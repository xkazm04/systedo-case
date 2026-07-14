/** Per-project recaps store — backend dispatcher + read-modify-write helpers.
 *  Local node:sqlite when LOCAL_DB is on, else Firestore; the backend is imported
 *  LAZILY so the LOCAL_DB path never evaluates the Firestore module. Project-scoped
 *  (a recap belongs to the project whose data produced it). Server-only. Mirrors
 *  diagnoses/store; the pure state transitions live in ./types. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { AnalysisPeriod } from "@/lib/ai-types";
import {
  appendRecap,
  historyForPeriod,
  latestForPeriod,
  type RecapState,
  type StoredRecap,
} from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved recaps blob, or null when nothing has been saved. */
export async function getRecaps(projectId: string): Promise<RecapState | null> {
  return (await backend()).getRecaps(projectId);
}

/** Replace the project's recaps blob. */
export async function saveRecaps(projectId: string, state: RecapState): Promise<void> {
  return (await backend()).saveRecaps(projectId, state);
}

/** Drop a project's recaps (revert to the empty state). */
export async function clearRecaps(projectId: string): Promise<void> {
  return (await backend()).clearRecaps(projectId);
}

/** Read-modify-write: prepend one recap (re-capped per period) and persist. A store
 *  hiccup on the read is swallowed to a fresh blob so a first save never fails on a
 *  missing doc. Returns the stored recap. */
export async function recordRecap(
  projectId: string,
  recap: StoredRecap
): Promise<StoredRecap> {
  let cur: RecapState | null = null;
  try {
    cur = await getRecaps(projectId);
  } catch {
    cur = null;
  }
  await saveRecaps(projectId, appendRecap(cur, recap));
  return recap;
}

/** The newest recap for a period, or null. Never throws (a store hiccup degrades to
 *  "no saved recap"). */
export async function latestRecap(
  projectId: string,
  period: AnalysisPeriod
): Promise<StoredRecap | null> {
  try {
    return latestForPeriod(await getRecaps(projectId), period);
  } catch {
    return null;
  }
}

/** Every stored recap for a period, newest-first, capped for display. Never throws. */
export async function listRecaps(
  projectId: string,
  period: AnalysisPeriod
): Promise<StoredRecap[]> {
  try {
    return historyForPeriod(await getRecaps(projectId), period);
  } catch {
    return [];
  }
}
