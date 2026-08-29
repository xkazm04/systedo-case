/** W3-B — the hosted LP experiment's counters, FIRESTORE backend. Rows live at
 *  `lpArmCounts/{experimentId}/lpDays/{armId}_{day}`. Server-only; the dispatcher
 *  imports this lazily so the LOCAL_DB path never pulls firebase-admin in. Mirrors the
 *  local backend's interface exactly.
 *
 *  `FieldValue.increment` is what makes a public page's counter safe under concurrency
 *  without a transaction — the same choice, for the same reason, as
 *  `organic-channels/outcomes-store.firestore.ts` and `analytics/store.firestore.ts`.
 *
 *  ⚠ THE SUBCOLLECTION IS `lpDays`, NOT `days`, AND THAT IS LOAD-BEARING. The organic
 *  ledger's retention sweep is a COLLECTION-GROUP query — `collectionGroup("days")
 *  .where("day", "<", cutoff)` — which matches every subcollection called `days`
 *  anywhere in the database, regardless of parent. Naming this one `days` would have
 *  handed the go-link prune (90-day retention) the power to delete these rows at 90
 *  days instead of 180, silently truncating a running experiment's traffic and moving
 *  numbers a tenant reads as measured results. A distinct name makes each sweep reach
 *  exactly its own rows, by construction rather than by coordination. */
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import type { LpArmCountDay, LpCountKind } from "./counts";

/** How many counter rows one prune pass removes. Bounded so a cron tick cannot spend
 *  its whole budget in the retention sweep; the next tick continues where it stopped. */
const PRUNE_BATCH = 500;

/** How many rows one project-list scan reads. The step only needs the DISTINCT
 *  projects; Firestore has no DISTINCT, so the scan is bounded and de-duplicated in
 *  memory (the same bounded-read discipline as `listAllGoLinks`). */
const PROJECT_SCAN = 2000;

function experiments() {
  return firestore.collection("lpArmCounts");
}

function daysOf(experimentId: string) {
  return experiments().doc(experimentId).collection("lpDays");
}

export async function bumpLpCount(
  experimentId: string,
  armId: string,
  day: string,
  kind: LpCountKind,
  projectId: string
): Promise<void> {
  // The parent document is written too: a Firestore subcollection under a
  // NON-EXISTENT parent is invisible to `listDocuments`-style reads, and the parent
  // is where the cascade's project filter has to live.
  await experiments().doc(experimentId).set({ experimentId, projectId }, { merge: true });
  await daysOf(experimentId)
    .doc(`${armId}_${day}`)
    .set(
      {
        experimentId,
        armId,
        day,
        projectId,
        [kind]: FieldValue.increment(1),
      },
      { merge: true }
    );
}

export async function listLpCountDays(
  experimentId: string,
  sinceDay: string
): Promise<LpArmCountDay[]> {
  const snap = await daysOf(experimentId).where("day", ">=", sinceDay).get();
  return snap.docs
    .map((d) => d.data())
    .filter((d) => typeof d.armId === "string" && typeof d.day === "string")
    .map((d) => ({
      experimentId,
      armId: d.armId as string,
      day: d.day as string,
      views: typeof d.views === "number" ? d.views : 0,
      conversions: typeof d.conversions === "number" ? d.conversions : 0,
    }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.armId.localeCompare(b.armId));
}

export async function listLpCountProjects(limit = 200): Promise<string[]> {
  const snap = await experiments().limit(PROJECT_SCAN).get();
  const seen = new Set<string>();
  for (const doc of snap.docs) {
    const projectId = doc.data()?.projectId;
    if (typeof projectId === "string" && projectId) seen.add(projectId);
    if (seen.size >= limit) break;
  }
  return [...seen].sort();
}

export async function pruneLpCounts(beforeDay: string): Promise<number> {
  const snap = await firestore
    .collectionGroup("lpDays")
    .where("day", "<", beforeDay)
    .limit(PRUNE_BATCH)
    .get();
  if (snap.empty) return 0;
  const batch = firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return snap.size;
}

export async function clearLpCounts(projectId: string): Promise<void> {
  const snap = await experiments().where("projectId", "==", projectId).get();
  if (snap.empty) return;
  // recursiveDelete drops each experiment doc AND its `lpDays` subcollection — a plain
  // batch delete of the parent would leave the counters as unreachable orphans
  // (Firestore subcollections survive their parent).
  await Promise.all(snap.docs.map((doc) => firestore.recursiveDelete(doc.ref)));
}
