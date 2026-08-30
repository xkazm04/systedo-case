/** The conversion ledger — FIRESTORE backend (cloud / production). A SUBCOLLECTION
 *  hanging off the SAME per-project parent the lead stores already use, so the whole
 *  lead layer stays in one place:
 *
 *    leads/{projectId}                        ← the tiny index doc (store.firestore)
 *    leads/{projectId}/contacts/{contactId}
 *    leads/{projectId}/conversions/{id}       ← one doc per conversion event
 *
 *  One doc per event is the point — see conversion-store.ts. Server-only
 *  (firebase-admin is Node-only); the dispatcher imports this lazily so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors the local backend's interface exactly. */
import { firestore } from "@/lib/firebase";
import { CONVERSION_EVENT_CAP, type ConversionEvent } from "./conversion-events";
import type { ConversionEventQuery, ConversionTenant } from "./conversion-store";

const DEFAULT_LIMIT = 500;
/** Firestore's hard limit is 500 writes per batch; stay under it with headroom. */
const BATCH_SIZE = 400;

function conversionsCol(projectId: string) {
  return firestore.collection("leads").doc(projectId).collection("conversions");
}

/** A conversion id embeds a contact id; "/" is illegal in a doc id and a bare "." /
 *  ".." is reserved, so it is encoded rather than trusted. */
function docId(id: string): string {
  return encodeURIComponent(id).replace(/\./g, "%2E");
}

function parse(raw: unknown): ConversionEvent | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as ConversionEvent;
  } catch {
    return null;
  }
}

async function deleteRefs(refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const ref of refs.slice(i, i + BATCH_SIZE)) batch.delete(ref);
    await batch.commit();
  }
}

export async function appendConversionEvents(
  projectId: string,
  events: readonly ConversionEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const col = conversionsCol(projectId);
  // Idempotent by event id: a re-qualify re-`set`s the same doc instead of adding a
  // second. Chunked so a bulk import stays inside the per-batch write limit.
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const e of events.slice(i, i + BATCH_SIZE)) {
      // `at`/`kind` are mirrored as real fields so they are queryable/orderable; the
      // event itself stays one JSON string (one shape to parse, no partial-write skew).
      // WP S3 mirrors the double-upload marker the same way — as a BOOLEAN, not the
      // record, since the only question ever asked of it is "sent or not". It is
      // written for inspectability (a console query for a project's pending rows) and
      // for a future single-field read; the drain does NOT branch on it today, because
      // docs written before S3 carry no such field and an equality filter cannot see a
      // missing one — see listConversionEvents.
      batch.set(col.doc(docId(e.id)), {
        at: e.at,
        kind: e.kind,
        uploaded: Boolean(e.uploaded),
        data: JSON.stringify(e),
      });
    }
    await batch.commit();
  }

  const snap = await col.orderBy("at", "asc").get();
  if (snap.size > CONVERSION_EVENT_CAP) {
    await deleteRefs(snap.docs.slice(0, snap.size - CONVERSION_EVENT_CAP).map((d) => d.ref));
  }
}

export async function listConversionEvents(
  projectId: string,
  query: ConversionEventQuery = {}
): Promise<ConversionEvent[]> {
  const limit = query.limit ?? DEFAULT_LIMIT;
  const since = query.sinceDay ?? "";
  const col = conversionsCol(projectId);
  if (query.uploaded !== undefined) {
    // WP S3 — the marker filter. Deliberately NOT `where("uploaded","==",false)`,
    // even though the field is mirrored for exactly that: a doc written BEFORE S3
    // carries no `uploaded` field at all, and Firestore's equality filter cannot see
    // a missing field, so the whole pre-S3 backlog would be invisible to the drain
    // while the sqlite backend (`json_extract(...) IS NULL`) happily includes it. Two
    // backends that disagree about which rows are pending is precisely the class of
    // bug the dual-store pattern exists to avoid, so this branch reads the project's
    // capped set (ordered, so the scan cap takes the NEWEST) and applies the same
    // predicate the local store applies. Once per drain tick per tenant.
    const snap = await col.orderBy("at", "desc").limit(CONVERSION_EVENT_CAP).get();
    return snap.docs
      .map((d) => parse(d.data()?.data))
      .filter(
        (e): e is ConversionEvent =>
          e !== null &&
          e.at >= since &&
          (!query.kind || e.kind === query.kind) &&
          Boolean(e.uploaded) === query.uploaded
      )
      .slice(0, limit);
  }
  if (query.kind) {
    // where + orderBy would need a composite index; the read stays single-field (the
    // lead_activities / cron_runs posture) and sorts the bounded set in memory.
    const snap = await col.where("kind", "==", query.kind).get();
    return snap.docs
      .map((d) => parse(d.data()?.data))
      .filter((e): e is ConversionEvent => e !== null && e.at >= since)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, limit);
  }
  const snap = await col.orderBy("at", "desc").limit(limit).get();
  return snap.docs
    .map((d) => parse(d.data()?.data))
    .filter((e): e is ConversionEvent => e !== null && e.at >= since);
}

export async function pruneConversionEvents(projectId: string, beforeDay: string): Promise<number> {
  const snap = await conversionsCol(projectId).where("at", "<", beforeDay).get();
  if (snap.empty) return 0;
  await deleteRefs(snap.docs.map((d) => d.ref));
  return snap.size;
}

export async function clearConversionEvents(projectId: string): Promise<void> {
  const snap = await conversionsCol(projectId).get();
  if (snap.empty) return;
  await deleteRefs(snap.docs.map((d) => d.ref));
}

export async function listConversionTenants(limit = 500): Promise<ConversionTenant[]> {
  // Two collection-group reads rather than an owner column on every ledger row — see
  // conversion-store.ts. The first names the projects that actually hold rows; the
  // second maps a project back to the user whose subcollection it lives in
  // (`users/{uid}/projects/{pid}`), which is where `project_state` is keyed.
  const rows = await firestore.collectionGroup("conversions").select("at").limit(limit).get();
  const projectIds = new Set<string>();
  for (const doc of rows.docs) {
    const pid = doc.ref.parent.parent?.id;
    if (pid) projectIds.add(pid);
  }
  if (projectIds.size === 0) return [];

  const owners = new Map<string, string>();
  const projects = await firestore.collectionGroup("projects").select().get();
  for (const doc of projects.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (uid) owners.set(doc.id, uid);
  }

  const out: ConversionTenant[] = [];
  for (const projectId of [...projectIds].sort()) {
    const userId = owners.get(projectId);
    // A project whose doc is gone (a mid-delete race) drops out of the work list
    // rather than being rolled up under a guessed owner.
    if (userId) out.push({ userId, projectId });
  }
  return out;
}
