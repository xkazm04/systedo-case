/** Per-project twin archive — FIRESTORE backend. One doc per archived draft in the
 *  `twinArchives` collection (doc id = `${projectId}__${draftId}`). Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors the local backend's interface and
 *  the cron_runs eviction pattern (query one field, sort in memory to avoid needing
 *  a composite index, delete the overflow). */
import { firestore } from "@/lib/firebase";
import { archivedAt, TWIN_ARCHIVE_CAP } from "./archive";
import type { TwinDraft } from "./types";

const COLLECTION = "twinArchives";

interface ArchiveDoc {
  projectId: string;
  status: string;
  archivedAt: string;
  data: string;
}

function parse(data: string | undefined): TwinDraft | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as TwinDraft;
  } catch {
    return null;
  }
}

export async function archiveDrafts(projectId: string, drafts: TwinDraft[]): Promise<number> {
  const col = firestore.collection(COLLECTION);
  const batch = firestore.batch();
  for (const d of drafts) {
    batch.set(col.doc(`${projectId}__${d.id}`), {
      projectId,
      status: d.status,
      archivedAt: archivedAt(d),
      data: JSON.stringify(d),
    } satisfies ArchiveDoc);
  }
  await batch.commit();

  // Eviction: keep only the newest TWIN_ARCHIVE_CAP docs for this project.
  const snap = await col.where("projectId", "==", projectId).get();
  const docs = snap.docs
    .map((x) => ({ id: x.id, archivedAt: (x.data() as ArchiveDoc).archivedAt ?? "" }))
    .sort(byArchivedAtDesc);
  const overflow = docs.slice(TWIN_ARCHIVE_CAP);
  if (overflow.length) {
    const del = firestore.batch();
    for (const o of overflow) del.delete(col.doc(o.id));
    await del.commit();
    console.warn(
      `[twin] archive cap ${TWIN_ARCHIVE_CAP} reached for ${projectId}: evicted ${overflow.length} oldest audit record(s)`
    );
  }
  return overflow.length;
}

/** Newest-first, ties broken by document id DESCENDING.
 *
 *  The tiebreak is not decoration. `archivedAt` is a whole-second ISO string and
 *  drafts are archived in batches, so ties are the normal case rather than the
 *  edge case. Without a tiebreak this comparator returns 0 and Array#sort's
 *  stability preserves the snapshot's order — which is Firestore's implicit
 *  __name__ ASCENDING — while the sqlite twin orders `archived_at DESC, id DESC`
 *  (archive-store.local.ts:66,77). Opposite directions, and because both drivers
 *  then SLICE to a cap, the two do not merely order the archive differently: they
 *  return DIFFERENT audit records. Descending here matches the twin on both the
 *  listing and the eviction (local deletes oldest-first via `archived_at ASC,
 *  id ASC`, which is this order reversed). */
const byArchivedAtDesc = <T extends { id: string; archivedAt: string }>(a: T, b: T): number =>
  a.archivedAt < b.archivedAt ? 1 : a.archivedAt > b.archivedAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;

/** Read this project's archive, sort in memory (avoids a where+orderBy composite
 *  index), and slice — bounded by the per-project cap regardless of `limit`. */
async function readSorted(projectId: string): Promise<{ draft: TwinDraft; at: string }[]> {
  const snap = await firestore.collection(COLLECTION).where("projectId", "==", projectId).get();
  return snap.docs
    .map((x) => {
      const doc = x.data() as ArchiveDoc;
      return { id: x.id, draft: parse(doc.data), at: doc.archivedAt ?? "" };
    })
    .filter((r): r is { id: string; draft: TwinDraft; at: string } => r.draft !== null)
    .sort((a, b) => byArchivedAtDesc({ id: a.id, archivedAt: a.at }, { id: b.id, archivedAt: b.at }));
}

export async function listArchivedDrafts(projectId: string, limit = 200): Promise<TwinDraft[]> {
  return (await readSorted(projectId)).slice(0, limit).map((r) => r.draft);
}

export async function listArchivedRejects(projectId: string, limit = 200): Promise<TwinDraft[]> {
  return (await readSorted(projectId))
    .filter((r) => r.draft.status === "rejected")
    .slice(0, limit)
    .map((r) => r.draft);
}

export async function clearArchive(projectId: string): Promise<void> {
  const snap = await firestore.collection(COLLECTION).where("projectId", "==", projectId).get();
  if (snap.empty) return;
  const batch = firestore.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}
