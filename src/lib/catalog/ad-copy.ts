/** Pure, framework-free model for PERSISTED per-SKU ad copy — the "generate once,
 *  keep it" spine behind the catalog creative module. AI ad copy used to be pinned to
 *  a single in-memory SKU and DISCARDED the moment the user switched products (500
 *  SKUs = 500 clicks, nothing saved). This module is the stored form: one blob per
 *  project holding one entry per SKU (the ads-tool payload + when it was generated +
 *  which model produced it), with pure transitions so the store's read-modify-write is
 *  a thin dispatcher and the interesting logic is unit-testable without any I/O.
 *
 *  No React / no server imports, so it is safe to import from both the client module
 *  and the server store. Mirrors the shape of src/lib/recaps/types.ts. */
import { AD_LIMITS, type AdResult, type Platform, type Tone } from "@/lib/ai-types";
import type { Product } from "./sample";
import { MAX_OFFERINGS } from "./offering";
import { buildAssetGroup, type Asset, type AssetGroup } from "./generate";
import type { AssetGroupExportMeta, CatalogAdCopyExportRow } from "./export";

/** How many per-SKU ad-copy entries a project may persist. Bounded by the catalog cap
 *  itself (MAX_OFFERINGS) — a project can't have more SKUs than that, so copy can't
 *  either — which also keeps the persisted blob comfortably under the project_state
 *  size cap the store rides on. Oldest entries drop off when a NEW SKU exceeds it. */
export const AD_COPY_SKU_CAP = MAX_OFFERINGS;

/** Per-string / per-list bounds for a persisted entry — the trust boundary for the
 *  AiResult the CLIENT echoes back to persist (it is our own tool's output, but a
 *  tampered client must not be able to store arbitrary or unbounded text). Mirrors
 *  the ads tool's normalize caps. */
const MAX_TEXT = 300;
const MAX_LIST = { headlines: 10, descriptions: 6, callouts: 6, keywords: 14 } as const;

export interface StoredAdCopy {
  /** the product SKU this copy belongs to (the entry key). */
  sku: string;
  /** the ads-tool payload (headlines / descriptions / callouts / keywords / long
   *  headline / rationale) — the same AdResult the interactive generation returns. */
  result: AdResult;
  /** ISO timestamp the copy was produced (drives the "generated N ago" age label). */
  generatedAt: string;
  /** model provenance: the provider/model tag that served it (or "demo" for the
   *  keyless deterministic fallback), so the UI can attribute the copy honestly. */
  model: string;
  /** true when produced by the keyless demo fallback (labelled honestly in the UI). */
  demo: boolean;
}

/** The per-project persisted blob (mirrors the {items, updatedAt} shape of the other
 *  single-blob stores). One entry per SKU; `items` is newest-generated-first. */
export interface AdCopyState {
  items: StoredAdCopy[];
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Trust boundary — bound a client-echoed entry before it is persisted.
// --------------------------------------------------------------------------

const bound = (s: unknown): string => (typeof s === "string" ? s.slice(0, MAX_TEXT) : "");
const boundList = (v: unknown, cap: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, cap).map((x) => x.slice(0, MAX_TEXT)) : [];

/** Coerce an untrusted, client-supplied entry into a bounded StoredAdCopy. `sku` is
 *  forced from the trusted argument (never read from the payload), lists + strings are
 *  capped, and `generatedAt` falls back to `now` when missing/invalid. Pure. */
export function sanitizeAdCopy(raw: unknown, sku: string, now: Date = new Date()): StoredAdCopy {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const r = (o.result && typeof o.result === "object" ? o.result : {}) as Record<string, unknown>;
  const result: AdResult = {
    headlines: boundList(r.headlines, MAX_LIST.headlines),
    descriptions: boundList(r.descriptions, MAX_LIST.descriptions),
    callouts: boundList(r.callouts, MAX_LIST.callouts),
    keywords: boundList(r.keywords, MAX_LIST.keywords),
    longHeadline: bound(r.longHeadline),
    rationale: bound(r.rationale),
  };
  const at = typeof o.generatedAt === "string" && !Number.isNaN(Date.parse(o.generatedAt))
    ? o.generatedAt
    : now.toISOString();
  return {
    sku: sku.slice(0, MAX_TEXT),
    result,
    generatedAt: at,
    model: bound(o.model) || "demo",
    demo: o.demo === true,
  };
}

// --------------------------------------------------------------------------
// Pure state transitions — no I/O, so the store is a thin dispatcher.
// --------------------------------------------------------------------------

/** The empty blob. */
export function emptyAdCopyState(now: Date = new Date()): AdCopyState {
  return { items: [], updatedAt: now.toISOString() };
}

/** Upsert one SKU's copy: replace an existing entry for the same SKU in place (so a
 *  regenerate overwrites, not duplicates), else prepend as the newest. When adding a
 *  NEW sku would exceed `cap`, the OLDEST entries drop off the tail. Never mutates the
 *  input. Pure. */
export function upsertAdCopy(
  prev: AdCopyState | null,
  entry: StoredAdCopy,
  cap = AD_COPY_SKU_CAP,
  now: Date = new Date()
): AdCopyState {
  const rest = (prev?.items ?? []).filter((it) => it.sku !== entry.sku);
  const items = [entry, ...rest].slice(0, Math.max(1, cap));
  return { items, updatedAt: now.toISOString() };
}

/** The persisted copy for a SKU, or null. */
export function adCopyForSku(state: AdCopyState | null, sku: string): StoredAdCopy | null {
  return state?.items.find((it) => it.sku === sku) ?? null;
}

/** SKU → entry lookup, for O(1) reads while rendering a large product list. */
export function adCopyBySku(state: AdCopyState | null): Record<string, StoredAdCopy> {
  const out: Record<string, StoredAdCopy> = {};
  for (const it of state?.items ?? []) out[it.sku] = it;
  return out;
}

// --------------------------------------------------------------------------
// Selection math — the multi-select + batch-cost decisions, pure so the sidebar
// checkbox logic and the honest cost line are unit-testable.
// --------------------------------------------------------------------------

/** Toggle a sku in a selection list (add if absent, remove if present). Returns a new
 *  array; never mutates. Pure. */
export function toggleSelected(selected: string[], sku: string): string[] {
  return selected.includes(sku) ? selected.filter((s) => s !== sku) : [...selected, sku];
}

/** A summary of a batch selection against what's already persisted: how many SKUs are
 *  selected, how many of them already have saved copy (a regenerate → overwrite) and
 *  how many are fresh. `count` is exactly the quota cost — one generation per selected
 *  SKU, no bypass — which the honest cost line reads from. Pure. */
export interface SelectionSummary {
  count: number;
  withExisting: number;
  fresh: number;
}
export function selectionSummary(selected: string[], state: AdCopyState | null): SelectionSummary {
  const have = new Set((state?.items ?? []).map((it) => it.sku));
  const uniq = Array.from(new Set(selected));
  const withExisting = uniq.filter((s) => have.has(s)).length;
  return { count: uniq.length, withExisting, fresh: uniq.length - withExisting };
}

// --------------------------------------------------------------------------
// AdResult → AssetGroup folding + catalog-wide export composition.
// --------------------------------------------------------------------------

/** Wrap a plain string in the {text,len,max} Asset shape. */
export const toAsset = (text: string, max: number): Asset => ({ text, len: text.length, max });

/** Fold a flat AdResult from the `ads` tool into the AssetGroup shape the UI + the
 *  exporters render, mapping each list to the matching Google Ads limit. Pure — shared
 *  by the interactive panel and the catalog-wide export so both render identically. */
export function adResultToGroup(r: AdResult, product: Product, domain = ""): AssetGroup {
  return {
    sku: product.sku,
    finalUrl: `https://${domain || "www.example.com"}/p/${product.sku.toLowerCase()}`,
    headlines: r.headlines.map((h) => toAsset(h, AD_LIMITS.headline)),
    longHeadlines: r.longHeadline ? [toAsset(r.longHeadline, AD_LIMITS.longHeadline)] : [],
    descriptions: r.descriptions.map((d) => toAsset(d, AD_LIMITS.description)),
  };
}

/** The Editor names an asset group lands under (campaign per category, asset group per
 *  product), so the export drops straight into Google Ads Editor. */
export function exportMetaFor(product: Product): AssetGroupExportMeta {
  return { campaign: `${product.category} – PMax`, assetGroupName: product.title };
}

/** Compose the catalog-wide export: one row per product, using persisted AI copy when
 *  the SKU has it (source "ai"), else the always-on deterministic floor from the feed
 *  (source "floor", labeled in the export). So "export everything" covers the WHOLE
 *  catalog — every product ships with at least the assembled fallback, and the
 *  model-written SKUs are marked as such. Pure. */
export function composeCatalogAdCopy(
  products: Product[],
  state: AdCopyState | null,
  brand = "",
  domain = ""
): CatalogAdCopyExportRow[] {
  const bySku = adCopyBySku(state);
  return products.map((p) => {
    const stored = bySku[p.sku];
    const group = stored ? adResultToGroup(stored.result, p, domain) : buildAssetGroup(p, brand, domain);
    return { group, meta: exportMetaFor(p), source: stored ? "ai" : "floor" };
  });
}

// --------------------------------------------------------------------------
// The per-product ad request — one source of truth for the interactive single
// generation AND the batch, so both send byte-identical payloads through /api/ai.
// --------------------------------------------------------------------------

export interface CatalogAdRequest {
  product: string;
  benefits: string;
  audience: string;
  platform: Platform;
  tone: Tone;
}

/** Build the `ads` request for a product: grounded in the actual catalog category
 *  (not a hardcoded audience), with a benefits fallback so a USP-less product still
 *  passes the 2–600-char validator instead of failing the whole batch item. Pure. */
export function adRequestForProduct(p: Product): CatalogAdRequest {
  const benefits = p.usps.filter(Boolean).join(", ") || p.category || p.title;
  return {
    product: p.title,
    benefits,
    audience: `Zákazníci se zájmem o ${p.category.toLowerCase()}`,
    platform: "google",
    tone: "pratelsky",
  };
}
