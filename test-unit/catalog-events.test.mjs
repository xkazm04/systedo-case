/** WP W1-A — the catalog change ledger's PURE detector (src/lib/catalog/events.ts).
 *  Pins the contract the three write paths depend on: which field moves become
 *  events, the float/noise guards, that added/removed are terminal for a key, that
 *  ids are stable (so a retried import is idempotent), and the activity rollup. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_EVENT_CAP,
  diffCatalogEvents,
  summarizeCatalogEvents,
} from "@/lib/catalog/events.ts";

const NOW = "2026-08-29T10:00:00.000Z";

const product = (over = {}) => ({
  kind: "product",
  id: "p:S1",
  projectId: "p",
  name: "Termoska 500 ml",
  category: "Termosky",
  active: true,
  nature: "online",
  price: 499,
  currency: "CZK",
  margin: 0.32,
  channels: [],
  tags: [],
  source: "manual",
  updatedAt: "old",
  sku: "S1",
  stock: 40,
  dailyVelocity: 2,
  ...over,
});

const kinds = (events) => events.map((e) => e.kind).sort();
const one = (events, kind) => events.find((e) => e.kind === kind);

test("diffCatalogEvents: an unchanged catalog produces no events", () => {
  const a = product();
  assert.deepEqual(diffCatalogEvents([a], [{ ...a }], NOW, "manual"), []);
});

test("diffCatalogEvents: added is terminal — a new SKU emits exactly one event", () => {
  const events = diffCatalogEvents([], [product()], NOW, "feed-import");
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "added");
  assert.equal(events[0].key, "S1");
  assert.equal(events[0].name, "Termoska 500 ml");
  assert.equal(events[0].after, 499);
  assert.equal(events[0].actor, "feed-import");
});

test("diffCatalogEvents: removed is terminal and carries the previous name + price", () => {
  const events = diffCatalogEvents([product()], [], NOW, "manual");
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "removed");
  assert.equal(events[0].name, "Termoska 500 ml");
  assert.equal(events[0].before, 499);
});

test("diffCatalogEvents: price / stock / active / margin / renamed each emit their own event", () => {
  const before = product();
  const after = product({
    name: "Termoska 500 ml (nová)",
    price: 549,
    stock: 12,
    active: false,
    margin: 0.41,
  });
  const events = diffCatalogEvents([before], [after], NOW, "warehouse-sync", "baselinker");
  assert.deepEqual(kinds(events), ["active", "margin", "price", "renamed", "stock"]);
  assert.deepEqual(
    [one(events, "price").before, one(events, "price").after],
    [499, 549]
  );
  assert.deepEqual([one(events, "stock").before, one(events, "stock").after], [40, 12]);
  assert.deepEqual([one(events, "active").before, one(events, "active").after], [true, false]);
  assert.deepEqual([one(events, "margin").before, one(events, "margin").after], [0.32, 0.41]);
  assert.equal(one(events, "renamed").before, "Termoska 500 ml");
  // provenance rides on every row of the batch
  assert.ok(events.every((e) => e.actor === "warehouse-sync" && e.provider === "baselinker"));
});

test("diffCatalogEvents: float guard — sub-half-haléř price/margin drift is NOT a change", () => {
  const before = product();
  const after = product({ price: 499.004, margin: 0.320004 });
  assert.deepEqual(diffCatalogEvents([before], [after], NOW, "manual"), []);
  // …but a visible (≥ 1 haléř) move is
  const real = diffCatalogEvents([before], [product({ price: 499.01 })], NOW, "manual");
  assert.deepEqual(kinds(real), ["price"]);
});

test("diffCatalogEvents: stock guard — a sub-unit move is NOT a restock", () => {
  const before = product();
  assert.deepEqual(diffCatalogEvents([before], [product({ stock: 40.5 })], NOW, "manual"), []);
  assert.deepEqual(
    kinds(diffCatalogEvents([before], [product({ stock: 41 })], NOW, "manual")),
    ["stock"]
  );
});

test("diffCatalogEvents: an absent margin equals a null margin (no phantom event)", () => {
  const before = product({ margin: undefined });
  const after = product();
  delete after.margin;
  assert.deepEqual(diffCatalogEvents([before], [after], NOW, "manual"), []);
  // gaining a margin IS a change
  const gained = diffCatalogEvents([before], [product({ margin: 0.5 })], NOW, "manual");
  assert.deepEqual(kinds(gained), ["margin"]);
  assert.equal(one(gained, "margin").before, null);
});

test("diffCatalogEvents: ids are `${at}_${key}_${kind}` — re-running a batch is idempotent", () => {
  const before = product();
  const after = product({ price: 549 });
  const first = diffCatalogEvents([before], [after], NOW, "manual");
  const again = diffCatalogEvents([before], [after], NOW, "manual");
  assert.equal(first[0].id, `${NOW}_S1_price`);
  assert.deepEqual(first.map((e) => e.id), again.map((e) => e.id));
  assert.equal(new Set(first.map((e) => e.id)).size, first.length, "ids are unique in a batch");
});

test("diffCatalogEvents: identity is `sku || id`, matching mergeCatalog's key rule", () => {
  const noSku = product({ sku: "", id: "p:legacy" });
  const events = diffCatalogEvents([noSku], [{ ...noSku, price: 600 }], NOW, "manual");
  assert.equal(events[0].key, "p:legacy");
  // a non-product (plan) keys off its id and still reports price/active/renamed
  const plan = {
    kind: "plan", id: "p:pro", projectId: "p", name: "Pro", category: "Plans", active: true,
    nature: "online", price: 990, currency: "CZK", channels: [], tags: [], source: "manual",
    updatedAt: "old", interval: "month", competitors: [], differentiators: [],
  };
  const planEvents = diffCatalogEvents([plan], [{ ...plan, price: 1290, active: false }], NOW, "manual");
  assert.deepEqual(kinds(planEvents), ["active", "price"]);
  assert.equal(planEvents[0].key, "p:pro");
});

test("diffCatalogEvents: a replace-shaped batch mixes added + removed + field events", () => {
  const keep = product({ id: "p:S1", sku: "S1" });
  const drop = product({ id: "p:S2", sku: "S2", name: "Láhev" });
  const fresh = product({ id: "p:S3", sku: "S3", name: "Hrnek" });
  const events = diffCatalogEvents(
    [keep, drop],
    [product({ price: 599 }), fresh],
    NOW,
    "feed-import"
  );
  assert.deepEqual(kinds(events), ["added", "price", "removed"]);
  assert.equal(one(events, "removed").key, "S2");
  assert.equal(one(events, "added").key, "S3");
});

test("diffCatalogEvents: a batch is bounded by CATALOG_EVENT_CAP", () => {
  assert.equal(CATALOG_EVENT_CAP, 2000);
  const many = Array.from({ length: CATALOG_EVENT_CAP + 50 }, (_, i) =>
    product({ id: `p:S${i}`, sku: `S${i}` })
  );
  assert.equal(diffCatalogEvents([], many, NOW, "feed-import").length, CATALOG_EVENT_CAP);
});

test("summarizeCatalogEvents: a plural-safe Czech rollup for the activity feed", () => {
  const events = diffCatalogEvents(
    [product({ id: "p:S1", sku: "S1" }), product({ id: "p:S2", sku: "S2" })],
    [product({ price: 599 }), product({ id: "p:S3", sku: "S3", name: "Hrnek" })],
    NOW,
    "manual"
  );
  assert.equal(summarizeCatalogEvents(events), "+1 · 1× vyřazeno · 1× cena");
  assert.equal(summarizeCatalogEvents([]), "", "empty batch adds no dangling separator");
});
