/** Sanitize offerings coming from the client before they're persisted. This is the
 *  trust boundary for the catalog store: bound array length + every string, clamp
 *  numbers, coerce enums to valid values, drop malformed rows. Framework-free. */
import {
  MAX_FEED_ITEMS,
  MAX_OFFERINGS,
  type Offering,
  type OfferingKind,
  type OfferingNature,
  type OfferingSource,
  type PlanOffering,
  type ProductOffering,
  type ServiceOffering,
} from "./offering";
const KINDS = new Set<OfferingKind>(["product", "plan", "service"]);
const NATURES = new Set<OfferingNature>(["online", "local", "hybrid"]);
const SOURCES = new Set<OfferingSource>([
  "manual",
  "baselinker",
  "shoptet",
  "shipmonk",
  "skladon",
  "merchant-center",
  "erp",
  "feed",
]);
const INTERVALS = new Set(["month", "year", "one-off"]);
const PRICE_MODELS = new Set(["from", "fixed", "quote"]);

type Raw = Record<string, unknown>;

const str = (v: unknown, max: number, fb = ""): string => (typeof v === "string" ? v.slice(0, max) : fb);
const num = (v: unknown, min: number, max: number, fb = 0): number =>
  Math.min(max, Math.max(min, typeof v === "number" && Number.isFinite(v) ? v : fb));
const optNum = (v: unknown, min: number, max: number): number | undefined =>
  v == null ? undefined : num(v, min, max);
const bool = (v: unknown, fb = true): boolean => (typeof v === "boolean" ? v : fb);

/** Options that switch sanitize between its two callers. The PUT route (a full,
 *  trusted-shape catalog the user edited) uses the strict defaults; the feed-import
 *  route opts into the looser, merge-aware behaviour. */
export interface SanitizeOpts {
  /** Preserve the feed availability tri-state: when the incoming row is SILENT on
   *  `active` (undefined — the feed carried no availability field), leave it unset so
   *  the downstream merge can keep the user's manual paused/active choice instead of
   *  defaulting a silent feed to active. Strict mode (default) coerces unknown → true.
   *  The invariant `active: boolean` is restored by mergeCatalog (overlay preserves the
   *  existing value; a brand-new product defaults to active). */
  preserveActiveTriState?: boolean;
  /** Array-length cap. Defaults to MAX_OFFERINGS (the catalog cap — the PUT trust
   *  boundary). The import route raises this to MAX_FEED_ITEMS so sanitize does NOT
   *  silently pre-clip feed rows below the catalog cap; the single honest cap is then
   *  applied once, on the MERGED result, by mergeCatalog. */
  maxItems?: number;
}

/** Resolve `active` honoring the tri-state option. In strict mode an unknown value
 *  defaults to active; in tri-state mode a silent feed (undefined) stays unset (cast),
 *  so mergeCatalog — not this boundary — decides the paused/active outcome. */
function activeFor(v: unknown, opts: SanitizeOpts): boolean {
  if (typeof v === "boolean") return v;
  return (opts.preserveActiveTriState && v === undefined ? undefined : true) as boolean;
}
const strArr = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, maxItems).map((x) => (x as string).slice(0, maxLen)) : [];

function oneOf<T extends string>(set: Set<T>, v: unknown, fb: T): T {
  return typeof v === "string" && (set as Set<string>).has(v) ? (v as T) : fb;
}

function sanitizeOne(raw: Raw, projectId: string, i: number, now: string, opts: SanitizeOpts): Offering | null {
  const kind = oneOf(KINDS, raw.kind, "product") as OfferingKind;
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind as OfferingKind)) return null;

  const base = {
    id: str(raw.id, 128) || `${projectId}:i${i}`,
    projectId,
    name: str(raw.name, 200),
    category: str(raw.category, 120),
    active: activeFor(raw.active, opts),
    nature: oneOf(NATURES, raw.nature, "online") as OfferingNature,
    price: num(raw.price, 0, 1e9),
    currency: "CZK",
    cost: optNum(raw.cost, 0, 1e9),
    margin: optNum(raw.margin, 0, 1),
    channels: strArr(raw.channels, 20, 80),
    tags: strArr(raw.tags, 20, 160),
    source: oneOf(SOURCES, raw.source, "manual") as OfferingSource,
    updatedAt: now,
  };

  if (kind === "product") {
    const p: ProductOffering = {
      ...base,
      kind: "product",
      sku: str(raw.sku, 80) || `SKU-${i}`,
      stock: num(raw.stock, 0, 1e9),
      dailyVelocity: num(raw.dailyVelocity, 0, 1e6),
      restockDate: typeof raw.restockDate === "string" ? raw.restockDate.slice(0, 10) : undefined,
      incomingQty: optNum(raw.incomingQty, 0, 1e9),
      gtin: typeof raw.gtin === "string" ? raw.gtin.slice(0, 32) : undefined,
      emoji: typeof raw.emoji === "string" ? raw.emoji.slice(0, 8) : undefined,
    };
    return p;
  }
  if (kind === "plan") {
    const competitors = Array.isArray(raw.competitors)
      ? raw.competitors
          .slice(0, 30)
          .map((c) => {
            const cc = (c ?? {}) as Raw;
            return {
              name: str(cc.name, 120),
              url: typeof cc.url === "string" ? cc.url.slice(0, 300) : undefined,
              price: optNum(cc.price, 0, 1e9),
            };
          })
          .filter((c) => c.name)
      : [];
    const plan: PlanOffering = {
      ...base,
      kind: "plan",
      interval: oneOf(INTERVALS, raw.interval, "month") as PlanOffering["interval"],
      competitors,
      differentiators: strArr(raw.differentiators, 20, 200),
    };
    return plan;
  }
  const service: ServiceOffering = {
    ...base,
    kind: "service",
    priceModel: oneOf(PRICE_MODELS, raw.priceModel, "from") as ServiceOffering["priceModel"],
    serviceAreas: strArr(raw.serviceAreas, 50, 64),
    capacityPerWeek: optNum(raw.capacityPerWeek, 0, 100000),
  };
  return service;
}

/** Validate + normalize an unknown payload into a bounded Offering[]. Never throws;
 *  invalid rows are dropped. */
export function sanitizeOfferings(
  input: unknown,
  projectId: string,
  now = new Date().toISOString(),
  opts: SanitizeOpts = {}
): Offering[] {
  if (!Array.isArray(input)) return [];
  const cap = Math.min(opts.maxItems ?? MAX_OFFERINGS, MAX_FEED_ITEMS);
  const out: Offering[] = [];
  for (let i = 0; i < input.length && out.length < cap; i++) {
    const item = input[i];
    if (item && typeof item === "object") {
      const o = sanitizeOne(item as Raw, projectId, i, now, opts);
      if (o) out.push(o);
    }
  }
  return out;
}
