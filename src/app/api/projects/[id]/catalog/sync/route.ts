/** Sync a project's catalog from a warehouse/ERP provider. Per-user, ownership-
 *  checked, server-only. `demo` returns the sample warehouse (no credentials);
 *  `baselinker` fetches live via a user-supplied token (not stored this cycle).
 *  Products → offerings → the same mergeCatalog as the feed import. Two modes:
 *  "preview" (read-only diff) and "apply" (merge + persist). */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { listOfferings, saveOfferings } from "@/lib/catalog/store";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { isProduct, type ProductOffering } from "@/lib/catalog/offering";
import { mergeCatalog, type ImportStrategy } from "@/lib/catalog/import";
import {
  demoWarehouseProducts,
  providerProductsToOfferings,
  sourceForProvider,
  syncProvider,
  type ProviderProduct,
} from "@/lib/inventory/providers";
import { BaselinkerError, fetchBaselinkerProducts } from "@/lib/inventory/baselinker";

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
    mode?: unknown;
    strategy?: unknown;
  } | null;

  const providerId = typeof body?.provider === "string" ? body.provider : "";
  const meta = syncProvider(providerId);
  if (!meta) return Response.json({ error: "Neznámý poskytovatel." }, { status: 400 });
  if (!meta.implemented) {
    return Response.json({ error: `Napojení na ${meta.label} připravujeme.` }, { status: 501 });
  }

  const token = typeof body?.token === "string" ? body.token : "";
  const inventoryId = typeof body?.inventoryId === "string" ? body.inventoryId : undefined;
  const strategy = STRATEGIES.includes(body?.strategy as ImportStrategy)
    ? (body!.strategy as ImportStrategy)
    : "merge";
  const apply = body?.mode === "apply";

  if (meta.needsToken && !token.trim()) {
    return Response.json({ error: `${meta.label} vyžaduje API token.` }, { status: 400 });
  }

  const now = new Date();
  let products: ProviderProduct[];
  try {
    if (providerId === "demo") {
      products = demoWarehouseProducts(now);
    } else if (providerId === "baselinker") {
      products = await fetchBaselinkerProducts(token, inventoryId);
    } else {
      return Response.json({ error: `Napojení na ${meta.label} připravujeme.` }, { status: 501 });
    }
  } catch (e) {
    return Response.json(
      { error: e instanceof BaselinkerError ? e.message : "Synchronizace selhala." },
      { status: 502 }
    );
  }

  if (products.length === 0) {
    return Response.json({ error: "Poskytovatel nevrátil žádné produkty." }, { status: 422 });
  }

  const nowIso = now.toISOString();
  const incoming = sanitizeOfferings(
    providerProductsToOfferings(products, id, sourceForProvider(providerId), nowIso),
    id,
    nowIso
  ).filter(isProduct) as ProductOffering[];

  const current = (await listOfferings(uid, id)) ?? [];
  const { next, diff } = mergeCatalog(current, incoming, strategy, nowIso);

  if (!apply) {
    return Response.json({ ok: true, applied: false, format: meta.label, diff });
  }

  await saveOfferings(uid, id, next);
  return Response.json({ ok: true, applied: true, format: meta.label, diff, offerings: next, count: next.length });
}
