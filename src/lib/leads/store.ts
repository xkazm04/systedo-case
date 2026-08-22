/** The lead entity store — backend DISPATCHER. Local node:sqlite when LOCAL_DB is
 *  on, else Firestore; the backend is imported LAZILY so the LOCAL_DB path never
 *  evaluates the Firestore module (the goals/twin-archive store shape).
 *
 *  ⚠ This store is deliberately ROW-BASED, unlike every other per-project store in
 *  this repo. Those hold one JSON blob per project, which is right for a bounded
 *  settings object and wrong here: a lead archive with an activity timeline is
 *  unbounded and append-heavy, so a blob would (a) march toward Firestore's 1 MiB
 *  document cap and (b) lose writes to read-modify-write races between a connector
 *  ingest and a UI edit. One row/doc per contact, per event and per activity.
 *
 *  Server-only. The pure model lives in ./types, the dedup keys in ./normalize. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { Activity, Contact, LeadEvent } from "./types";
import type { ContactKeys } from "./normalize";
import type { ContactQuery } from "./store-filter";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

export { DEFAULT_LIST_LIMIT, LIST_SCAN_CAP } from "./store-filter";
export type { ContactQuery } from "./store-filter";

export async function listContacts(projectId: string, query: ContactQuery = {}): Promise<Contact[]> {
  return (await backend()).listContacts(projectId, query);
}

export async function countContacts(projectId: string): Promise<number> {
  return (await backend()).countContacts(projectId);
}

export async function getContact(projectId: string, id: string): Promise<Contact | null> {
  return (await backend()).getContact(projectId, id);
}

/** Find the contact that AUTO-MERGES with these keys: exact normalised email OR
 *  exact E.164 phone. Returns null when nothing matches (or the keys are empty) —
 *  a name-only "match" is never resolved here (see normalize.isDuplicateCandidate). */
export async function findContactByKeys(
  projectId: string,
  keys: ContactKeys
): Promise<Contact | null> {
  if (!keys.emailKey && !keys.phoneKey) return null;
  return (await backend()).findContactByKeys(projectId, keys);
}

/** Upsert one contact row. The dedup key columns are derived from the record, so a
 *  caller cannot store a contact whose indexed key disagrees with its payload. */
export async function saveContact(projectId: string, contact: Contact): Promise<void> {
  return (await backend()).saveContact(projectId, contact);
}

/** HARD-delete a contact and its whole timeline. Used only by the GDPR path AFTER
 *  a tombstone has been written, or to drop a project. */
export async function deleteContact(projectId: string, id: string): Promise<void> {
  return (await backend()).deleteContact(projectId, id);
}

/* ── raw connector events (the idempotency ledger) ───────────────────────────── */

/** The stored event for `${connectorId}:${externalId}`, or null when unseen. A
 *  non-null result with status "applied" is what makes re-ingest a no-op. */
export async function getLeadEvent(projectId: string, key: string): Promise<LeadEvent | null> {
  return (await backend()).getLeadEvent(projectId, key);
}

export async function saveLeadEvent(
  projectId: string,
  key: string,
  event: LeadEvent
): Promise<void> {
  return (await backend()).saveLeadEvent(projectId, key, event);
}

export async function listLeadEvents(projectId: string, limit = 200): Promise<LeadEvent[]> {
  return (await backend()).listLeadEvents(projectId, limit);
}

/* ── timeline ────────────────────────────────────────────────────────────────── */

/** Append a timeline entry, evicting the oldest beyond ACTIVITY_CAP. Idempotent by
 *  activity id (re-appending the same id updates it in place, never duplicates). */
export async function appendActivity(
  projectId: string,
  contactId: string,
  activity: Activity
): Promise<void> {
  return (await backend()).appendActivity(projectId, contactId, activity);
}

/** A contact's timeline, NEWEST FIRST, bounded. */
export async function listActivities(
  projectId: string,
  contactId: string,
  limit = 200
): Promise<Activity[]> {
  return (await backend()).listActivities(projectId, contactId, limit);
}

export async function deleteActivities(projectId: string, contactId: string): Promise<void> {
  return (await backend()).deleteActivities(projectId, contactId);
}

/** Drop EVERYTHING a project holds in the lead layer (contacts, events, timelines).
 *  The project-delete cascade + the test-reset seam. */
export async function clearProjectLeads(projectId: string): Promise<void> {
  return (await backend()).clearProjectLeads(projectId);
}
