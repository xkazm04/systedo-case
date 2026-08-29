/** The PURE core of the cron fan-out spine: resolve a user's connected accounts +
 *  projects into the LINKED (account, project) pairs the scheduled crons act on.
 *  Framework-free and firebase-free (only `import type` + the pure planSyncTargets),
 *  so the digest/report adoption is unit-testable without Firestore or Next. The
 *  I/O wrapper (list users, load stores, per-pair try/catch) lives in `fan-out.ts`. */
import type { ConnectedAccount } from "@/lib/campaigns/connection";
import type { Project } from "@/lib/projects/types";
import { planSyncTargets, type SyncTarget } from "@/app/api/cron/sync/plan";

/** One resolved unit of scheduled work: a linked (account, project) pair for a
 *  user, with the full account + project objects looked up (crons need the
 *  account's customerName for the email subject and the project's branding). */
export interface SyncPair {
  userId: string;
  /** the planSyncTargets decision for this pair (customerId/projectId + reason) */
  target: SyncTarget;
  /** the connected account this pair reads from, or null (no-account sample fallback) */
  account: ConnectedAccount | null;
  /** the project this pair emails for, or null (per-user tenant, no project) */
  project: Project | null;
}

/** Resolve a user's linked (account, project) pairs. Delegates the cross-project
 *  isolation rule to planSyncTargets (an unlinked account writes nowhere), then
 *  hydrates each target's customerId/projectId back to the full account/project
 *  object. Side-effect-free. */
export function buildSyncPairs(input: {
  userId: string;
  accounts: ConnectedAccount[];
  projects: Project[];
  /** ADR-0010: the user has a per-user Sklik connection, so their `sklikLinked`
   *  projects get an ADDITIONAL Sklik pair (account null — Sklik has no account id)
   *  beside their Google one. Omitted → the pre-ledger plan, pair for pair. */
  hasSklik?: boolean;
}): SyncPair[] {
  const { userId, accounts, projects, hasSklik } = input;
  const accountById = new Map(accounts.map((a) => [a.customerId, a]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  return planSyncTargets({ accounts, projects, hasSklik }).map((target) => ({
    userId,
    target,
    account: target.customerId ? accountById.get(target.customerId) ?? null : null,
    project: target.projectId ? projectById.get(target.projectId) ?? null : null,
  }));
}
