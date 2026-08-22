/** The lead entity store — FIRESTORE backend. A SUBCOLLECTION per project:
 *
 *    leads/{projectId}                      ← a small index doc (counts + stamp)
 *    leads/{projectId}/contacts/{contactId} ← one doc per contact
 *    leads/{projectId}/events/{dedupKey}    ← one doc per raw connector event
 *    leads/{projectId}/activities/{id}      ← one doc per timeline entry
 *
 *  One doc per record is the whole point: the 1 MiB document cap and the
 *  read-modify-write race that a single per-project blob would suffer are exactly
 *  what disqualified the blob pattern for this domain (store.ts explains). The
 *  parent `leads/{projectId}` doc is kept deliberately TINY — a counter and a
 *  stamp — because a subcollection's parent doc is fetched on many paths.
 *
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so
 *  the LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend. */
import { firestore } from "@/lib/firebase";
import { ACTIVITY_CAP, EVENT_CAP, type Activity, type Contact, type LeadEvent } from "./types";
import type { ContactKeys } from "./normalize";
import { applyContactQuery, LIST_SCAN_CAP, type ContactQuery } from "./store-filter";

const ROOT = "leads";

function projectDoc(projectId: string) {
  return firestore.collection(ROOT).doc(projectId);
}
const contactsCol = (projectId: string) => projectDoc(projectId).collection("contacts");
const eventsCol = (projectId: string) => projectDoc(projectId).collection("events");
const activitiesCol = (projectId: string) => projectDoc(projectId).collection("activities");

/** Doc ids must not contain "/" and must be non-empty; a dedup key is
 *  `${connectorId}:${externalId}` and an externalId is provider-controlled, so it
 *  is encoded rather than trusted. */
function docId(key: string): string {
  return encodeURIComponent(key).replace(/\./g, "%2E");
}

function parse<T>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** The tiny per-project index doc: a contact counter so `countContacts` is a single
 *  doc read instead of a full-collection aggregate, plus a write stamp. */
async function touchIndex(projectId: string, contactDelta: number): Promise<void> {
  const ref = projectDoc(projectId);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = (snap.exists ? (snap.data()?.contactCount as number | undefined) : 0) ?? 0;
    tx.set(
      ref,
      { contactCount: Math.max(0, prev + contactDelta), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  });
}

/* ── contacts ────────────────────────────────────────────────────────────────── */

export async function listContacts(projectId: string, query: ContactQuery = {}): Promise<Contact[]> {
  // stage + updatedAt would need a composite index; the read stays single-field
  // (the cron_runs / twin_archive posture) and the stage is filtered in memory over
  // the bounded scan window.
  const snap = await contactsCol(projectId).orderBy("updatedAt", "desc").limit(LIST_SCAN_CAP).get();
  const rows = snap.docs
    .map((d) => parse<Contact>(d.data()?.data))
    .filter((c): c is Contact => c !== null)
    .filter((c) => (query.stage ? c.stage === query.stage : true));
  return applyContactQuery(rows, query);
}

export async function countContacts(projectId: string): Promise<number> {
  const snap = await projectDoc(projectId).get();
  const n = snap.exists ? (snap.data()?.contactCount as number | undefined) : 0;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export async function getContact(projectId: string, id: string): Promise<Contact | null> {
  const snap = await contactsCol(projectId).doc(docId(id)).get();
  return snap.exists ? parse<Contact>(snap.data()?.data) : null;
}

export async function findContactByKeys(
  projectId: string,
  keys: ContactKeys
): Promise<Contact | null> {
  if (keys.emailKey) {
    const snap = await contactsCol(projectId).where("emailKey", "==", keys.emailKey).limit(1).get();
    if (!snap.empty) return parse<Contact>(snap.docs[0]!.data()?.data);
  }
  if (keys.phoneKey) {
    const snap = await contactsCol(projectId).where("phoneKey", "==", keys.phoneKey).limit(1).get();
    if (!snap.empty) return parse<Contact>(snap.docs[0]!.data()?.data);
  }
  return null;
}

export async function saveContact(projectId: string, contact: Contact): Promise<void> {
  const ref = contactsCol(projectId).doc(docId(contact.id));
  const existed = (await ref.get()).exists;
  await ref.set({
    // The dedup keys and the sort field are mirrored as real fields so they are
    // queryable/indexable; the record itself stays one JSON string (one shape to
    // parse, and no partial-write skew between the mirror and the payload).
    emailKey: contact.emailKey ?? null,
    phoneKey: contact.phoneKey ?? null,
    stage: contact.stage,
    updatedAt: contact.updatedAt,
    data: JSON.stringify(contact),
  });
  if (!existed) await touchIndex(projectId, 1);
}

export async function deleteContact(projectId: string, id: string): Promise<void> {
  const ref = contactsCol(projectId).doc(docId(id));
  const existed = (await ref.get()).exists;
  await deleteActivities(projectId, id);
  await ref.delete();
  if (existed) await touchIndex(projectId, -1);
}

/* ── raw events ──────────────────────────────────────────────────────────────── */

export async function getLeadEvent(projectId: string, key: string): Promise<LeadEvent | null> {
  const snap = await eventsCol(projectId).doc(docId(key)).get();
  return snap.exists ? parse<LeadEvent>(snap.data()?.data) : null;
}

export async function saveLeadEvent(
  projectId: string,
  key: string,
  event: LeadEvent
): Promise<void> {
  await eventsCol(projectId)
    .doc(docId(key))
    .set({ occurredAt: event.occurredAt, status: event.status, data: JSON.stringify(event) });
  // Keep only the newest EVENT_CAP raw events for this project (cold archive).
  const snap = await eventsCol(projectId).orderBy("occurredAt", "asc").get();
  if (snap.size > EVENT_CAP) {
    const batch = firestore.batch();
    for (const d of snap.docs.slice(0, snap.size - EVENT_CAP)) batch.delete(d.ref);
    await batch.commit();
  }
}

export async function listLeadEvents(projectId: string, limit = 200): Promise<LeadEvent[]> {
  const snap = await eventsCol(projectId).orderBy("occurredAt", "desc").limit(limit).get();
  return snap.docs.map((d) => parse<LeadEvent>(d.data()?.data)).filter((e): e is LeadEvent => e !== null);
}

/* ── timeline ────────────────────────────────────────────────────────────────── */

export async function appendActivity(
  projectId: string,
  contactId: string,
  activity: Activity
): Promise<void> {
  await activitiesCol(projectId)
    .doc(docId(activity.id))
    .set({
      contactId,
      at: activity.at,
      kind: activity.kind,
      data: JSON.stringify(activity),
    });
  // Per-CONTACT cap: read this contact's ids (single-field where), sort in memory
  // (avoids a where+orderBy composite index — the cron_runs/twin_archive pattern).
  const snap = await activitiesCol(projectId).where("contactId", "==", contactId).get();
  if (snap.size <= ACTIVITY_CAP) return;
  const overflow = snap.docs
    .map((d) => ({ id: d.id, at: (d.data()?.at as string | undefined) ?? "" }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(ACTIVITY_CAP);
  const batch = firestore.batch();
  for (const o of overflow) batch.delete(activitiesCol(projectId).doc(o.id));
  await batch.commit();
}

export async function listActivities(
  projectId: string,
  contactId: string,
  limit = 200
): Promise<Activity[]> {
  const snap = await activitiesCol(projectId).where("contactId", "==", contactId).get();
  return snap.docs
    .map((d) => ({ at: (d.data()?.at as string | undefined) ?? "", item: parse<Activity>(d.data()?.data) }))
    .filter((r): r is { at: string; item: Activity } => r.item !== null)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
    .map((r) => r.item);
}

export async function deleteActivities(projectId: string, contactId: string): Promise<void> {
  const snap = await activitiesCol(projectId).where("contactId", "==", contactId).get();
  if (snap.empty) return;
  const batch = firestore.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}

export async function clearProjectLeads(projectId: string): Promise<void> {
  for (const col of [activitiesCol(projectId), eventsCol(projectId), contactsCol(projectId)]) {
    const snap = await col.get();
    if (snap.empty) continue;
    const batch = firestore.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
  }
  await projectDoc(projectId).delete();
}
