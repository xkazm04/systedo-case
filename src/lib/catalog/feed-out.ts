/** OUTBOUND product feed (WP W2-D) — the catalog serialized as the three feeds the
 *  Czech channels actually pull: Google Merchant RSS 2.0, Heureka `<SHOP><SHOPITEM>`
 *  and Zboží.cz (the same SHOPITEM family, Zboží's tag names). The inverse of
 *  `./feed.ts`, which parses those same three shapes on the way IN, and the reason the
 *  round-trip is testable at all: `parseFeed(feedOut(x, f))` runs the repo's OWN parser
 *  over the repo's own output, so the acceptance oracle is the code that already reads
 *  real merchant feeds — not a second, agreeing-by-construction fixture.
 *
 *  Dependency-free by the same argument feed.ts makes: these documents are flat and
 *  machine-generated, so hand-written escaping (the exact inverse of `decodeEntities`,
 *  feed.ts:50-60) beats pulling an XML builder into the bundle. Pure — no network, no
 *  store, no `Date.now()` unless the caller declines to supply `now`.
 *
 *  What it emits and what it deliberately does NOT:
 *   - PRODUCTS ONLY, and only LIVE ones (`isActiveProduct`, offering.ts:108) — a plan
 *     or a service has no availability, and a paused SKU must not be advertised. Capped
 *     at MAX_FEED_ITEMS (offering.ts:23).
 *   - No `link` / `image_link` per item. The catalog carries no product URL and no
 *     image, and the shop's homepage is not the product's landing page — emitting it
 *     would be a wrong URL rather than a missing one. Known seam: a per-offering URL
 *     (Merchant Center / the e-shop export) fills these in without touching this file.
 *   - `brand` and `description` come from `tags`, whose meaning is source-dependent and
 *     is read here exactly as the importer wrote it (see `brandOf`/`descriptionOf`).
 *   - Heureka/Zboží carry NO in/out-of-stock boolean: `DELIVERY_DATE` is a dispatch
 *     delay in working days ("0" = skladem, feed.ts:119-137). An unavailable SKU has no
 *     truthful delay to state, and inventing one ("30") would be a fabricated promise,
 *     so it is OMITTED from those two feeds — which is also both channels' own rule for
 *     an unsellable item. Google keeps it, because `g:availability` has a real
 *     `out of stock` value to tell the truth with. */
import {
  MAX_FEED_ITEMS,
  isActiveProduct,
  toProduct,
  type Offering,
  type ProductOffering,
} from "./offering";
import { feedLabelsBySku, type FeedLabels } from "./feed-labels";

export type FeedOutFormat = "google" | "heureka" | "zbozi";

/** The formats the public feed route accepts, in the order the panel lists them. */
export const FEED_OUT_FORMATS: readonly FeedOutFormat[] = ["google", "heureka", "zbozi"] as const;

/** The format served when `?format=` is absent or unrecognised. */
export const DEFAULT_FEED_OUT_FORMAT: FeedOutFormat = "google";

export function isFeedOutFormat(value: string | null | undefined): value is FeedOutFormat {
  return value != null && (FEED_OUT_FORMATS as readonly string[]).includes(value);
}

export interface FeedOutOptions {
  /** shop/project name — the RSS channel title and the Heureka document comment. */
  shopName: string;
  /** the shop's own site, when the project has a domain. Feed-level only (see header). */
  shopUrl?: string;
  /** reference date for the stock labels; defaults to the current instant. */
  now?: Date;
}

// ---- text helpers (the exact inverse of feed.ts's decodeEntities) ----------

/** Drop the C0 control characters XML 1.0 cannot represent at all — not even as a
 *  numeric entity — keeping the three it does allow (tab, LF, CR). Written as a
 *  codepoint filter rather than a control-character regex on purpose: the escape
 *  sequence for a raw control byte is exactly the kind of literal that gets mangled by
 *  a copy, a codemod or a CRLF normaliser, and this cannot be. */
function stripXmlIllegal(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    out += ch;
  }
  return out;
}

/** Escape text for an XML element body. `&` FIRST — it is the one replacement whose
 *  output the later ones would otherwise re-escape into `&amp;lt;`. */
export function escapeXml(value: string): string {
  return stripXmlIllegal(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A price both channels and `parseFeedPrice` (feed.ts:77-95) read back unchanged.
 *  Two decimals ALWAYS: it can never look like the cs "dot as thousands" shape
 *  ("1.299"), which that parser reads as 1299 — so a fixed 2-decimal string is the one
 *  formatting that survives the round trip for every price. */
function money(value: number): string {
  return (Number.isFinite(value) && value > 0 ? value : 0).toFixed(2);
}

/** One indented element, or "" when there is nothing true to say. An empty string is
 *  treated as absent on purpose: `tagText` trims and returns undefined for it, so an
 *  empty element and a missing one are already the same fact to the reader. */
function tag(name: string, value: string | undefined, indent = "    "): string {
  if (value == null) return "";
  const text = String(value).trim();
  if (text === "") return "";
  return `${indent}<${name}>${escapeXml(text)}</${name}>\n`;
}

// ---- what a row actually says ---------------------------------------------

/** Sources that are AVAILABILITY feeds: they carry in/out-of-stock but rarely an exact
 *  count, so their in-stock rows legitimately land with `stock: 0` (feed.ts:329). */
const isAvailabilityFeed = (o: ProductOffering): boolean =>
  o.source === "feed" || o.source === "merchant-center";

/** Is this SKU sellable right now — the same rule `toProduct` applies when it carries a
 *  feed's own availability past the sentinel 0 (offering.ts:126-130). A paused offering
 *  is never available; a feed-sourced one trusts the feed; everything else trusts the
 *  warehouse count. */
export function feedAvailable(o: ProductOffering): boolean {
  if (!o.active) return false;
  if (isAvailabilityFeed(o)) return true;
  return o.stock > 0;
}

/** `tags[0]` on a feed-imported offering IS the manufacturer — that is literally where
 *  `feedItemsToOfferings` puts it (feed.ts:323). On a hand-written offering the tags are
 *  selling points, so there is no brand to state and none is invented. */
function brandOf(o: ProductOffering): string | undefined {
  return isAvailabilityFeed(o) ? o.tags[0] : undefined;
}

/** The mirror of {@link brandOf}: on a hand-written offering the tags ARE the selling
 *  points, so they are the honest description. On a feed-imported one they hold the
 *  brand (already emitted as such), and the catalog kept no description text. */
function descriptionOf(o: ProductOffering): string | undefined {
  if (isAvailabilityFeed(o)) return undefined;
  return o.tags.length > 0 ? o.tags.join(" · ") : undefined;
}

interface FeedOutRow {
  offering: ProductOffering;
  available: boolean;
  labels: FeedLabels;
  brand?: string;
  description?: string;
}

/** The live product rows a feed is built from, in catalog order, capped. */
function buildRows(offerings: Offering[], now: Date): FeedOutRow[] {
  const products = offerings.filter(isActiveProduct).slice(0, MAX_FEED_ITEMS);
  const labels = feedLabelsBySku(products.map(toProduct), now);
  const fallback: FeedLabels = { label0: "marze-nizka", label1: "sklad-ok" };
  return products.map((offering) => ({
    offering,
    available: feedAvailable(offering),
    labels: labels.get(offering.sku) ?? fallback,
    brand: brandOf(offering),
    description: descriptionOf(offering),
  }));
}

// ---- Google Merchant RSS 2.0 ----------------------------------------------

const XML_HEAD = '<?xml version="1.0" encoding="utf-8"?>\n';

/** Google's availability values, in the classic RSS spelling Merchant Center still
 *  accepts and `parseGoogle` (feed.ts:169) reads back as its tri-state boolean. */
const G_IN_STOCK = "in stock";
const G_OUT_OF_STOCK = "out of stock";

function googleFeed(rows: FeedOutRow[], opts: FeedOutOptions): string {
  const items = rows
    .map((r) => {
      const o = r.offering;
      return (
        "    <item>\n" +
        tag("g:id", o.sku, "      ") +
        tag("g:title", o.name, "      ") +
        tag("g:description", r.description, "      ") +
        tag("g:product_type", o.category, "      ") +
        tag("g:brand", r.brand, "      ") +
        tag("g:gtin", o.gtin, "      ") +
        tag("g:price", `${money(o.price)} ${o.currency || "CZK"}`, "      ") +
        tag("g:availability", r.available ? G_IN_STOCK : G_OUT_OF_STOCK, "      ") +
        tag("g:custom_label_0", r.labels.label0, "      ") +
        tag("g:custom_label_1", r.labels.label1, "      ") +
        "    </item>\n"
      );
    })
    .join("");

  return (
    XML_HEAD +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
    "  <channel>\n" +
    tag("title", opts.shopName, "    ") +
    tag("link", opts.shopUrl, "    ") +
    tag("description", `${opts.shopName} — produktový feed (Adamant)`, "    ") +
    items +
    "  </channel>\n" +
    "</rss>\n"
  );
}

// ---- Heureka / Zboží.cz SHOPITEM ------------------------------------------

/** `DELIVERY_DATE` for a SKU that ships now. The only delay this app can state as a
 *  fact — see the header for why an unavailable SKU is omitted instead. */
const DISPATCH_NOW = "0";

/** One `<PARAM>` pair — Heureka's and Zboží's own label mechanism, carrying the SAME
 *  two label names Google gets as `custom_label_0/1` so a merchant writes one rule set
 *  across all three channels. */
function param(name: string, value: string): string {
  return `      <PARAM><PARAM_NAME>${escapeXml(name)}</PARAM_NAME><VAL>${escapeXml(value)}</VAL></PARAM>\n`;
}

function shopItemFeed(rows: FeedOutRow[], opts: FeedOutOptions, format: "heureka" | "zbozi"): string {
  const items = rows
    .filter((r) => r.available)
    .map((r) => {
      const o = r.offering;
      return (
        "    <SHOPITEM>\n" +
        tag("ITEM_ID", o.sku, "      ") +
        // Zboží.cz's required item name is <PRODUCT>; Heureka's is <PRODUCTNAME>. Both
        // are emitted for Zboží (its spec keeps PRODUCTNAME as the exact product name),
        // and `parseHeureka` prefers PRODUCTNAME either way (feed.ts:144).
        (format === "zbozi" ? tag("PRODUCT", o.name, "      ") : "") +
        tag("PRODUCTNAME", o.name, "      ") +
        tag("DESCRIPTION", r.description, "      ") +
        tag("PRICE_VAT", money(o.price), "      ") +
        tag("DELIVERY_DATE", DISPATCH_NOW, "      ") +
        tag("CATEGORYTEXT", o.category, "      ") +
        tag("EAN", o.gtin, "      ") +
        tag("MANUFACTURER", r.brand, "      ") +
        param("custom_label_0", r.labels.label0) +
        param("custom_label_1", r.labels.label1) +
        "    </SHOPITEM>\n"
      );
    })
    .join("");

  const channel = format === "zbozi" ? "Zboží.cz" : "Heureka";
  return (
    XML_HEAD +
    `<!-- ${escapeXml(opts.shopName)} — ${channel} feed (Adamant) -->\n` +
    "<SHOP>\n" +
    items +
    "</SHOP>\n"
  );
}

// ---- the dispatcher --------------------------------------------------------

/** Serialize a project's catalog as one outbound feed document. Always returns a VALID
 *  document: an empty catalog produces an empty-but-well-formed feed rather than an
 *  error, because a channel robot that gets a 404 or a broken body de-lists the shop,
 *  and a transiently empty catalog must not cost a merchant their listings. */
export function feedOut(offerings: Offering[], format: FeedOutFormat, opts: FeedOutOptions): string {
  const rows = buildRows(offerings, opts.now ?? new Date());
  if (format === "google") return googleFeed(rows, opts);
  return shopItemFeed(rows, opts, format);
}
