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
import { ErpError, fetchErpProducts, parseErpConfig, demoErpProducts } from "./erp";
import { saveConnection, type StoredConnection } from "./connection-store";

/** Fetch a provider's products. Throws (BaselinkerError / ErpError / Error) on a
 *  provider failure. `config` carries the generic ERP adapter's endpoint/mapping. */
export async function resolveProviderProducts(
  providerId: string,
  token: string,
  inventoryId: string | undefined,
  now: Date,
  config?: unknown
): Promise<ProviderProduct[]> {
  if (providerId === "demo") return demoWarehouseProducts(now);
  if (providerId === "erp-demo") return demoErpProducts();
  if (providerId === "baselinker") return fetchBaselinkerProducts(token, inventoryId);
  if (providerId === "erp") return fetchErpProducts(parseErpConfig(config), token);
  throw new Error(`Provider ${providerId} not implemented.`);
}

export type SyncCode =
  | "ok"
  | "unknown-provider"
  | "not-implemented"
  | "no-token"
  | "no-config"
  | "provider-error"
  | "empty";

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
  /** the generic ERP adapter's endpoint/format/mapping (raw; parsed per-run). */
  config?: unknown;
  strategy: ImportStrategy;
  apply: boolean;
  now: Date;
  /** when set, a successful apply stamps this connection's lastSyncAt. */
  stampConnection?: { userId: string; projectId: string; connection: StoredConnection };
}

/** The sync itself — validate, fetch, merge, and (on apply) persist the offerings.
 *  Never throws; provider failures come back as a SyncResult code. Does NOT touch the
 *  connection record — runCatalogSync owns that (health stamping). */
async function computeSync(userId: string, projectId: string, opts: SyncOpts): Promise<SyncResult> {
  const meta = syncProvider(opts.providerId);
  if (!meta) return { code: "unknown-provider" };
  if (!meta.implemented) return { code: "not-implemented", provider: meta.label };
  if (meta.needsToken && !opts.token) return { code: "no-token", provider: meta.label };
  if (meta.needsConfig && !opts.config) return { code: "no-config", provider: meta.label };

  let products: ProviderProduct[];
  try {
    products = await resolveProviderProducts(opts.providerId, opts.token, opts.inventoryId, opts.now, opts.config);
  } catch (e) {
    return {
      code: "provider-error",
      provider: meta.label,
      message: e instanceof BaselinkerError || e instanceof ErpError ? e.message : "Synchronizace selhala.",
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
  return { code: "ok", provider: meta.label, diff, offerings: next };
}

/** Run one project's catalog sync and, on an APPLY with a stored connection, record its
 *  health: success stamps lastSyncAt + clears the error; failure records lastError and
 *  bumps failCount (leaving lastSyncAt at the last good sync). A preview is read-only.
 *  The cron reads that health to alert on the healthy→failing transition. Never throws. */
export async function runCatalogSync(userId: string, projectId: string, opts: SyncOpts): Promise<SyncResult> {
  const result = await computeSync(userId, projectId, opts);

  const stamp = opts.stampConnection;
  if (opts.apply && stamp) {
    const nowIso = opts.now.toISOString();
    if (result.code === "ok") {
      await saveConnection(stamp.userId, stamp.projectId, {
        ...stamp.connection,
        lastSyncAt: nowIso,
        lastError: undefined,
        lastErrorAt: undefined,
        failCount: 0,
      });
    } else {
      await saveConnection(stamp.userId, stamp.projectId, {
        ...stamp.connection,
        lastError: result.message ?? result.code,
        lastErrorAt: nowIso,
        failCount: (stamp.connection.failCount ?? 0) + 1,
      });
    }
  }
  return result;
}
