/** The catalog CHANGE LEDGER's detector — pure, no I/O, no LLM.
 *
 *  Why it exists: a performance move ("ROAS fell on the 14th") is usually explained
 *  by something that happened to the CATALOG on that day — a price rise, a SKU going
 *  out of stock, a product paused. The catalog itself only ever stores its CURRENT
 *  state (one blob per project), so that history was unrecoverable. This turns any
 *  "before → after" pair of catalogs into durable, SKU-level events that the three
 *  write paths (feed import, warehouse sync, manual PUT) append to a per-project
 *  ledger.
 *
 *  Deliberately INDEPENDENT of `mergeCatalog`: the manual PUT never merges, so a
 *  detector living inside the merge would be blind to exactly the path a human uses.
 *  It compares by the same key rule the merge does (`sku || id`), so an event's key
 *  and a merge's identity never disagree.
 *
 *  Pure module — safe to import from a route, a test or a client-adjacent module. */
import type { Offering } from "./offering";
import { isProduct } from "./offering";

export type CatalogEventKind =
  | "added"
  | "removed"
  | "price"
  | "stock"
  | "active"
  | "margin"
  | "renamed";

/** WHICH write path produced the event — the ledger's provenance. */
export type CatalogEventActor = "feed-import" | "warehouse-sync" | "manual";

export interface CatalogEvent {
  /** `${at}_${key}_${kind}` — stable, so re-appending the same batch is idempotent
   *  rather than a duplicate storm (a retried import must not double the ledger). */
  id: string;
  /** ISO timestamp of the batch that produced the event. */
  at: string;
  /** the offering's identity: `sku || id` (the merge's key rule). */
  key: string;
  /** the offering's name at event time (the PREVIOUS name for `removed`). */
  name: string;
  kind: CatalogEventKind;
  before?: number | string | boolean | null;
  after?: number | string | boolean | null;
  actor: CatalogEventActor;
  /** warehouse provider id when actor = "warehouse-sync" (e.g. "baselinker"). */
  provider?: string;
}

/** How many events a project's ledger keeps (oldest evicted on append). */
export const CATALOG_EVENT_CAP = 2000;

/** Float guard for money-ish fields: CZK prices and 0–1 margins both round-trip
 *  through JSON, so an exact `!==` would emit phantom events on re-serialisation.
 *  Half a haléř is below anything a user can see or set. */
const MONEY_EPSILON = 0.005;

/** Stock is an integer count; a sub-unit "change" is noise, never a restock. */
const STOCK_EPSILON = 1;

const keyOf = (o: Offering): string => (isProduct(o) ? o.sku || o.id : o.id);

/** `undefined` and `null` are the same thing here — "no margin known" — so a blob
 *  round-trip that drops an absent key must not read as a change. */
const marginOf = (o: Offering): number | null => (o.margin == null ? null : o.margin);

function numberChanged(before: number, after: number, epsilon: number): boolean {
  return Math.abs(after - before) >= epsilon;
}

function marginChanged(before: number | null, after: number | null): boolean {
  if (before == null && after == null) return false;
  if (before == null || after == null) return true;
  return numberChanged(before, after, MONEY_EPSILON);
}

/** Detect every SKU-level change between two catalog states.
 *
 *  Rules (the contract the fixture test pins):
 *   • `added` / `removed` are TERMINAL for a key in a batch — a key that appeared or
 *     disappeared never also emits field events, because "price changed" is a lie
 *     about a product that did not exist on one side of the comparison.
 *   • `price` / `margin` need a ≥ 0.005 move, `stock` a ≥ 1 move (float/noise guard).
 *   • `renamed` on any name difference; `active` on any flip.
 *   • ids are `${at}_${key}_${kind}`, so re-running the same batch at the same `at`
 *     overwrites its own rows instead of duplicating them.
 *
 *  Output order is deterministic: additions + field events in `next` order, then
 *  removals in `current` order. Bounded at CATALOG_EVENT_CAP — a batch can never
 *  cost more writes than the ledger is allowed to hold. */
export function diffCatalogEvents(
  current: Offering[],
  next: Offering[],
  now: string,
  actor: CatalogEventActor,
  provider?: string
): CatalogEvent[] {
  const before = new Map<string, Offering>();
  for (const o of current) {
    const k = keyOf(o);
    if (k && !before.has(k)) before.set(k, o);
  }

  const events: CatalogEvent[] = [];
  const seen = new Set<string>();
  const push = (key: string, name: string, kind: CatalogEventKind, from?: CatalogEvent["before"], to?: CatalogEvent["after"]) => {
    events.push({
      id: `${now}_${key}_${kind}`,
      at: now,
      key,
      name,
      kind,
      ...(from === undefined ? {} : { before: from }),
      ...(to === undefined ? {} : { after: to }),
      actor,
      ...(provider ? { provider } : {}),
    });
  };

  for (const after of next) {
    const key = keyOf(after);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const prev = before.get(key);

    if (!prev) {
      // Terminal: a brand-new row has no "before" to compare fields against.
      push(key, after.name, "added", undefined, after.price);
      continue;
    }

    if (prev.name !== after.name) push(key, after.name, "renamed", prev.name, after.name);
    if (numberChanged(prev.price, after.price, MONEY_EPSILON)) {
      push(key, after.name, "price", prev.price, after.price);
    }
    if (prev.active !== after.active) push(key, after.name, "active", prev.active, after.active);
    if (marginChanged(marginOf(prev), marginOf(after))) {
      push(key, after.name, "margin", marginOf(prev), marginOf(after));
    }
    // Stock lives on products only — a plan or a service has no count to move.
    if (isProduct(prev) && isProduct(after) && numberChanged(prev.stock, after.stock, STOCK_EPSILON)) {
      push(key, after.name, "stock", prev.stock, after.stock);
    }
  }

  for (const prev of current) {
    const key = keyOf(prev);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    push(key, prev.name, "removed", prev.price, undefined);
  }

  return events.length > CATALOG_EVENT_CAP ? events.slice(0, CATALOG_EVENT_CAP) : events;
}

/** Czech labels for the activity-feed rollup. The `n×` shape is deliberate: it is
 *  plural-safe in Czech without a plural-rules table, so "1× cena" and "5× cena"
 *  are both correct. */
const SUMMARY_LABELS: Record<Exclude<CatalogEventKind, "added">, string> = {
  removed: "vyřazeno",
  price: "cena",
  stock: "sklad",
  active: "stav",
  margin: "marže",
  renamed: "název",
};

const SUMMARY_ORDER: Exclude<CatalogEventKind, "added">[] = [
  "removed",
  "price",
  "stock",
  "active",
  "margin",
  "renamed",
];

/** A compact rollup of a batch for the project ACTIVITY feed's `detail` line —
 *  e.g. `+3 · 5× cena · 1× vyřazeno`. Empty string when nothing changed, so a
 *  caller can append it conditionally without producing a dangling separator. */
export function summarizeCatalogEvents(events: CatalogEvent[]): string {
  if (events.length === 0) return "";
  const counts = new Map<CatalogEventKind, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);

  const parts: string[] = [];
  const added = counts.get("added") ?? 0;
  if (added > 0) parts.push(`+${added}`);
  for (const kind of SUMMARY_ORDER) {
    const n = counts.get(kind) ?? 0;
    if (n > 0) parts.push(`${n}× ${SUMMARY_LABELS[kind]}`);
  }
  return parts.join(" · ");
}
