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
  }[] = [];

  for (const { userId, projectId, connection } of connections) {
    try {
      // Decrypt the stored token for credentialed providers; demo needs none.
      const token = connection.tokenEnc ? decryptToken(connection.tokenEnc) ?? "" : "";
      const result = await runCatalogSync(userId, projectId, {
        providerId: connection.provider,
        token,
        inventoryId: connection.inventoryId,
        strategy: "merge",
        apply: true,
        now,
        stampConnection: { userId, projectId, connection },
      });
      if (result.code === "ok") {
        results.push({
          userId,
          projectId,
          provider: connection.provider,
          ok: true,
          added: result.diff?.added,
          updated: result.diff?.updated,
        });
      } else {
        results.push({ userId, projectId, provider: connection.provider, ok: false, reason: result.message ?? result.code });
      }
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
    results,
  });
}
