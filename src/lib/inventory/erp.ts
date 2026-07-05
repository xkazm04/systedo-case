/** Generic ERP/warehouse adapter: sync a catalog from ANY system that can expose its
 *  products at an HTTP endpoint as JSON or CSV, via a per-project field-mapping config
 *  (no vendor-specific code). Covers POHODA/Money/HELIOS exports and homegrown ERPs
 *  alike — you point it at a URL and say which fields are the SKU, name, price, stock.
 *
 *  The fetch reuses the feed importer's SSRF-guarded fetcher (private-IP block, redirect
 *  re-validation, size cap) plus an optional auth header. Parsing + mapping are pure and
 *  unit-tested; an `erp-demo` variant runs a bundled sample through the SAME pipeline so
 *  the whole path is demonstrable without credentials. Server-only. */
import "server-only";
import { fetchFeed } from "@/lib/catalog/feed-fetch";
import { parseCsvRecords, parseFeedPrice } from "@/lib/catalog/feed";
import type { ProviderProduct } from "./providers";

export type ErpFormat = "json" | "csv";
export type ErpAuth = "none" | "bearer" | "header";

/** Which source field holds each product attribute. sku + name are required. */
export interface ErpFieldMap {
  sku: string;
  name: string;
  price?: string;
  stock?: string;
  ean?: string;
  category?: string;
  /** gross-margin fraction (0–1); a value > 1 is read as a percentage. */
  margin?: string;
}

export interface ErpAdapterConfig {
  endpoint: string;
  format: ErpFormat;
  auth: ErpAuth;
  /** header name when auth === "header" (default "Authorization"). */
  authHeader?: string;
  /** JSON dot-path to the products array, e.g. "data.products". Root array if empty. */
  itemsPath?: string;
  mapping: ErpFieldMap;
}

export class ErpError extends Error {}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Validate + normalize an untrusted config (PUT body or a stored blob). Throws ErpError. */
export function parseErpConfig(raw: unknown): ErpAdapterConfig {
  if (!raw || typeof raw !== "object") throw new ErpError("Chybí konfigurace ERP.");
  const c = raw as Record<string, unknown>;
  const endpoint = str(c.endpoint).trim();
  if (!endpoint) throw new ErpError("Zadejte URL koncového bodu ERP.");
  const format: ErpFormat = c.format === "csv" ? "csv" : "json";
  const auth: ErpAuth = c.auth === "bearer" ? "bearer" : c.auth === "header" ? "header" : "none";
  const map = (c.mapping && typeof c.mapping === "object" ? c.mapping : {}) as Record<string, unknown>;
  const sku = str(map.sku).trim();
  const name = str(map.name).trim();
  if (!sku || !name) throw new ErpError("Namapujte alespoň pole SKU a název.");
  const mapping: ErpFieldMap = { sku, name };
  for (const k of ["price", "stock", "ean", "category", "margin"] as const) {
    const v = str(map[k]).trim();
    if (v) mapping[k] = v;
  }
  const config: ErpAdapterConfig = { endpoint, format, auth, mapping };
  const authHeader = str(c.authHeader).trim();
  if (auth === "header" && authHeader) config.authHeader = authHeader;
  const itemsPath = str(c.itemsPath).trim();
  if (itemsPath) config.itemsPath = itemsPath;
  return config;
}

/** Navigate a dot-path (e.g. "data.products") into a parsed JSON value. */
function atPath(value: unknown, path?: string): unknown {
  if (!path) return value;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

/** Turn a raw payload (JSON or CSV text) into an array of row objects. Throws ErpError
 *  on malformed JSON or a path that doesn't resolve to an array. */
export function parseErpPayload(text: string, config: Pick<ErpAdapterConfig, "format" | "itemsPath">): unknown[] {
  if (config.format === "csv") {
    const records = parseCsvRecords(text);
    if (records.length < 2) return [];
    const header = records[0].map((h) => h.trim());
    return records.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => (obj[h] = row[i] ?? ""));
      return obj;
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ErpError("Odpověď ERP není platný JSON.");
  }
  const arr = atPath(json, config.itemsPath);
  if (!Array.isArray(arr)) {
    throw new ErpError(
      config.itemsPath
        ? `Cesta "${config.itemsPath}" v odpovědi ERP není pole.`
        : "Odpověď ERP není pole produktů (nastavte cestu k položkám)."
    );
  }
  return arr;
}

const MAX_ROWS = 5000;

/** Map raw ERP rows to ProviderProduct[] using the field mapping. Rows missing SKU are
 *  dropped; price/stock/margin are coerced, and a margin > 1 is read as a percentage. */
export function mapErpRows(rows: unknown[], mapping: ErpFieldMap): ProviderProduct[] {
  const out: ProviderProduct[] = [];
  for (const raw of rows.slice(0, MAX_ROWS)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const cell = (field?: string) => (field ? row[field] : undefined);
    const sku = str(cell(mapping.sku)).trim() || String(cell(mapping.sku) ?? "").trim();
    if (!sku) continue;
    const name = str(cell(mapping.name)).trim() || sku;

    const stockRaw = cell(mapping.stock);
    const stock =
      stockRaw != null && stockRaw !== ""
        ? Math.max(0, Math.trunc(Number(String(stockRaw).replace(/[^\d.-]/g, ""))))
        : undefined;
    const marginRaw = mapping.margin ? Number(String(cell(mapping.margin) ?? "").replace(",", ".")) : NaN;
    const margin = Number.isFinite(marginRaw)
      ? marginRaw > 1
        ? Math.min(1, marginRaw / 100)
        : Math.max(0, marginRaw)
      : undefined;

    out.push({
      externalId: sku,
      sku,
      name,
      price: parseFeedPrice(str(cell(mapping.price))),
      ...(stock != null && Number.isFinite(stock) ? { stock } : {}),
      ...(margin != null ? { margin } : {}),
      ...(mapping.ean && str(cell(mapping.ean)).trim() ? { ean: str(cell(mapping.ean)).trim() } : {}),
      ...(mapping.category && str(cell(mapping.category)).trim()
        ? { category: str(cell(mapping.category)).trim() }
        : {}),
    });
  }
  return out;
}

function authHeaders(config: ErpAdapterConfig, token: string): Record<string, string> {
  if (config.auth === "none" || !token) return {};
  if (config.auth === "bearer") return { authorization: `Bearer ${token}` };
  return { [config.authHeader || "Authorization"]: token };
}

/** Fetch + parse + map a live ERP endpoint. SSRF-guarded (via fetchFeed). Throws
 *  ErpError / FeedFetchError on failure; the caller maps it to a status/log line. */
export async function fetchErpProducts(config: ErpAdapterConfig, token: string): Promise<ProviderProduct[]> {
  const text = await fetchFeed(config.endpoint, { headers: authHeaders(config, token) });
  return mapErpRows(parseErpPayload(text, config), config.mapping);
}

// ---- demo (credential-free, no network) ----------------------------------

/** A bundled sample "ERP export" (JSON under data.products) + a matching mapping, so
 *  the whole parse→map path is demonstrable without any endpoint. */
export const DEMO_ERP_CONFIG: ErpAdapterConfig = {
  endpoint: "https://erp.example.invalid/api/products",
  format: "json",
  auth: "none",
  itemsPath: "data.products",
  mapping: { sku: "code", name: "title", price: "priceVat", stock: "onHand", category: "group", margin: "marginPct" },
};

const DEMO_ERP_PAYLOAD = JSON.stringify({
  data: {
    products: [
      { code: "ERP-KESU-1", title: "Kešu ořechy natural 1 kg", priceVat: "349", onHand: "42", group: "Ořechy", marginPct: "31" },
      { code: "ERP-MAND-05", title: "Mandle loupané 500 g", priceVat: "219", onHand: "18", group: "Ořechy", marginPct: "28" },
      { code: "ERP-DYNE-02", title: "Dýňová semínka 200 g", priceVat: "89", onHand: "7", group: "Semínka", marginPct: "35" },
      { code: "ERP-GOJI-1", title: "Goji kustovnice sušené 1 kg", priceVat: "459", onHand: "0", group: "Sušené plody", marginPct: "40" },
      { code: "ERP-VLAS-05", title: "Vlašské ořechy půlky 500 g", priceVat: "279", onHand: "25", group: "Ořechy", marginPct: "26" },
      { code: "ERP-SLUN-1", title: "Slunečnicová semínka loupaná 1 kg", priceVat: "129", onHand: "60", group: "Semínka", marginPct: "33" },
    ],
  },
});

/** The demo ERP's products — the sample payload run through the real parse+map engine. */
export function demoErpProducts(): ProviderProduct[] {
  return fetchErpProductsFromText(DEMO_ERP_PAYLOAD, DEMO_ERP_CONFIG);
}

/** parse+map a payload string with a config (the pure core shared by demo + tests). */
export function fetchErpProductsFromText(text: string, config: ErpAdapterConfig): ProviderProduct[] {
  return mapErpRows(parseErpPayload(text, config), config.mapping);
}
