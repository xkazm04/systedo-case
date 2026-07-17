/** Shared warehouse-sync core: resolve a provider's products, merge them into the
 *  project's catalog, optionally persist, and stamp the connection's last sync. Used
 *  by the on-demand sync route AND the scheduled cron re-sync, so both behave
 *  identically. Server-only. */
import type { SupportedLocale } from "@/lib/format";
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
import {
  BaselinkerError,
  BASELINKER_MAX_PAGES,
  BASELINKER_PAGE_SIZE,
  fetchBaselinkerProducts,
} from "./baselinker";
import { ErpError, fetchErpProducts, parseErpConfig, demoErpProducts } from "./erp";
import { saveConnection, type StoredConnection } from "./connection-store";

/** A provider's resolved products plus whether the pull was truncated (only the
 *  paged Baselinker walk can truncate; every other provider is always complete). */
export interface ResolvedProducts {
  products: ProviderProduct[];
  truncated: boolean;
}

/** Fetch a provider's products. Throws (BaselinkerError / ErpError / Error) on a
 *  provider failure. `config` carries the generic ERP adapter's endpoint/mapping. */
export async function resolveProviderProducts(
  providerId: string,
  token: string,
  inventoryId: string | undefined,
  now: Date,
  config?: unknown
): Promise<ResolvedProducts> {
  if (providerId === "demo") return { products: demoWarehouseProducts(now), truncated: false };
  if (providerId === "erp-demo") return { products: demoErpProducts(), truncated: false };
  if (providerId === "baselinker") return fetchBaselinkerProducts(token, inventoryId);
  if (providerId === "erp") return { products: await fetchErpProducts(parseErpConfig(config), token), truncated: false };
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
  /** the provider returned more items than the page cap allowed — the sync
   *  succeeded but the catalog is only PARTIALLY refreshed (SKUs past the cap keep
   *  stale stock/price). Callers must not present this as a full, healthy sync. */
  truncated?: boolean;
  /** a non-fatal, user-facing note about a partial/degraded-but-successful sync
   *  (currently: the Baselinker page-cap truncation). Localized (cs). */
  warning?: string;
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
  /** locale for the stock-transition alert text (cs/en). Defaults to cs (the market
   *  language, matching the rest of sync-alerts) when the caller has no request locale
   *  — e.g. the cron. */
  locale?: SupportedLocale;
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
  let truncated = false;
  try {
    const resolved = await resolveProviderProducts(
      opts.providerId,
      opts.token,
      opts.inventoryId,
      opts.now,
      opts.config
    );
    products = resolved.products;
    truncated = resolved.truncated;
  } catch (e) {
    return {
      code: "provider-error",
      provider: meta.label,
      message: e instanceof BaselinkerError || e instanceof ErpError ? e.message : "Synchronizace selhala.",
    };
  }
  if (products.length === 0) return { code: "empty", provider: meta.label };

  // A truncated pull still applies (the SKUs we DID fetch are refreshed), but the
  // catalog is only partial — surface it as a non-fatal warning so nothing claims a
  // full, healthy sync while SKUs past the cap keep stale stock/price.
  const warning = truncated
    ? `Katalog přesáhl ${BASELINKER_MAX_PAGES * BASELINKER_PAGE_SIZE} položek — synchronizována jen část. Ostatní produkty se neaktualizovaly.`
    : undefined;

  const nowIso = opts.now.toISOString();
  const incoming = sanitizeOfferings(
    providerProductsToOfferings(products, projectId, sourceForProvider(opts.providerId), nowIso),
    projectId,
    nowIso
  ).filter(isProduct) as ProductOffering[];

  const current = (await listOfferings(userId, projectId)) ?? [];
  // fetchBaselinkerProducts now walks every page (~1000/page) up to a documented cap
  // (BASELINKER_MAX_PAGES). But `incoming` can STILL be a partial view — a catalog past
  // the cap, or a transient mid-walk failure — so we keep forcing "merge" for baselinker:
  // under "replace" mergeCatalog would delete every SKU missing from a truncated fetch,
  // whereas "merge" caps the blast radius at leaving those SKUs un-updated (never deleted).
  const strategy: ImportStrategy = opts.providerId === "baselinker" ? "merge" : opts.strategy;
  const { next, diff } = mergeCatalog(current, incoming, strategy, nowIso);

  if (!opts.apply) return { code: "ok", provider: meta.label, diff, truncated, warning };

  await saveOfferings(userId, projectId, next);
  return { code: "ok", provider: meta.label, diff, offerings: next, truncated, warning };
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
      // A truncated-but-successful sync stamps lastSyncAt (the fetched SKUs ARE
      // fresh) and keeps failCount 0, but records the truncation as a non-fatal
      // note so the badge stops asserting a fully healthy, complete catalog.
      await saveConnection(stamp.userId, stamp.projectId, {
        ...stamp.connection,
        lastSyncAt: nowIso,
        lastError: result.truncated ? result.warning : undefined,
        lastErrorAt: result.truncated ? nowIso : undefined,
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

    // Direction 1: on a SUCCESSFUL apply from a REAL stored connection, alert on SKUs
    // crossing into a pause / at-risk stock condition (transition-only, suppression-
    // governed). Gated to a real connection here (stampConnection present) so sample-
    // /seed-derived stock never alerts; the eshop-only gate lives in alertStockTransitions.
    // Runs for both the cron re-sync and the manual sync — both call this seam.
    // Lazily imported so sync.ts's static graph stays light (the alert path pulls in
    // the campaigns inbox + firebase; only load it when an alert can actually fire).
    if (result.code === "ok" && result.offerings) {
      const { alertStockTransitions } = await import("./sync-alerts");
      await alertStockTransitions(stamp.userId, stamp.projectId, result.offerings, opts.now, opts.locale);
    }
  }
  return result;
}
