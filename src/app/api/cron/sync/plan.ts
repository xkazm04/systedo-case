/** Pure account→project mapping for the scheduled sync (framework-free, so the
 *  rule is unit-testable without Firestore or Next).
 *
 *  The old cron mirrored EVERY connected account into EVERY project of a user
 *  (N accounts × M projects), which multiplied Google Ads API calls and wrote one
 *  account's spend into projects it isn't linked to — the same data-isolation
 *  breach report-metrics/sync.ts already refuses by requiring an explicit link.
 *  This resolves each account to the project(s) that link to it via
 *  `project.adsCustomerId` (digits-normalised, matching report-metrics), with a
 *  conservative fallback so pre-existing single-account/single-project users who
 *  never set the link are not stranded. */
import type { ProjectType } from "@/lib/projects/types";

export interface PlanAccount {
  customerId: string;
}

export interface PlanProject {
  id: string;
  type?: ProjectType;
  adsCustomerId?: string | null;
}

export interface SyncTarget {
  /** the Ads account to sync from, or null → the per-user / sample connector */
  customerId: string | null;
  /** the project tenant to sync into, or undefined → the per-user tenant */
  projectId?: string;
  projectType?: ProjectType;
  /** why this pairing was chosen — surfaced in the cron result for diagnostics.
   *  `user-load-failed` is never planned here: the fan-out spine synthesises it for a
   *  user whose own stores failed to load, so that failure still reaches the cron's
   *  per-pair error path instead of aborting the run. */
  reason: "linked" | "single-project-fallback" | "no-project-fallback" | "user-load-failed";
}

const digits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

/** Resolve the (account, project) pairs the cron should sync for one user. */
export function planSyncTargets(args: {
  accounts: PlanAccount[];
  projects: PlanProject[];
}): SyncTarget[] {
  const { accounts, projects } = args;

  // No connected accounts at all: preserve the prior null-account fallback so the
  // project(s) still get a (sample) sync, exactly as before. listConnectedUserIds
  // pre-filters to ≥1 account, but this keeps the helper total.
  if (accounts.length === 0) {
    if (projects.length === 0) return [{ customerId: null, reason: "no-project-fallback" }];
    return projects.map((p) => ({
      customerId: null,
      projectId: p.id,
      projectType: p.type,
      reason: "no-project-fallback" as const,
    }));
  }

  // Conservative fallback for the classic single-account + single-project (or
  // no-project) user who never set the adsCustomerId link: keep syncing that one
  // account into that one project, so a pre-existing tenant is never stranded.
  // Requires exactly one account (an agency with several accounts must map them)
  // and no project already carrying a link (else it's handled as "linked" below).
  const singleUnmapped =
    accounts.length === 1 && projects.length <= 1 && !projects.some((p) => p.adsCustomerId);
  if (singleUnmapped) {
    const p = projects[0];
    return [
      {
        customerId: accounts[0]!.customerId,
        projectId: p?.id,
        projectType: p?.type,
        reason: p ? "single-project-fallback" : "no-project-fallback",
      },
    ];
  }

  // General case (agency / multi-project / any explicit link): an account syncs
  // ONLY into the projects explicitly linked to it via project.adsCustomerId. An
  // unmapped account writes nowhere — we never mirror one account's data into a
  // project it isn't linked to. The user links the account to resume syncing.
  const targets: SyncTarget[] = [];
  for (const account of accounts) {
    const acct = digits(account.customerId);
    for (const p of projects) {
      if (p.adsCustomerId && digits(p.adsCustomerId) === acct) {
        targets.push({
          customerId: account.customerId,
          projectId: p.id,
          projectType: p.type,
          reason: "linked",
        });
      }
    }
  }
  return targets;
}
