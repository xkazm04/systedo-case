/** Sync a project's catalog from a warehouse/ERP provider (on-demand). Per-user,
 *  ownership-checked, server-only. Provider + token come from the request, or fall
 *  back to the project's persisted connection (whose token is decrypted here only).
 *  The actual sync runs through the shared runCatalogSync (same as the cron re-sync);
 *  this route just resolves credentials and maps the result to an HTTP status. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { getConnection } from "@/lib/inventory/connection-store";
import { decryptToken } from "@/lib/inventory/token-crypto";
import { runCatalogSync } from "@/lib/inventory/sync";
import { CATALOG_RATE, enforceCatalogRate } from "@/lib/catalog/rate-limit";
import type { ImportStrategy } from "@/lib/catalog/import";
import { apiError, badRequest, providerError, readJson, unprocessable } from "@/lib/api/route-utils";

const STRATEGIES: ImportStrategy[] = ["merge", "replace"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { uid } = g;

  // Throttle before any provider round-trip (each sync hits an external ERP/API).
  const limited = enforceCatalogRate(uid, CATALOG_RATE.sync());
  if (limited) return limited;

  const body = await readJson<{
    provider?: unknown;
    token?: unknown;
    inventoryId?: unknown;
    config?: unknown;
    mode?: unknown;
    strategy?: unknown;
  }>(req);

  // Provider/token/config from the request, else from the persisted connection.
  const stored = await getConnection(uid, id);
  const providerId = (typeof body?.provider === "string" && body.provider) || stored?.provider || "";
  const useStored = stored?.provider === providerId;

  let token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token && useStored && stored.tokenEnc) token = decryptToken(stored.tokenEnc) ?? "";
  const inventoryId =
    (typeof body?.inventoryId === "string" && body.inventoryId) || (useStored ? stored.inventoryId : undefined);
  const config =
    (body?.config && typeof body.config === "object" ? body.config : undefined) ??
    (useStored ? stored.config : undefined);
  const strategy = STRATEGIES.includes(body?.strategy as ImportStrategy)
    ? (body!.strategy as ImportStrategy)
    : "merge";
  const apply = body?.mode === "apply";

  const result = await runCatalogSync(uid, id, {
    providerId,
    token,
    inventoryId,
    config,
    strategy,
    apply,
    now: new Date(),
    stampConnection: useStored && stored ? { userId: uid, projectId: id, connection: stored } : undefined,
  });

  switch (result.code) {
    case "unknown-provider":
      return badRequest("Neznámý poskytovatel.", "provider-unknown");
    case "not-implemented":
      return apiError(501, `Napojení na ${result.provider} připravujeme.`, "provider-unavailable");
    case "no-token":
      return badRequest(`${result.provider} vyžaduje API token.`, "provider-no-token");
    case "no-config":
      return badRequest(`${result.provider} vyžaduje konfiguraci koncového bodu.`, "provider-no-config");
    case "provider-error":
      // Was a RAW upstream error string handed to the client. Now a coded category
      // with a generic Czech message; the raw provider text is server-logged only.
      return providerError({
        category: "provider-error",
        message: "Synchronizace u poskytovatele selhala. Zkontrolujte připojení a zkuste to znovu.",
        raw: result.message,
        context: `catalog-sync ${result.provider}`,
      });
    case "empty":
      return unprocessable("Poskytovatel nevrátil žádné produkty.", "provider-empty");
    default:
      return Response.json({
        ok: true,
        applied: apply,
        format: result.provider,
        diff: result.diff,
        ...(apply ? { offerings: result.offerings, count: result.offerings?.length } : {}),
      });
  }
}
