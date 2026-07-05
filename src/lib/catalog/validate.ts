/** Sanitize offerings coming from the client before they're persisted. This is the
 *  trust boundary for the catalog store: bound array length + every string, clamp
 *  numbers, coerce enums to valid values, drop malformed rows. Framework-free. */
import type {
  Offering,
  OfferingKind,
  OfferingNature,
  OfferingSource,
  PlanOffering,
  ProductOffering,
  ServiceOffering,
} from "./offering";

const MAX_OFFERINGS = 500;
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
const strArr = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, maxItems).map((x) => (x as string).slice(0, maxLen)) : [];

function oneOf<T extends string>(set: Set<T>, v: unknown, fb: T): T {
  return typeof v === "string" && (set as Set<string>).has(v) ? (v as T) : fb;
}

function sanitizeOne(raw: Raw, projectId: string, i: number, now: string): Offering | null {
  const kind = oneOf(KINDS, raw.kind, "product") as OfferingKind;
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind as OfferingKind)) return null;

  const base = {
    id: str(raw.id, 128) || `${projectId}:i${i}`,
    projectId,
    name: str(raw.name, 200),
    category: str(raw.category, 120),
    active: bool(raw.active),
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
export function sanitizeOfferings(input: unknown, projectId: string, now = new Date().toISOString()): Offering[] {
  if (!Array.isArray(input)) return [];
  const out: Offering[] = [];
  for (let i = 0; i < input.length && out.length < MAX_OFFERINGS; i++) {
    const item = input[i];
    if (item && typeof item === "object") {
      const o = sanitizeOne(item as Raw, projectId, i, now);
      if (o) out.push(o);
    }
  }
  return out;
}
