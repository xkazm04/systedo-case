/** Shared warehouse-sync core: resolve a provider's products, merge them into the
 *  project's catalog, optionally persist, and stamp the connection's last sync. Used
 *  by the on-demand sync route AND the scheduled cron re-sync, so both behave
 *  identically. Server-only. */
import type { Offering, ProductOffering } from "@/lib/catalog/offering";
import { isProduct } from "@/lib/catalog/offering";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { mergeCatalog, type CatalogDiff, type ImportStrategy } from "@/lib/catalog/import";
import { listOfferings, saveOfferings } from "@/lib/catalog/store";
import {
  demoWarehouseProducts,
  providerProductsToOfferings,
  sourceForProvider,
  syncProvider,
  type ProviderProduct,
} from "./providers";
import { BaselinkerError, fetchBaselinkerProducts } from "./baselinker";
import { saveConnection, type StoredConnection } from "./connection-store";

/** Fetch a provider's products. Throws (BaselinkerError / Error) on a provider failure. */
export async function resolveProviderProducts(
  providerId: string,
  token: string,
  inventoryId: string | undefined,
  now: Date
): Promise<ProviderProduct[]> {
  if (providerId === "demo") return demoWarehouseProducts(now);
  if (providerId === "baselinker") return fetchBaselinkerProducts(token, inventoryId);
  throw new Error(`Provider ${providerId} not implemented.`);
}

export type SyncCode = "ok" | "unknown-provider" | "not-implemented" | "no-token" | "provider-error" | "empty";

export interface SyncResult {
  code: SyncCode;
  provider?: string;
  message?: string;
  diff?: CatalogDiff;
  /** the persisted catalog, on a successful apply */
  offerings?: Offering[];
}

export interface SyncOpts {
  providerId: string;
  token: string;
  inventoryId?: string;
  strategy: ImportStrategy;
  apply: boolean;
  now: Date;
  /** when set, a successful apply stamps this connection's lastSyncAt. */
  stampConnection?: { userId: string; projectId: string; connection: StoredConnection };
}

/** Run one project's catalog sync. Never throws — provider failures come back as a
 *  SyncResult code the caller maps to an HTTP status (route) or logs (cron). */
export async function runCatalogSync(userId: string, projectId: string, opts: SyncOpts): Promise<SyncResult> {
  const meta = syncProvider(opts.providerId);
  if (!meta) return { code: "unknown-provider" };
  if (!meta.implemented) return { code: "not-implemented", provider: meta.label };
  if (meta.needsToken && !opts.token) return { code: "no-token", provider: meta.label };

  let products: ProviderProduct[];
  try {
    products = await resolveProviderProducts(opts.providerId, opts.token, opts.inventoryId, opts.now);
  } catch (e) {
    return {
      code: "provider-error",
      provider: meta.label,
      message: e instanceof BaselinkerError ? e.message : "Synchronizace selhala.",
    };
  }
  if (products.length === 0) return { code: "empty", provider: meta.label };

  const nowIso = opts.now.toISOString();
  const incoming = sanitizeOfferings(
    providerProductsToOfferings(products, projectId, sourceForProvider(opts.providerId), nowIso),
    projectId,
    nowIso
  ).filter(isProduct) as ProductOffering[];

  const current = (await listOfferings(userId, projectId)) ?? [];
  const { next, diff } = mergeCatalog(current, incoming, opts.strategy, nowIso);

  if (!opts.apply) return { code: "ok", provider: meta.label, diff };

  await saveOfferings(userId, projectId, next);
  const stamp = opts.stampConnection;
  if (stamp) {
    await saveConnection(stamp.userId, stamp.projectId, { ...stamp.connection, lastSyncAt: nowIso });
  }
  return { code: "ok", provider: meta.label, diff, offerings: next };
}
