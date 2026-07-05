/** Pure sync-health classification — kept import-light (no firebase/campaigns) so the
 *  cron's alerting decision is unit-testable in isolation. sync-alerts.ts does the I/O. */
import type { StoredConnection } from "./connection-store";

export interface SyncClassification {
  /** was failing, now succeeded */
  recovered: boolean;
  /** first failure after a healthy state — the moment to alert */
  newlyFailed: boolean;
  /** consecutive-failure count to persist (0 on success) */
  nextFailCount: number;
}

/** Decide, from the PRE-sync connection state + this run's outcome, whether to alert.
 *  Transition-based so a persistently-broken connection alerts once, not every night. */
export function classifySyncResult(
  connection: Pick<StoredConnection, "lastError" | "failCount">,
  ok: boolean
): SyncClassification {
  const prevFailCount = connection.failCount ?? 0;
  const wasFailing = Boolean(connection.lastError);
  if (ok) return { recovered: wasFailing, newlyFailed: false, nextFailCount: 0 };
  return { recovered: false, newlyFailed: prevFailCount === 0, nextFailCount: prevFailCount + 1 };
}
