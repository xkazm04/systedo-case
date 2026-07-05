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
import { runCatalogSync } from "@/lib/inventory/sync";
import { alertSyncFailed, alertSyncRecovered } from "@/lib/inventory/sync-alerts";
import { classifySyncResult } from "@/lib/inventory/sync-health";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      const token = connection.tokenEnc ? decryptToken(connection.tokenEnc) ?? "" : "";
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
      if (newlyFailed) await alertSyncFailed(userId, projectId, connection.provider, result.message ?? result.code);
      else if (recovered) await alertSyncRecovered(userId, projectId, connection.provider);

      results.push(
        ok
          ? { userId, projectId, provider: connection.provider, ok: true, added: result.diff?.added, updated: result.diff?.updated, recovered }
          : { userId, projectId, provider: connection.provider, ok: false, reason: result.message ?? result.code, alerted: newlyFailed }
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

  return Response.json({
    connections: results.length,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    alerted: results.filter((r) => r.alerted).length,
    recovered: results.filter((r) => r.recovered).length,
    results,
  });
}
