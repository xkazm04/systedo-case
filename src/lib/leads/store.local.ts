/** The lead entity store — LOCAL node:sqlite backend. REAL TABLES with one row per
 *  record (`lead_contacts`, `lead_events`, `lead_activities`; DDL + migration v21 in
 *  src/lib/db.ts), not the single-JSON-blob-per-project shape the other modules use
 *  — see store.ts for why. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface exactly. */
import { getDb } from "@/lib/db";
import { ACTIVITY_CAP, EVENT_CAP, type Activity, type Contact, type LeadEvent } from "./types";
import type { ContactKeys } from "./normalize";
import { applyContactQuery, LIST_SCAN_CAP, type ContactQuery } from "./store-filter";

interface DataRow {
  data: string;
}

function parse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null; // a corrupt blob is skipped, never allowed to break a read
  }
}

function parseAll<T>(rows: DataRow[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const v = parse<T>(r.data);
    if (v) out.push(v);
  }
  return out;
}

/* ── contacts ────────────────────────────────────────────────────────────────── */

export async function listContacts(projectId: string, query: ContactQuery = {}): Promise<Contact[]> {
  const db = getDb();
  // Stage is columned + indexed, so it is pushed into SQL; free text is folded and
  // matched in memory over a bounded scan (see store-filter).
  const rows = query.stage
    ? (db
        .prepare(
          `SELECT data FROM lead_contacts WHERE project_id = ? AND stage = ?
           ORDER BY updated_at DESC, id DESC LIMIT ?`
        )
        .all(projectId, query.stage, LIST_SCAN_CAP) as unknown as DataRow[])
    : (db
        .prepare(
          `SELECT data FROM lead_contacts WHERE project_id = ?
           ORDER BY updated_at DESC, id DESC LIMIT ?`
        )
        .all(projectId, LIST_SCAN_CAP) as unknown as DataRow[]);
  return applyContactQuery(parseAll<Contact>(rows), query);
}

export async function countContacts(projectId: string): Promise<number> {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM lead_contacts WHERE project_id = ?")
    .get(projectId) as { n: number } | undefined;
  return row?.n ?? 0;
}

export async function getContact(projectId: string, id: string): Promise<Contact | null> {
  const row = getDb()
    .prepare("SELECT data FROM lead_contacts WHERE project_id = ? AND id = ?")
    .get(projectId, id) as DataRow | undefined;
  return row ? parse<Contact>(row.data) : null;
}

export async function findContactByKeys(
  projectId: string,
  keys: ContactKeys
): Promise<Contact | null> {
  const db = getDb();
  if (keys.emailKey) {
    const row = db
      .prepare(
        "SELECT data FROM lead_contacts WHERE project_id = ? AND email_key = ? ORDER BY id LIMIT 1"
      )
      .get(projectId, keys.emailKey) as DataRow | undefined;
    if (row) return parse<Contact>(row.data);
  }
  if (keys.phoneKey) {
    const row = db
      .prepare(
        "SELECT data FROM lead_contacts WHERE project_id = ? AND phone_key = ? ORDER BY id LIMIT 1"
      )
      .get(projectId, keys.phoneKey) as DataRow | undefined;
    if (row) return parse<Contact>(row.data);
  }
  return null;
}

export async function saveContact(projectId: string, contact: Contact): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO lead_contacts (project_id, id, stage, email_key, phone_key, updated_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (project_id, id)
       DO UPDATE SET stage = excluded.stage, email_key = excluded.email_key,
                     phone_key = excluded.phone_key, updated_at = excluded.updated_at,
                     data = excluded.data`
    )
    .run(
      projectId,
      contact.id,
      contact.stage,
      contact.emailKey ?? null,
      contact.phoneKey ?? null,
      contact.updatedAt,
      JSON.stringify(contact)
    );
}

export async function deleteContact(projectId: string, id: string): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM lead_activities WHERE project_id = ? AND contact_id = ?").run(projectId, id);
  db.prepare("DELETE FROM lead_contacts WHERE project_id = ? AND id = ?").run(projectId, id);
}

/* ── raw events ──────────────────────────────────────────────────────────────── */

export async function getLeadEvent(projectId: string, key: string): Promise<LeadEvent | null> {
  const row = getDb()
    .prepare("SELECT data FROM lead_events WHERE project_id = ? AND dedup_key = ?")
    .get(projectId, key) as DataRow | undefined;
  return row ? parse<LeadEvent>(row.data) : null;
}

export async function saveLeadEvent(
  projectId: string,
  key: string,
  event: LeadEvent
): Promise<void> {
  const db = getDb();
  db.prepare(
    `INSERT INTO lead_events (project_id, dedup_key, occurred_at, status, data)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (project_id, dedup_key)
     DO UPDATE SET occurred_at = excluded.occurred_at, status = excluded.status,
                   data = excluded.data`
  ).run(projectId, key, event.occurredAt, event.status, JSON.stringify(event));

  const total =
    (db.prepare("SELECT COUNT(*) AS n FROM lead_events WHERE project_id = ?").get(projectId) as
      | { n: number }
      | undefined)?.n ?? 0;
  const evict = total - EVENT_CAP;
  if (evict > 0) {
    db.prepare(
      `DELETE FROM lead_events
       WHERE project_id = ? AND dedup_key IN (
         SELECT dedup_key FROM lead_events WHERE project_id = ?
         ORDER BY occurred_at ASC, dedup_key ASC LIMIT ?
       )`
    ).run(projectId, projectId, evict);
  }
}

export async function listLeadEvents(projectId: string, limit = 200): Promise<LeadEvent[]> {
  const rows = getDb()
    .prepare(
      "SELECT data FROM lead_events WHERE project_id = ? ORDER BY occurred_at DESC, dedup_key DESC LIMIT ?"
    )
    .all(projectId, limit) as unknown as DataRow[];
  return parseAll<LeadEvent>(rows);
}

/* ── timeline ────────────────────────────────────────────────────────────────── */

export async function appendActivity(
  projectId: string,
  contactId: string,
  activity: Activity
): Promise<void> {
  const db = getDb();
  db.prepare(
    `INSERT INTO lead_activities (project_id, contact_id, id, at, kind, data)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (project_id, id)
     DO UPDATE SET contact_id = excluded.contact_id, at = excluded.at,
                   kind = excluded.kind, data = excluded.data`
  ).run(projectId, contactId, activity.id, activity.at, activity.kind, JSON.stringify(activity));

  const total =
    (db
      .prepare("SELECT COUNT(*) AS n FROM lead_activities WHERE project_id = ? AND contact_id = ?")
      .get(projectId, contactId) as { n: number } | undefined)?.n ?? 0;
  const evict = total - ACTIVITY_CAP;
  if (evict > 0) {
    db.prepare(
      `DELETE FROM lead_activities
       WHERE project_id = ? AND contact_id = ? AND id IN (
         SELECT id FROM lead_activities WHERE project_id = ? AND contact_id = ?
         ORDER BY at ASC, id ASC LIMIT ?
       )`
    ).run(projectId, contactId, projectId, contactId, evict);
  }
}

export async function listActivities(
  projectId: string,
  contactId: string,
  limit = 200
): Promise<Activity[]> {
  const rows = getDb()
    .prepare(
      `SELECT data FROM lead_activities WHERE project_id = ? AND contact_id = ?
       ORDER BY at DESC, id DESC LIMIT ?`
    )
    .all(projectId, contactId, limit) as unknown as DataRow[];
  return parseAll<Activity>(rows);
}

export async function deleteActivities(projectId: string, contactId: string): Promise<void> {
  getDb()
    .prepare("DELETE FROM lead_activities WHERE project_id = ? AND contact_id = ?")
    .run(projectId, contactId);
}

export async function clearProjectLeads(projectId: string): Promise<void> {
  const db = getDb();
  for (const t of ["lead_activities", "lead_events", "lead_contacts"]) {
    db.prepare(`DELETE FROM ${t} WHERE project_id = ?`).run(projectId);
  }
}
