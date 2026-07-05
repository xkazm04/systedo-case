/** Baselinker API client for warehouse sync. Baselinker exposes one endpoint —
 *  POST https://api.baselinker.com/connector.php, `X-BLToken` header, form body
 *  `method=<m>&parameters=<json>` — returning JSON `{ status, ... }`. We resolve an
 *  inventory then pull its products, normalized to ProviderProduct[].
 *
 *  The request builder + response mapper are pure and unit-tested; only `fetch*` does
 *  the network round-trip (credential-gated — untested against the live API here).
 *  The endpoint host is fixed (not user-supplied), so this needs no SSRF guard. */
import type { ProviderProduct } from "./providers";

export const BASELINKER_ENDPOINT = "https://api.baselinker.com/connector.php";

/** Build the HTTP request pieces for a Baselinker method call. Pure. */
export function buildBaselinkerRequest(
  token: string,
  method: string,
  parameters: Record<string, unknown> = {}
): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: BASELINKER_ENDPOINT,
    headers: {
      "X-BLToken": token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ method, parameters: JSON.stringify(parameters) }).toString(),
  };
}

/** First numeric value from Baselinker's `prices` map ({price_group_id: value}). */
function firstPrice(prices: unknown): number {
  if (typeof prices === "number") return prices;
  if (prices && typeof prices === "object") {
    for (const v of Object.values(prices as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

/** Sum on-hand quantity across warehouses (Baselinker's `stock` map). */
function sumStock(stock: unknown): number | undefined {
  if (typeof stock === "number") return stock;
  if (stock && typeof stock === "object") {
    let total = 0;
    let seen = false;
    for (const v of Object.values(stock as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) {
        total += n;
        seen = true;
      }
    }
    return seen ? total : undefined;
  }
  return undefined;
}

/** Normalize a `getInventoryProductsList` response to ProviderProduct[]. Pure. The
 *  `products` field is a map keyed by product id. Tolerant of missing fields. */
export function mapBaselinkerProducts(json: unknown): ProviderProduct[] {
  const products = (json as { products?: unknown })?.products;
  if (!products || typeof products !== "object") return [];
  return Object.entries(products as Record<string, Record<string, unknown>>).map(([id, p]) => {
    const name =
      (typeof p.name === "string" && p.name) ||
      (typeof (p.text_fields as Record<string, unknown> | undefined)?.name === "string"
        ? String((p.text_fields as Record<string, unknown>).name)
        : "") ||
      String(p.sku ?? id);
    return {
      externalId: String(p.id ?? id),
      sku: String(p.sku ?? p.id ?? id),
      name,
      ean: p.ean ? String(p.ean) : undefined,
      price: firstPrice(p.prices ?? p.price),
      stock: sumStock(p.stock),
      category: p.category_id != null ? String(p.category_id) : undefined,
    };
  });
}

/** A Baselinker error the sync route surfaces to the user. */
export class BaselinkerError extends Error {}

async function callBaselinker(token: string, method: string, parameters: Record<string, unknown>): Promise<unknown> {
  const { url, headers, body } = buildBaselinkerRequest(token, method, parameters);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new BaselinkerError("Baselinker se nepodařilo kontaktovat.");
  }
  const json = (await res.json().catch(() => null)) as { status?: string; error_message?: string } | null;
  if (!json || json.status !== "SUCCESS") {
    throw new BaselinkerError(json?.error_message || `Baselinker vrátil chybu (${res.status}).`);
  }
  return json;
}

/** Fetch products from a Baselinker inventory (the first one when unspecified).
 *  Credential-gated: requires a valid token. Not exercised without real credentials. */
export async function fetchBaselinkerProducts(token: string, inventoryId?: string): Promise<ProviderProduct[]> {
  if (!token.trim()) throw new BaselinkerError("Zadejte Baselinker API token.");

  let inventory = inventoryId?.trim();
  if (!inventory) {
    const inv = (await callBaselinker(token, "getInventories", {})) as {
      inventories?: { inventory_id?: string | number }[];
    };
    inventory = inv.inventories?.[0]?.inventory_id != null ? String(inv.inventories[0].inventory_id) : undefined;
    if (!inventory) throw new BaselinkerError("Na účtu nebyl nalezen žádný katalog (inventory).");
  }

  const list = await callBaselinker(token, "getInventoryProductsList", { inventory_id: inventory });
  return mapBaselinkerProducts(list);
}
