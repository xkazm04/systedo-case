/** Product-feed parsing → normalized FeedItem[] → ProductOffering[] for the catalog
 *  store. Handles the three dominant Czech feed shapes + a generic CSV:
 *   - Heureka / Zboží.cz XML (`<SHOP><SHOPITEM>…`, shared schema),
 *   - Google Merchant / Shopping RSS (`<item>` with the `g:` namespace),
 *   - CSV/TSV exports (header-mapped, quote-aware).
 *  Dependency-free: feed XML is flat and machine-generated, so a scoped block
 *  extractor (not a general XML parser) is robust and keeps the project's zero-dep
 *  spirit. Pure — no network, no Date; the import API supplies the bytes + `now`. */
import type { OfferingSource, ProductOffering } from "./offering";

export type FeedFormat = "heureka" | "google" | "csv";

/** A raw feed row, normalized across formats. Only what a product feed actually
 *  carries — stock/velocity/margin generally come from a WMS/ERP, not a feed. */
export interface FeedItem {
  id: string;
  title: string;
  price: number;
  category?: string;
  ean?: string;
  brand?: string;
  /** availability from the feed, when stated (Heureka DELIVERY_DATE / g:availability). */
  inStock?: boolean;
  /** exact count, only when a CSV carries a stock/quantity column. */
  stock?: number;
  url?: string;
  imageUrl?: string;
  description?: string;
}

export interface ParsedFeed {
  format: FeedFormat;
  items: FeedItem[];
  warnings: string[];
}

/** Hard cap so a giant paste can't blow up memory / the store. */
const MAX_ITEMS = 2000;

/** The offering source a parsed format maps to. */
export function sourceForFormat(format: FeedFormat): OfferingSource {
  return format === "google" ? "merchant-center" : "feed";
}

// ---- shared text helpers -------------------------------------------------

/** Strip CDATA wrappers then decode the common XML entities (amp last). */
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/** Inner text of the first `<name>…</name>` (namespace + attributes tolerated). */
function tagText(block: string, name: string): string | undefined {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = re.exec(block);
  if (!m) return undefined;
  const v = decodeEntities(m[1]).trim();
  return v || undefined;
}

const first = (...vals: (string | undefined)[]): string | undefined => vals.find((v) => v != null && v !== "");

/** Parse a feed price string ("249", "249.00", "1 299,00 Kč", "12.99 CZK") to a number. */
export function parseFeedPrice(s?: string): number {
  if (!s) return 0;
  let x = s.replace(/[^\d.,-]/g, "");
  // Both separators present → "." is thousands, "," is the decimal (cs formatting).
  if (x.includes(",") && x.includes(".")) x = x.replace(/\./g, "").replace(",", ".");
  else x = x.replace(",", ".");
  const m = x.match(/-?\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ---- format detection ----------------------------------------------------

export function detectFeedFormat(text: string): FeedFormat | null {
  const head = text.slice(0, 6000);
  if (/<shopitem[\s>]/i.test(head)) return "heureka";
  if (/base\.google\.com\/ns\/1\.0/i.test(head) || /<g:id[\s>]/i.test(head)) return "google";
  if (/<item[\s>]/i.test(head) && /<g:/i.test(head)) return "google";
  if (!head.trimStart().startsWith("<")) return "csv";
  return null;
}

// ---- XML feeds -----------------------------------------------------------

/** All inner blocks for a repeated element, e.g. SHOPITEM or item. */
function blocks(text: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

function parseHeureka(text: string): FeedItem[] {
  return blocks(text, "SHOPITEM").map((b) => {
    const delivery = tagText(b, "DELIVERY_DATE");
    return {
      id: first(tagText(b, "ITEM_ID"), tagText(b, "PRODUCTNO")) ?? "",
      title: first(tagText(b, "PRODUCTNAME"), tagText(b, "PRODUCT")) ?? "",
      price: parseFeedPrice(first(tagText(b, "PRICE_VAT"), tagText(b, "PRICE"))),
      category: tagText(b, "CATEGORYTEXT"),
      ean: tagText(b, "EAN"),
      brand: tagText(b, "MANUFACTURER"),
      inStock: delivery == null ? undefined : delivery === "0",
      url: tagText(b, "URL"),
      imageUrl: tagText(b, "IMGURL"),
      description: tagText(b, "DESCRIPTION"),
    };
  });
}

function parseGoogle(text: string): FeedItem[] {
  return blocks(text, "item").map((b) => {
    const avail = tagText(b, "g:availability");
    return {
      id: first(tagText(b, "g:id"), tagText(b, "id")) ?? "",
      title: first(tagText(b, "g:title"), tagText(b, "title")) ?? "",
      price: parseFeedPrice(first(tagText(b, "g:price"), tagText(b, "g:sale_price"))),
      category: first(tagText(b, "g:product_type"), tagText(b, "g:google_product_category")),
      ean: tagText(b, "g:gtin"),
      brand: tagText(b, "g:brand"),
      inStock: avail == null ? undefined : /in.?stock|in_stock|available/i.test(avail),
      url: first(tagText(b, "g:link"), tagText(b, "link")),
      imageUrl: tagText(b, "g:image_link"),
      description: first(tagText(b, "g:description"), tagText(b, "description")),
    };
  });
}

// ---- CSV -----------------------------------------------------------------

/** Quote-aware CSV/TSV parser: returns records of raw string fields. Handles the
 *  RFC-4180 basics — quoted fields, "" escaping, delimiters/newlines inside quotes,
 *  CRLF. Delimiter is auto-detected from the header row. */
function parseCsvRecords(text: string): string[][] {
  const body = text.replace(/^﻿/, ""); // strip BOM
  const headerLine = body.slice(0, body.search(/\r?\n/) === -1 ? body.length : body.search(/\r?\n/));
  const delim = (() => {
    const counts = { ",": 0, ";": 0, "\t": 0 } as Record<string, number>;
    for (const ch of headerLine) if (ch in counts) counts[ch]++;
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",") as string;
  })();

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inQuotes) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && body[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    if (record.length > 1 || record[0] !== "") records.push(record);
  }
  return records;
}

const CSV_ALIASES: Record<keyof FeedItem, string[]> = {
  id: ["id", "sku", "item_id", "kód", "kod", "code", "productno"],
  title: ["title", "name", "productname", "product", "název", "nazev"],
  price: ["price", "price_vat", "cena", "cena_s_dph"],
  category: ["category", "categorytext", "kategorie"],
  ean: ["ean", "gtin", "barcode"],
  brand: ["brand", "manufacturer", "výrobce", "vyrobce", "značka", "znacka"],
  inStock: ["available", "availability", "dostupnost"],
  stock: ["stock", "quantity", "qty", "sklad", "mnozstvi", "množství"],
  url: ["url", "link", "odkaz"],
  imageUrl: ["image", "imgurl", "image_link", "obrazek", "obrázek"],
  description: ["description", "popis"],
};

function parseCsv(text: string): FeedItem[] {
  const records = parseCsvRecords(text);
  if (records.length < 2) return [];
  const header = records[0].map((h) => h.trim().toLowerCase());
  const idx = (aliases: string[]) => header.findIndex((h) => aliases.includes(h));
  const cols = Object.fromEntries(
    (Object.keys(CSV_ALIASES) as (keyof FeedItem)[]).map((k) => [k, idx(CSV_ALIASES[k])])
  ) as Record<keyof FeedItem, number>;

  const cell = (row: string[], k: keyof FeedItem) => (cols[k] >= 0 ? row[cols[k]]?.trim() : undefined);
  return records.slice(1).map((row) => {
    const availRaw = cell(row, "inStock");
    const stockRaw = cell(row, "stock");
    const stock = stockRaw != null && stockRaw !== "" ? Number(stockRaw.replace(/[^\d.-]/g, "")) : undefined;
    return {
      id: cell(row, "id") ?? "",
      title: cell(row, "title") ?? "",
      price: parseFeedPrice(cell(row, "price")),
      category: cell(row, "category"),
      ean: cell(row, "ean"),
      brand: cell(row, "brand"),
      inStock:
        availRaw != null ? /^(1|true|ano|yes|in.?stock|skladem|available)$/i.test(availRaw) : undefined,
      stock: stock != null && Number.isFinite(stock) ? stock : undefined,
      url: cell(row, "url"),
      imageUrl: cell(row, "imageUrl"),
      description: cell(row, "description"),
    };
  });
}

// ---- top-level parse -----------------------------------------------------

/** Parse feed text into normalized items. Never throws; returns warnings for a
 *  bad/empty/oversized feed. `format` may be forced, else it's auto-detected. */
export function parseFeed(text: string, format?: FeedFormat): ParsedFeed {
  const warnings: string[] = [];
  const fmt = format ?? detectFeedFormat(text);
  if (!fmt) {
    return { format: "csv", items: [], warnings: ["Formát feedu se nepodařilo rozpoznat."] };
  }
  const raw = fmt === "heureka" ? parseHeureka(text) : fmt === "google" ? parseGoogle(text) : parseCsv(text);

  // Keep rows that have at least an id or a title; a fully-empty row is noise.
  let items = raw.filter((it) => it.id || it.title);
  const dropped = raw.length - items.length;
  if (dropped > 0) warnings.push(`Vynecháno ${dropped} řádků bez ID i názvu.`);
  if (items.length > MAX_ITEMS) {
    warnings.push(`Feed má ${items.length} položek; importuje se prvních ${MAX_ITEMS}.`);
    items = items.slice(0, MAX_ITEMS);
  }
  if (items.length === 0) warnings.push("Feed neobsahuje žádné použitelné položky.");
  return { format: fmt, items, warnings };
}

/** Map normalized feed items to product offerings. Fills only feed-known fields;
 *  the merge step preserves user/warehouse fields (margin, velocity, stock counts,
 *  nature) that a feed doesn't carry. */
export function feedItemsToOfferings(
  items: FeedItem[],
  projectId: string,
  source: OfferingSource,
  now: string
): ProductOffering[] {
  return items.map((it, i) => {
    const sku = (it.id || `FEED-${i + 1}`).slice(0, 80);
    return {
      kind: "product",
      id: `${projectId}:${sku}`,
      projectId,
      name: (it.title || sku).slice(0, 200),
      category: (it.category || "Import").slice(0, 120),
      active: it.inStock ?? true,
      nature: "online",
      price: it.price,
      currency: "CZK",
      channels: [],
      tags: it.brand ? [it.brand.slice(0, 120)] : [],
      source,
      updatedAt: now,
      sku,
      // Feeds are availability/price feeds — an exact count is rare (CSV only);
      // unknown → 0, and the merge step keeps any existing warehouse count.
      stock: it.stock != null && it.stock >= 0 ? it.stock : 0,
      dailyVelocity: 0,
      ...(it.ean ? { gtin: it.ean.slice(0, 32) } : {}),
    };
  });
}
