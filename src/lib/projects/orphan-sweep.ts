/** The integrity sweep: find per-project data whose project no longer exists, and —
 *  only when explicitly asked — finish deleting it.
 *
 *  WHY: the deletion cascade is best-effort and non-atomic. The `projects` doc is
 *  removed regardless of `cascade.failed.length`, so once a store failed its data was
 *  unreachable: nothing could re-target that projectId again except a human reading
 *  the old id out of an audit-log detail string. Combined with the cascade gap that
 *  four unregistered stores left open until recently, the installed base almost
 *  certainly ALREADY has orphans.
 *
 *  DERIVED FROM THE CASCADE'S OWN REGISTRY. The work list is
 *  `projectCleanupUnits()` — the registered `PROJECT_STORE_DELETERS` plus the tenant
 *  scrub — and the deletes are `runProjectCleanup`, the exact code path the cascade
 *  runs. There is deliberately no second list of stores here: a store added to the
 *  registry is swept as automatically as it is cascaded, which is the only way this
 *  stays true a year from now.
 *
 *  REPORTS BEFORE IT DELETES. `sweep(userId)` is read-only and returns exactly what
 *  it WOULD do; `sweep(userId, { apply: true })` is the same walk with the deletes
 *  performed. Nothing is ever removed by looking.
 *
 *  SAFE TO RUN TWICE. Every store deleter is idempotent (a missing row is a no-op),
 *  a resolved ledger record is dropped so the second run finds nothing left, and a
 *  candidate whose project turns out to still EXIST is reported as `alive` and
 *  cleaned out of the ledger without a single delete — so a recreated or
 *  mis-supplied id can never destroy a live workspace.
 *
 *  BOTH BACKENDS. Nothing here is backend-aware: the ledger rides `project_state` and
 *  the deletes dispatch through the same store trio as every other call site.
 *
 *  Server-only. */
import "server-only";
import { getProject } from "@/lib/projects/store";
import { projectCleanupUnits, runProjectCleanup } from "@/lib/projects/delete-cascade";
import {
  forgetOrphanRecord,
  ledgerRecords,
  readOrphanLedger,
  recordOrphan,
  type OrphanRecord,
} from "@/lib/projects/orphan-ledger";

/** What the sweep found for one candidate project. */
export interface OrphanFinding {
  projectId: string;
  projectName: string;
  /** "orphaned" → the project is gone and these units still hold its data.
   *  "alive"    → the project exists, so nothing is orphaned (the record is dropped). */
  status: "orphaned" | "alive";
  /** cleanup units still holding data, by their registry name */
  pending: string[];
  /** how the candidate got here: the durable ledger, or an operator-supplied id */
  source: "ledger" | "supplied";
  attempts: number;
  firstSeenAt: string;
  /** apply-mode only: units that cleaned successfully this run */
  cleaned?: string[];
  /** apply-mode only: units that failed AGAIN (and stay in the ledger) */
  stillFailing?: string[];
}

export interface OrphanSweepReport {
  /** true when the deletes were actually performed */
  applied: boolean;
  /** how many candidate projects were examined */
  checked: number;
  findings: OrphanFinding[];
  /** convenience rollups for a caller that just wants the headline */
  orphanCount: number;
  /** ISO of this run */
  ranAt: string;
}

export interface OrphanSweepOptions {
  /** perform the deletes. Omitted/false → a pure report, nothing is removed. */
  apply?: boolean;
  /** extra project ids to examine on top of the ledger — the path for orphans that
   *  predate the ledger (an operator knows the id from an old audit record). They are
   *  checked for existence first, so a mistyped id can only ever be reported `alive`
   *  or clean a genuinely dead project. */
  projectIds?: readonly string[];
}

interface Candidate {
  projectId: string;
  projectName: string;
  pending: string[];
  source: "ledger" | "supplied";
  attempts: number;
  firstSeenAt: string;
}

function fromRecord(r: OrphanRecord): Candidate {
  return {
    projectId: r.projectId,
    projectName: r.projectName,
    pending: r.pending,
    source: "ledger",
    attempts: r.attempts,
    firstSeenAt: r.firstSeenAt,
  };
}

/** Examine every candidate project and report — or, with `apply`, finish — the
 *  cleanup its deletion left behind. */
export async function sweepProjectOrphans(
  userId: string,
  opts: OrphanSweepOptions = {}
): Promise<OrphanSweepReport> {
  const ranAt = new Date().toISOString();
  const ledger = await readOrphanLedger(userId);

  const candidates = new Map<string, Candidate>();
  for (const record of ledgerRecords(ledger)) candidates.set(record.projectId, fromRecord(record));
  for (const id of opts.projectIds ?? []) {
    if (!id || candidates.has(id)) continue;
    // An id nobody recorded has no known-dirty subset, so assume the worst: every
    // cleanup unit the registry knows about.
    candidates.set(id, {
      projectId: id,
      projectName: "",
      pending: projectCleanupUnits(),
      source: "supplied",
      attempts: 0,
      firstSeenAt: ranAt,
    });
  }

  const findings: OrphanFinding[] = [];
  for (const candidate of candidates.values()) {
    // The existence check is what makes this safe: we only ever delete data whose
    // project is GONE, so a recreated or mistyped id is reported, never scrubbed.
    const project = await getProject(userId, candidate.projectId);
    if (project) {
      if (opts.apply && candidate.source === "ledger") {
        await forgetOrphanRecordSafely(userId, candidate.projectId);
      }
      findings.push({ ...candidate, status: "alive", projectName: project.name });
      continue;
    }

    if (!opts.apply) {
      findings.push({ ...candidate, status: "orphaned" });
      continue;
    }

    const result = await runProjectCleanup(userId, candidate.projectId, candidate.pending);
    const stillFailing = result.failed.map((f) => f.name);
    // Re-record with ONLY what is still dirty: an empty pending set resolves (drops)
    // the record, which is what makes a second run a no-op.
    await recordOrphan(userId, {
      projectId: candidate.projectId,
      projectName: candidate.projectName,
      pending: stillFailing,
      lastError: result.failed[0]?.error,
    });
    findings.push({
      ...candidate,
      status: "orphaned",
      cleaned: result.cleaned,
      stillFailing,
    });
  }

  return {
    applied: opts.apply === true,
    checked: findings.length,
    findings,
    orphanCount: findings.filter((f) => f.status === "orphaned").length,
    ranAt,
  };
}

/** Drop a ledger record without letting a ledger hiccup fail the whole sweep — the
 *  record is stale bookkeeping at this point, not data. */
async function forgetOrphanRecordSafely(userId: string, projectId: string): Promise<void> {
  try {
    await forgetOrphanRecord(userId, projectId);
  } catch (err) {
    console.error("[projects] orphan sweep — could not drop a resolved ledger record", err);
  }
}
