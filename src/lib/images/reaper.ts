/** The Leonardo generation reaper: deletes generations that leaked on Leonardo's
 *  cloud (unsaved candidates) once they age past the grace window, while never
 *  touching a saved winner's generation (nobg re-derivation must stay possible).
 *
 *  Runs inside an EXISTING daily cron (catalog-sync) — see its run-record for
 *  visibility. The pure keep/delete decision lives in ./reaper-core; ALL Leonardo
 *  API calls stay behind the client seam (cleanupGeneration), never a raw fetch.
 *  Server-only via its store imports. */
import "server-only";
import { cleanupGeneration, leonardoConfigured } from "@/lib/leonardo/client";
import { deleteGenerationRecord, listGenerations, listReferencedGenerationIds } from "./generations-store";
import { DEFAULT_GRACE_MS, generationsToReap } from "./reaper-core";
import { envInt } from "@/lib/env";

export interface ReapResult {
  /** true unless a store read failed outright (per-generation errors are counted) */
  ok: boolean;
  /** ledger rows examined */
  scanned: number;
  /** generations deleted from Leonardo + ledger */
  deleted: number;
  /** kept (referenced by a saved winner, or still inside the grace window) */
  kept: number;
  /** per-generation deletion failures */
  errors: number;
  /** true when skipped because Leonardo isn't configured (nothing to reap) */
  skipped?: boolean;
}

const graceMs = (): number => {
  const hours = envInt("LEONARDO_REAP_GRACE_HOURS", 48);
  return hours > 0 ? hours * 3_600_000 : DEFAULT_GRACE_MS;
};

/** Reap one pass. Never throws (a cron sidecar must not break its host cron); a
 *  store-read failure returns `{ ok: false }` with zero counts. */
export async function reapLeonardoGenerations(now: Date = new Date()): Promise<ReapResult> {
  if (!leonardoConfigured()) {
    return { ok: true, scanned: 0, deleted: 0, kept: 0, errors: 0, skipped: true };
  }
  let records;
  let referenced;
  try {
    [records, referenced] = await Promise.all([listGenerations(), listReferencedGenerationIds()]);
  } catch (err) {
    console.error("[reaper] ledger read failed:", err);
    return { ok: false, scanned: 0, deleted: 0, kept: 0, errors: 0 };
  }

  const toReap = generationsToReap(records, referenced, now, graceMs());
  const reapSet = new Set(toReap);
  let deleted = 0;
  let errors = 0;
  for (const id of toReap) {
    try {
      await cleanupGeneration(id); // Leonardo DELETE, isolated at the client seam
      await deleteGenerationRecord(id);
      deleted++;
    } catch (err) {
      console.error(`[reaper] delete ${id} failed:`, err);
      errors++;
    }
  }
  return {
    ok: true,
    scanned: records.length,
    deleted,
    kept: records.length - reapSet.size,
    errors,
  };
}
