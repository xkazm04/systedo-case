/** Sync a project's catalog from a warehouse/ERP provider (on-demand). Per-user,
 *  ownership-checked, server-only. Provider + token come from the request, or fall
 *  back to the project's persisted connection (whose token is decrypted here only).
 *  The actual sync runs through the shared runCatalogSync (same as the cron re-sync);
 *  this route just resolves credentials and maps the result to an HTTP status. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { getConnection } from "@/lib/inventory/connection-store";
import { decryptToken } from "@/lib/inventory/token-crypto";
import { runCatalogSync } from "@/lib/inventory/sync";
import type { ImportStrategy } from "@/lib/catalog/import";

const STRATEGIES: ImportStrategy[] = ["merge", "replace"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const { id } = await params;
  const project = await getProject(uid, id);
  if (!project) return Response.json({ error: "Projekt nenalezen." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    provider?: unknown;
    token?: unknown;
    inventoryId?: unknown;
    config?: unknown;
    mode?: unknown;
    strategy?: unknown;
  } | null;

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
      return Response.json({ error: "Neznámý poskytovatel." }, { status: 400 });
    case "not-implemented":
      return Response.json({ error: `Napojení na ${result.provider} připravujeme.` }, { status: 501 });
    case "no-token":
      return Response.json({ error: `${result.provider} vyžaduje API token.` }, { status: 400 });
    case "no-config":
      return Response.json({ error: `${result.provider} vyžaduje konfiguraci koncového bodu.` }, { status: 400 });
    case "provider-error":
      return Response.json({ error: result.message }, { status: 502 });
    case "empty":
      return Response.json({ error: "Poskytovatel nevrátil žádné produkty." }, { status: 422 });
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
