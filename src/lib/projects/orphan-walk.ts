/** The DEPENDENT-side orphan walk — the reconciliation pass the parent-first sweep
 *  cannot be (spec: docs/specs/2026-08-30-orphan-dependent-walk.md).
 *
 *  WHY: ./orphan-sweep builds its candidates from the durable ledger plus
 *  operator-supplied ids — the authoritative side. A sweep pointed that way cannot
 *  FIND an orphan, because an orphan is by definition absent from the side being
 *  enumerated: an orphan whose failed delete predates the ledger and whose id
 *  nobody kept was invisible forever. This walk points the other way — enumerate
 *  the dependent stores themselves and ask, per project id seen there, "does your
 *  owner still exist?".
 *
 *  ENUMERATION IS STORAGE TRUTH, NOT A SECOND LIST. Locally the work list is the
 *  sqlite schema itself (every table with a project_id or tenant column); in the
 *  cloud it is the user-attributable namespaces (projectState, tenants,
 *  microsites). That deliberately reaches WIDER than PROJECT_STORE_DELETERS — a
 *  per-project store nobody registered is exactly what this direction exists to
 *  expose, and such data surfaces as `residue` after an apply rather than being
 *  silently converged over.
 *
 *  REPORTS BEFORE IT DELETES, AND NEVER DELETES ITSELF. The default invocation is
 *  read-only. `apply: true` hands the orphaned ids to sweepProjectOrphans — the
 *  registry-derived cleanup path with its own existence re-check and ledger
 *  accounting — so there is exactly one delete path in the system.
 *
 *  EXISTENCE-CHECKED, OWNERLESS WHERE IT MUST BE. Locally a Family-A sighting (a
 *  project-keyed table with no user column) can belong to ANY user, so aliveness
 *  is "does any project row carry this id" — a user-scoped check here could
 *  destroy another user's live workspace. In the cloud every sighting is already
 *  attributed to the session user, so the user-scoped getProject is the check.
 *
 *  SAFE TO RUN TWICE. Report mode touches nothing; a second apply finds no
 *  sightings (or the same stable residue) and deletes nothing further.
 *
 *  Server-only. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import { getProject } from "@/lib/projects/store";
import { isDemoProjectId } from "@/lib/projects/demo";
import { sweepProjectOrphans, type OrphanSweepReport } from "@/lib/projects/orphan-sweep";

/** One raw observation from a backend enumerator: this project id appears in this
 *  table / namespace, attributed to this user where the store knows one. */
export interface RawSighting {
  projectId: string;
  seenIn: string;
  userId?: string;
}

export interface WalkFinding {
  projectId: string;
  /** "alive" → the owner exists, nothing is orphaned, nothing is ever touched. */
  status: "alive" | "orphaned";
  /** tables / namespaces still holding this project's data, sorted, deduped */
  seenIn: string[];
  /** users the sightings attribute the data to (may be empty for Family-A-only) */
  ownerUserIds: string[];
  /** apply-mode only: sightings that SURVIVED the registry-derived cleanup — data
   *  no cleanup unit owns (an unregistered store, or another user's rows). The
   *  walk's witness that the deleter registry has a gap; never silently dropped. */
  residue?: string[];
}

export interface OrphanWalkReport {
  applied: boolean;
  /** candidate project ids examined (post skip-rules) */
  checked: number;
  findings: WalkFinding[];
  orphanCount: number;
  ranAt: string;
  /** apply-mode only: the underlying registry-derived sweep's own report */
  sweep?: OrphanSweepReport;
}

export interface OrphanWalkOptions {
  /** finish the cleanup via the orphan sweep. Omitted/false → pure report. */
  apply?: boolean;
}

function backend() {
  return LOCAL_DB ? import("./orphan-walk.local") : import("./orphan-walk.firestore");
}

/** Skip rule: demo fixtures are never owned, reserved `__…` pseudo-scopes (the
 *  orphan ledger itself rides one) are not projects, and an empty id is noise. */
function isCandidateId(id: string): boolean {
  return id.length > 0 && !id.startsWith("__") && !isDemoProjectId(id);
}

interface Grouped {
  seenIn: Set<string>;
  ownerUserIds: Set<string>;
}

async function enumerate(userId: string): Promise<Map<string, Grouped>> {
  const mod = await backend();
  const raw: RawSighting[] = LOCAL_DB
    ? await (mod as typeof import("./orphan-walk.local")).enumerateSightings()
    : await (mod as typeof import("./orphan-walk.firestore")).enumerateSightings(userId);

  const grouped = new Map<string, Grouped>();
  for (const s of raw) {
    if (!isCandidateId(s.projectId)) continue;
    const g = grouped.get(s.projectId) ?? { seenIn: new Set(), ownerUserIds: new Set() };
    g.seenIn.add(s.seenIn);
    if (s.userId) g.ownerUserIds.add(s.userId);
    grouped.set(s.projectId, g);
  }
  return grouped;
}

async function ownerAlive(userId: string, projectId: string): Promise<boolean> {
  if (LOCAL_DB) {
    return (await import("./orphan-walk.local")).ownerExists(projectId);
  }
  return (await getProject(userId, projectId)) !== null;
}

/** Walk the dependent stores and report — or, with `apply`, hand to the sweep —
 *  every project id whose owner no longer exists. */
export async function walkDependentStores(
  userId: string,
  opts: OrphanWalkOptions = {}
): Promise<OrphanWalkReport> {
  const ranAt = new Date().toISOString();
  const grouped = await enumerate(userId);

  const findings: WalkFinding[] = [];
  const orphanedIds: string[] = [];
  for (const [projectId, g] of grouped) {
    const alive = await ownerAlive(userId, projectId);
    if (!alive) orphanedIds.push(projectId);
    findings.push({
      projectId,
      status: alive ? "alive" : "orphaned",
      seenIn: [...g.seenIn].sort(),
      ownerUserIds: [...g.ownerUserIds].sort(),
    });
  }

  let sweep: OrphanSweepReport | undefined;
  if (opts.apply && orphanedIds.length > 0) {
    // The ONE delete path: registry-derived units, existence re-checked, ledger
    // accounted. The walk itself removes nothing.
    sweep = await sweepProjectOrphans(userId, { apply: true, projectIds: orphanedIds });

    // Honesty pass: whatever a second enumeration still sees for a cleaned
    // candidate is data no registry unit deleted — surface it, don't converge.
    const after = await enumerate(userId);
    for (const f of findings) {
      if (f.status !== "orphaned") continue;
      f.residue = [...(after.get(f.projectId)?.seenIn ?? [])].sort();
    }
  }

  return {
    applied: opts.apply === true,
    checked: findings.length,
    findings,
    orphanCount: orphanedIds.length,
    ranAt,
    ...(sweep ? { sweep } : {}),
  };
}
