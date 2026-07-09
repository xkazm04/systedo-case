/** Manage a project's persisted warehouse/ERP connection. Per-user, ownership-checked,
 *  server-only. GET returns the client-safe status (no token); PUT connects (encrypting
 *  the API token at rest); DELETE disconnects. The token is never returned to the client. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { syncProvider } from "@/lib/inventory/providers";
import { encryptToken, hasTokenCrypto } from "@/lib/inventory/token-crypto";
import { ErpError, parseErpConfig, type ErpAdapterConfig } from "@/lib/inventory/erp";
import { FeedFetchError, validateFeedUrl } from "@/lib/catalog/feed-fetch";
import { CATALOG_RATE, enforceCatalogRate } from "@/lib/catalog/rate-limit";
import {
  deleteConnection,
  getConnection,
  publicConnection,
  saveConnection,
} from "@/lib/inventory/connection-store";
import { emitProjectActivity } from "@/lib/activity/emit";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;
  const conn = await getConnection(auth.uid, id);
  return Response.json({ connection: conn ? publicConnection(conn) : null });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const limited = enforceCatalogRate(auth.uid, CATALOG_RATE.connect());
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { provider?: unknown; token?: unknown; inventoryId?: unknown; config?: unknown }
    | null;

  const providerId = typeof body?.provider === "string" ? body.provider : "";
  const meta = syncProvider(providerId);
  if (!meta || !meta.implemented) {
    return Response.json({ error: "Tohoto poskytovatele zatím nelze připojit." }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const inventoryId = typeof body?.inventoryId === "string" ? body.inventoryId.trim() || undefined : undefined;

  // Generic ERP adapter: validate the endpoint/mapping config (+ pre-check the endpoint
  // against the SSRF guard so a bad URL is rejected at connect time, not first sync).
  let config: ErpAdapterConfig | undefined;
  let tokenRequired = meta.needsToken;
  if (meta.needsConfig) {
    try {
      config = parseErpConfig(body?.config);
      validateFeedUrl(config.endpoint);
    } catch (e) {
      if (e instanceof ErpError || e instanceof FeedFetchError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
    tokenRequired = config.auth !== "none";
  }

  let tokenEnc: string | undefined;
  if (tokenRequired) {
    if (!token) return Response.json({ error: `${meta.label} vyžaduje API token.` }, { status: 400 });
    if (!hasTokenCrypto()) {
      return Response.json(
        { error: "Server není nakonfigurován pro bezpečné uložení tokenu (CATALOG_TOKEN_SECRET)." },
        { status: 501 }
      );
    }
    tokenEnc = encryptToken(token);
  }

  const conn = {
    provider: providerId,
    inventoryId,
    tokenEnc,
    ...(config ? { config: config as unknown as Record<string, unknown> } : {}),
    connectedAt: new Date().toISOString(),
  };
  await saveConnection(auth.uid, id, conn);
  await emitProjectActivity(auth.uid, id, {
    kind: "update",
    module: "integrace",
    severity: "success",
    title: "Datový sklad napojen",
    detail: meta.label,
    actor: "Vy",
  });
  return Response.json({ connection: publicConnection(conn) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;
  await deleteConnection(auth.uid, id);
  await emitProjectActivity(auth.uid, id, {
    kind: "update",
    module: "integrace",
    severity: "warning",
    title: "Datový sklad odpojen",
    detail: "",
    actor: "Vy",
  });
  return Response.json({ ok: true });
}
