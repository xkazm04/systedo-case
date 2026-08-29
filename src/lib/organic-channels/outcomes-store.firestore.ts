/** The organic outcome ledger — FIRESTORE backend. Links live at `goLinks/{id}`
 *  (a GLOBAL, public address space — see the dispatcher's header) and each link's
 *  counters at `goLinks/{id}/days/{day}`. Server-only; the dispatcher imports this
 *  lazily so the LOCAL_DB path never pulls firebase-admin in. Mirrors the local
 *  backend's interface exactly.
 *
 *  `FieldValue.increment` is what makes the redirect's counter safe under
 *  concurrency without a transaction — the same choice, for the same reason, as
 *  `analytics/store.firestore.ts`. Every capped read is ordered by document id, so
 *  the sqlite twin's `ORDER BY id` returns the same page (ADR-0001). */
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import { GO_LINK_CAP, type GoClickDay, type GoLink } from "./outcomes";

/** How many counter rows one prune pass removes. Bounded so a cron tick cannot
 *  spend its whole budget in the retention sweep; the next tick continues. */
const PRUNE_BATCH = 500;

function links() {
  return firestore.collection("goLinks");
}

function days(linkId: string) {
  return links().doc(linkId).collection("days");
}

function toLink(d: FirebaseFirestore.DocumentData | undefined): GoLink | null {
  if (!d || typeof d.id !== "string" || typeof d.projectId !== "string") return null;
  return d as GoLink;
}

function parseAll(docs: FirebaseFirestore.QueryDocumentSnapshot[]): GoLink[] {
  const out: GoLink[] = [];
  for (const doc of docs) {
    const v = toLink(doc.data());
    if (v) out.push(v);
  }
  return out;
}

export async function saveGoLink(link: GoLink): Promise<void> {
  await links().doc(link.id).set({ ...link });
}

export async function getGoLink(id: string): Promise<GoLink | null> {
  const doc = await links().doc(id).get();
  return doc.exists ? toLink(doc.data()) : null;
}

export async function listGoLinks(projectId: string): Promise<GoLink[]> {
  // Unordered equality query → Firestore orders by `__name__` (the id), which is
  // exactly what the sqlite twin's `ORDER BY id ASC` reproduces.
  const snap = await links().where("projectId", "==", projectId).limit(GO_LINK_CAP).get();
  return parseAll(snap.docs);
}

export async function listAllGoLinks(limit = 2000): Promise<GoLink[]> {
  const snap = await links().limit(limit).get();
  return parseAll(snap.docs);
}

export async function bumpGoClick(linkId: string, day: string): Promise<void> {
  await days(linkId)
    .doc(day)
    .set({ linkId, day, count: FieldValue.increment(1) }, { merge: true });
}

export async function listGoClickDays(
  linkIds: readonly string[],
  sinceDay: string
): Promise<GoClickDay[]> {
  // One bounded read per link rather than a collection-group scan: the links are
  // capped at GO_LINK_CAP per project, and a per-link read needs no composite index
  // and cannot see another tenant's counters even by accident.
  const pages = await Promise.all(
    linkIds.map((id) =>
      days(id)
        .where("day", ">=", sinceDay)
        .get()
        .then((snap) =>
          snap.docs
            .map((d) => d.data())
            .filter((d) => typeof d.day === "string" && typeof d.count === "number")
            .map((d) => ({ linkId: id, day: d.day as string, count: d.count as number }))
        )
        .catch(() => [] as GoClickDay[])
    )
  );
  return pages
    .flat()
    .sort((a, b) => a.day.localeCompare(b.day) || a.linkId.localeCompare(b.linkId));
}

export async function pruneGoClicks(beforeDay: string): Promise<number> {
  const snap = await firestore
    .collectionGroup("days")
    .where("day", "<", beforeDay)
    .limit(PRUNE_BATCH)
    .get();
  if (snap.empty) return 0;
  const batch = firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return snap.size;
}

export async function clearGoLinks(userId: string, projectId: string): Promise<void> {
  const snap = await links().where("projectId", "==", projectId).get();
  if (snap.empty) return;
  // recursiveDelete drops each link doc AND its `days` subcollection — a plain
  // batch delete of the parent would leave the counters as unreachable orphans
  // (Firestore subcollections survive their parent).
  await Promise.all(snap.docs.map((doc) => firestore.recursiveDelete(doc.ref)));
  void userId; // project ids are globally unique; the uid is the interface's, not the query's
}
