/** The one fan-out spine shared by the scheduled crons that read/EMAIL per-tenant
 *  data (digest + report), replacing four hand-copied `accounts × projects`
 *  skeletons that had drifted apart.
 *
 *  The two email crons used to fan out over EVERY connected account × EVERY
 *  project — a cross-project data-isolation breach: one client account's spend
 *  could land in another client's digest/report email. `planSyncTargets`
 *  (cron/sync/plan.ts) already resolves the correct LINKED (account, project)
 *  pairs (via project.adsCustomerId, with the conservative single-user fallback)
 *  for the sync cron; this module lifts that same rule into a reusable spine so
 *  the email crons iterate the exact same linked pairs — an unlinked account can
 *  no longer enter another project's email.
 *
 *  The PURE account/project resolution lives in `pairs.ts` (firebase-free,
 *  unit-tested); this module adds the I/O (list users → load accounts + projects)
 *  and the per-pair try/catch + results collection. Server-only via its store
 *  imports. */
import { listConnectedAccounts, listConnectedUserIds } from "@/lib/campaigns/connection";
import { resolveTenant, resolveTenantForAccount } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { buildSyncPairs, type SyncPair } from "./pairs";

export { buildSyncPairs } from "./pairs";
export type { SyncPair } from "./pairs";

/** The tenant key for a pair, matching how the sync cron WRITES it so the email
 *  crons READ the same tenant: the account-scoped key for a real account, the
 *  per-user/project base otherwise (resolveTenant collapses to the base key when
 *  no account is connected — the null-customerId case). */
export async function resolvePairTenant(pair: SyncPair): Promise<string> {
  const { userId, target } = pair;
  if (target.customerId) {
    return resolveTenantForAccount(userId, target.projectId ?? null, target.customerId);
  }
  return resolveTenant(userId, target.projectId ?? null);
}

/** Iterate every connected user's linked (account, project) pairs, invoking `run`
 *  per pair under its own try/catch so one bad tenant never aborts the rest.
 *  Failures are routed to `onError` (each cron collects its own result shape).
 *  Returns the user + pair counts for the cron's response summary. */
export async function forEachSyncPair(
  run: (pair: SyncPair) => Promise<void>,
  onError: (pair: SyncPair, err: unknown) => void
): Promise<{ users: number; pairs: number }> {
  const userIds = await listConnectedUserIds();
  let pairs = 0;
  for (const userId of userIds) {
    const [{ accounts }, projects] = await Promise.all([
      listConnectedAccounts(userId),
      listProjects(userId),
    ]);
    for (const pair of buildSyncPairs({ userId, accounts, projects })) {
      pairs++;
      try {
        await run(pair);
      } catch (err) {
        onError(pair, err);
      }
    }
  }
  return { users: userIds.length, pairs };
}
