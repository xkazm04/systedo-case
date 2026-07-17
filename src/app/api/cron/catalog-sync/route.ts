/** Scheduled catalog re-sync: for every project with a persisted warehouse/ERP
 *  connection, re-pull the provider's products and merge them into the catalog — so
 *  stock/price/margin stay fresh without anyone opening the app. Runs through the same
 *  runCatalogSync as the on-demand sync (merge strategy, so manual items survive).
 *
 *  Guarded by CRON_SECRET (Vercel Cron sends it as a Bearer token). Schedule lives in
 *  vercel.json. Server-only. */
import { cronAuthorized } from "@/lib/cron-auth";
import { listAllConnections } from "@/lib/inventory/connection-store";
import { decryptToken } from "@/lib/inventory/token-crypto";
import { runCatalogSync, messageForResult } from "@/lib/inventory/sync";
import { alertSyncFailed, alertSyncRecovered } from "@/lib/inventory/sync-alerts";
import { classifySyncResult } from "@/lib/inventory/sync-health";
import { recordCronRun } from "@/lib/cron/run";
import { reapLeonardoGenerations } from "@/lib/images/reaper";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const now = new Date();
  const connections = await listAllConnections();
  const results: {
    userId: string;
    projectId: string;
    provider: string;
    ok: boolean;
    added?: number;
    updated?: number;
    reason?: string;
    alerted?: boolean;
    recovered?: boolean;
  }[] = [];

  for (const { userId, projectId, connection } of connections) {
    try {
      // Decrypt the stored token for credentialed providers; demo needs none.
      // A stored ciphertext that WON'T decrypt (null) is a distinct failure from
      // "no token stored" — almost always TOKEN_CRYPTO_KEY was rotated/mismatched.
      // Coercing it to "" would call the provider with an empty token and surface a
      // generic 401 ("invalid token"), sending the operator to debug the wrong thing.
      // Short-circuit with the real cause instead of hitting the provider.
      const decrypted = connection.tokenEnc ? decryptToken(connection.tokenEnc) : "";
      if (connection.tokenEnc && decrypted == null) {
        const reason = "token-decrypt-failed (check TOKEN_CRYPTO_KEY)";
        const { newlyFailed } = classifySyncResult(connection, false);
        if (newlyFailed) await alertSyncFailed(userId, projectId, connection.provider, reason);
        results.push({ userId, projectId, provider: connection.provider, ok: false, reason, alerted: newlyFailed });
        continue;
      }
      const token = decrypted ?? "";
      const result = await runCatalogSync(userId, projectId, {
        providerId: connection.provider,
        token,
        inventoryId: connection.inventoryId,
        config: connection.config,
        strategy: "merge",
        apply: true,
        now,
        stampConnection: { userId, projectId, connection },
      });
      const ok = result.code === "ok";

      // Alert on the health TRANSITION only (first failure / recovery), not every run —
      // runCatalogSync already persisted the new lastError/failCount on the connection.
      const { newlyFailed, recovered } = classifySyncResult(connection, ok);
      if (newlyFailed) await alertSyncFailed(userId, projectId, connection.provider, messageForResult(result));
      else if (recovered) await alertSyncRecovered(userId, projectId, connection.provider);

      results.push(
        ok
          ? { userId, projectId, provider: connection.provider, ok: true, added: result.diff?.added, updated: result.diff?.updated, recovered }
          : { userId, projectId, provider: connection.provider, ok: false, reason: messageForResult(result), alerted: newlyFailed }
      );
    } catch (err) {
      console.error(`[cron] catalog-sync failed for ${userId}/${projectId}:`, err);
      results.push({
        userId,
        projectId,
        provider: connection.provider,
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Sidecar: reap leaked Leonardo generations (this daily cron is the right cadence
  // for a 48h grace window). Best-effort and isolated — a reaper failure is counted
  // but never flips catalog-sync's own ok, and never throws.
  const reap = await reapLeonardoGenerations(now);

  const failed = results.filter((r) => !r.ok);
  await recordCronRun("catalog-sync", startedAt, {
    ok: failed.length === 0,
    counts: {
      connections: results.length,
      synced: results.filter((r) => r.ok).length,
      failed: failed.length,
      alerted: results.filter((r) => r.alerted).length,
      recovered: results.filter((r) => r.recovered).length,
      reapScanned: reap.scanned,
      reapDeleted: reap.deleted,
      reapKept: reap.kept,
      reapErrors: reap.errors,
    },
    results,
    errors: failed,
  });

  return Response.json({
    connections: results.length,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    alerted: results.filter((r) => r.alerted).length,
    recovered: results.filter((r) => r.recovered).length,
    results,
    reap,
  });
}
