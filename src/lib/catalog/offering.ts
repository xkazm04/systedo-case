/** The canonical business entity for a project: an "offering" — a physical product
 *  (e-shop), a subscription/plan (app/SaaS) or a service (lead-gen / local). This is
 *  the spine that grounds the smart modules in the client's real business instead of
 *  scattered per-module fixtures. One polymorphic union, discriminated by `kind`, so
 *  the same resolver feeds Sklad & sezónnost (products), Srovnání & SEO (plans +
 *  competitors) and Lokální dominance (services × localities).
 *
 *  `ProductOffering` is a near-superset of the legacy `Product` (src/lib/catalog/
 *  sample.ts) so existing inventory/creative modules keep working via `toProduct`. */
import type { Product } from "./sample";

/** THE catalog cap — the single rule for "how big a project's catalog may get".
 *  Enforced authoritatively at ONE boundary: mergeCatalog caps the MERGED result to
 *  this (existing rows kept, newest feed additions dropped, with an honest warning), and
 *  sanitizeOfferings bounds a PUT payload to the same number. Because merge caps the
 *  persisted set, a later PUT re-sanitize can never silently drop rows the import kept. */
export const MAX_OFFERINGS = 500;

/** Feed-ingest safety ceiling (≥ MAX_OFFERINGS): a hard bound on how many rows the
 *  parser materializes and sanitize normalizes, so a giant paste can't blow up memory.
 *  It is NOT the catalog cap — it sits well above it precisely so it does NOT silently
 *  pre-clip a feed below the cap; the honest catalog cap is applied once, at merge. */
export const MAX_FEED_ITEMS = 5000;

export type OfferingKind = "product" | "plan" | "service";

/** The online/local axis the whole design hangs on: is the offering shipped/served
 *  online, bound to a physical locality, or both. */
export type OfferingNature = "online" | "local" | "hybrid";

export type OfferingSource =
  | "manual"
  | "baselinker"
  | "shoptet"
  | "shipmonk"
  | "skladon"
  | "merchant-center"
  | "erp"
  /** imported from a product feed (Heureka / Zboží.cz / generic XML or CSV). */
  | "feed";

export interface OfferingBase {
  id: string;
  projectId: string;
  name: string;
  category: string;
  active: boolean;
  nature: OfferingNature;
  /** CZK. For services/plans this is the headline / "from" price. */
  price: number;
  currency: string;
  /** COGS in CZK, when known. */
  cost?: number;
  /** gross-margin fraction 0–1; when omitted, derived by category (src/lib/margins). */
  margin?: number;
  /** where the offering is listed / sold (Zboží.cz, Heureka, Google Business…). */
  channels: string[];
  /** short selling points — grounds generated creative & comparison scaffolds. */
  tags: string[];
  source: OfferingSource;
  updatedAt: string;
}

export interface ProductOffering extends OfferingBase {
  kind: "product";
  sku: string;
  stock: number;
  dailyVelocity: number;
  restockDate?: string;
  incomingQty?: number;
  gtin?: string;
  emoji?: string;
}

export interface PlanOffering extends OfferingBase {
  kind: "plan";
  interval: "month" | "year" | "one-off";
  /** named rivals — powers the auto-generated "{name} vs {competitor}" SEO queries. */
  competitors: { name: string; url?: string; price?: number }[];
  differentiators: string[];
}

export interface ServiceOffering extends OfferingBase {
  kind: "service";
  priceModel: "from" | "fixed" | "quote";
  /** Locality ids this service is offered in — powers the local coverage matrix. */
  serviceAreas: string[];
  capacityPerWeek?: number;
}

export type Offering = ProductOffering | PlanOffering | ServiceOffering;

/** A place a local/service business operates in — replaces the free-text `area`
 *  string the Lokální module uses today. */
export interface Locality {
  id: string;
  name: string;
  region?: string;
}

export const isProduct = (o: Offering): o is ProductOffering => o.kind === "product";
export const isPlan = (o: Offering): o is PlanOffering => o.kind === "plan";
export const isService = (o: Offering): o is ServiceOffering => o.kind === "service";

/** Adapt a product offering back to the legacy `Product` shape, so the existing
 *  inventory (`stockRows`, `budgetChangeSet`) and creative (`buildAssetGroup`)
 *  modules consume the catalog with zero downstream changes. */
export function toProduct(o: ProductOffering): Product {
  return {
    sku: o.sku,
    title: o.name,
    category: o.category,
    price: o.price,
    stock: o.stock,
    dailyVelocity: o.dailyVelocity,
    emoji: o.emoji ?? "📦",
    usps: o.tags,
    margin: o.margin,
    restockDate: o.restockDate,
    incomingQty: o.incomingQty,
  };
}
