/** Durable cron run store — backend dispatcher. Resolves to the local node:sqlite
 *  store when LOCAL_DB is on, else Firestore. The backend is imported LAZILY so
 *  the LOCAL_DB path never evaluates the Firestore module. Both backends persist
 *  one record per invocation, enforce ~20/cron retention on write, and list the
 *  recent runs the /api/health projection reads. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { CronRunRecord } from "./run-record";

function backend() {
  return LOCAL_DB ? import("./runs-store.local") : import("./runs-store.firestore");
}

/** Persist one run record and evict anything beyond the per-cron retention cap. */
export async function saveCronRun(record: CronRunRecord): Promise<void> {
  return (await backend()).saveCronRun(record);
}

/** Recent run records (newest first), the pool the health projection reduces to
 *  last-per-cron. Bounded by `limit`. */
export async function listRecentCronRuns(limit?: number): Promise<CronRunRecord[]> {
  return (await backend()).listRecentCronRuns(limit);
}
