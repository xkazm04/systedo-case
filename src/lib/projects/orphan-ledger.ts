/** The durable record of per-project data that outlived its project.
 *
 *  The deletion cascade is best-effort: one store throwing never aborts the rest, and
 *  the `projects` doc is removed regardless. That is the right call for the USER — a
 *  workspace they deleted must disappear — but it made the failure UNRECOVERABLE:
 *  once the project row was gone, nothing could re-target that projectId again except
 *  a human reading the old id out of an audit-log detail string. The orphaned data
 *  was invisible, un-deletable and a privacy liability.
 *
 *  So a failed cascade now writes a LEDGER entry: which project, which stores are
 *  still dirty, when, how many times we have tried. Cleanup becomes resumable
 *  (./orphan-sweep re-runs exactly the pending stores) instead of lost in a string.
 *
 *  STORAGE CHOICE (documented, following the round-13/14 precedent the sibling blob
 *  stores set): the ledger RIDES `project_state` under the registered key
 *  "orphanLedger", stored against a RESERVED pseudo-project id
 *  ({@link ORPHAN_LEDGER_SCOPE}) that no real project can ever have — project ids are
 *  20-char hex, and the demo namespace is `demo-`. Reasons:
 *   1. it needs no new table and therefore NO sqlite migration, which cannot collide
 *      with the shared version ledger the concurrently-developed contexts share;
 *   2. it gives BOTH backends (Firestore + LOCAL_DB sqlite) for free;
 *   3. project_state writes are compare-and-swapped, so two deletes failing at once
 *      cannot drop one another's entry — which for a ledger whose whole job is "do
 *      not lose this" is the difference between working and pretending to;
 *   4. it is scoped per USER, which is exactly the scope of the data and of the
 *      session that can act on it. The reserved scope id is NOT a project, so no
 *      project deletion can ever cascade the ledger away with its own evidence.
 *
 *  The transitions below are PURE and unit-tested; the persistence wrapper is at the
 *  bottom. Bounded: {@link ORPHAN_LEDGER_CAP} records, oldest dropped first, so a
 *  pathological run cannot grow the blob without limit. */
import "server-only";
import { getProjectState, mutateProjectState } from "@/lib/project-state/store";
import { PROJECT_STATE_KEYS } from "@/lib/project-state/keys";

/** The project_state key the ledger blob lives under (central registry). */
const ORPHAN_LEDGER_KEY = "orphanLedger" satisfies keyof typeof PROJECT_STATE_KEYS;

/** The RESERVED pseudo-project id the per-user ledger is stored against. Double
 *  underscore + a word no id generator can produce (ids are 20-char hex), so it can
 *  never be shadowed by — or cascaded away with — a real project. */
export const ORPHAN_LEDGER_SCOPE = "__system_orphans";

/** How many orphan records one user's ledger keeps. Far more than any plausible run
 *  of failures; the oldest are dropped first if it is ever reached. */
export const ORPHAN_LEDGER_CAP = 100;

/** One project whose data survived it. */
export interface OrphanRecord {
  /** the deleted project's id — the handle everything else needs and used to lose */
  projectId: string;
  /** its name at deletion time, so support can talk about it in human terms */
  projectName: string;
  /** store names (as registered in PROJECT_STORE_DELETERS, plus "tenant-data")
   *  that have NOT been cleaned yet. Empty → the record is resolved and dropped. */
  pending: string[];
  /** ISO of the delete that first failed */
  firstSeenAt: string;
  /** ISO of the most recent cleanup attempt */
  lastAttemptAt: string;
  /** how many cleanup attempts this record has survived (1 = the original delete) */
  attempts: number;
  /** the last error text seen, for support — never rendered to a user */
  lastError?: string;
}

export interface OrphanLedger {
  records: OrphanRecord[];
  updatedAt: string;
}

/** An empty ledger — the seed for a user who has never had a failed cascade. */
export function emptyLedger(now: Date = new Date()): OrphanLedger {
  return { records: [], updatedAt: now.toISOString() };
}

/** The ledger's records, tolerating a null/legacy blob. Never mutates. */
export function ledgerRecords(ledger: OrphanLedger | null): OrphanRecord[] {
  return Array.isArray(ledger?.records) ? ledger.records : [];
}

/** Record (or refresh) one project's un-cleaned stores. Re-recording the same
 *  project MERGES: the pending set is replaced by what is still dirty, the attempt
 *  count grows and `firstSeenAt` is preserved, so a resumed cleanup reads as one
 *  ongoing problem rather than a new one each time. `pending: []` resolves the
 *  record — it is dropped, which is what makes the sweep safe to run twice. Pure. */
export function upsertOrphan(
  prev: OrphanLedger | null,
  entry: {
    projectId: string;
    projectName?: string;
    pending: string[];
    lastError?: string;
  },
  now: Date = new Date()
): OrphanLedger {
  const iso = now.toISOString();
  const existing = ledgerRecords(prev).find((r) => r.projectId === entry.projectId);
  const rest = ledgerRecords(prev).filter((r) => r.projectId !== entry.projectId);

  if (entry.pending.length === 0) {
    return { records: rest, updatedAt: iso };
  }

  const record: OrphanRecord = {
    projectId: entry.projectId,
    projectName: entry.projectName ?? existing?.projectName ?? "",
    pending: [...new Set(entry.pending)].sort(),
    firstSeenAt: existing?.firstSeenAt ?? iso,
    lastAttemptAt: iso,
    attempts: (existing?.attempts ?? 0) + 1,
    ...(entry.lastError ? { lastError: entry.lastError } : {}),
  };
  // Newest-touched first, oldest dropped past the cap.
  return { records: [record, ...rest].slice(0, ORPHAN_LEDGER_CAP), updatedAt: iso };
}

/** Drop a project's record outright — used when the sweep finds the project ALIVE
 *  again (nothing is orphaned, so there is nothing to remember). Pure. */
export function forgetOrphan(
  prev: OrphanLedger | null,
  projectId: string,
  now: Date = new Date()
): OrphanLedger {
  return {
    records: ledgerRecords(prev).filter((r) => r.projectId !== projectId),
    updatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Persistence (both backends, via project_state)
// ---------------------------------------------------------------------------

/** The user's ledger, or null when nothing has ever failed. */
export async function readOrphanLedger(userId: string): Promise<OrphanLedger | null> {
  return getProjectState<OrphanLedger>(userId, ORPHAN_LEDGER_SCOPE, ORPHAN_LEDGER_KEY);
}

/** Record one project's un-cleaned stores durably. Compare-and-swapped, so two
 *  failing deletes at the same moment cannot drop each other's entry. */
export async function recordOrphan(
  userId: string,
  entry: { projectId: string; projectName?: string; pending: string[]; lastError?: string }
): Promise<OrphanLedger> {
  return mutateProjectState<OrphanLedger>(userId, ORPHAN_LEDGER_SCOPE, ORPHAN_LEDGER_KEY, (cur) =>
    upsertOrphan(cur, entry)
  );
}

/** Drop one project's record (the project came back, or everything is clean). */
export async function forgetOrphanRecord(userId: string, projectId: string): Promise<OrphanLedger> {
  return mutateProjectState<OrphanLedger>(userId, ORPHAN_LEDGER_SCOPE, ORPHAN_LEDGER_KEY, (cur) =>
    forgetOrphan(cur, projectId)
  );
}
