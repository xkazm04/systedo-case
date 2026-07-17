/** C1 brand-context deriver: turns a project + its Offering spine into an on-brand
 *  grounding block (what it sells + how it talks), or "" for an empty catalogue. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const { deriveBrandContext } = await import("@/lib/brand/context");

const project = { id: "p1", name: "Ořechový svět", type: "eshop" };

function product(over = {}) {
  return {
    id: "o1",
    projectId: "p1",
    kind: "product",
    name: "Kešu natural",
    category: "Ořechy",
    active: true,
    nature: "online",
    price: 120,
    currency: "Kč",
    channels: ["Heureka", "Zboží.cz"],
    tags: ["bio kvalita", "česká rodinná firma"],
    source: "seed",
    updatedAt: "x",
    sku: "K1",
    stock: 10,
    dailyVelocity: 1,
    ...over,
  };
}

test("empty / all-inactive catalogue → empty string (name-only is noise)", () => {
  assert.equal(deriveBrandContext(project, []), "");
  assert.equal(deriveBrandContext(project, [product({ active: false })]), "");
});

test("cs: names the brand, sortiment, price band, differentiators, channels", () => {
  const out = deriveBrandContext(project, [
    product({ category: "Ořechy", price: 120 }),
    product({ id: "o2", category: "Semínka", price: 450, tags: ["bio kvalita", "pražení na zakázku"] }),
  ]);
  assert.match(out, /Značka: Ořechový svět\./);
  assert.match(out, /Sortiment: /);
  assert.match(out, /Ořechy/);
  assert.match(out, /Semínka/);
  assert.match(out, /120–450 Kč/); // price band across the catalogue
  assert.match(out, /bio kvalita/); // a differentiator surfaced
  assert.match(out, /Heureka/); // a sales channel surfaced
  assert.match(out, /nevymýšlej jiný sortiment/); // the guardrail line
});

test("en: localized labels + guardrail", () => {
  const out = deriveBrandContext(project, [product()], "en");
  assert.match(out, /Brand: Ořechový svět\./);
  assert.match(out, /Sells: /);
  assert.match(out, /don't invent other products/);
});

test("nature is aggregated: a mixed online/local catalogue reads as hybrid", () => {
  const out = deriveBrandContext(project, [
    product({ id: "a", nature: "online" }),
    product({ id: "b", nature: "local" }),
  ]);
  // must NOT assert the first element's nature; mixed → "online i naživo"
  assert.match(out, /Prodává online i naživo\./);
});

test("nature: an all-in-person catalogue is not mislabeled as online", () => {
  const out = deriveBrandContext(project, [
    product({ id: "a", nature: "local" }),
    product({ id: "b", nature: "local" }),
  ]);
  assert.match(out, /Prodává naživo \/ s provozovnou\./);
  assert.doesNotMatch(out, /Prodává online\./);
});

test("price band is banded within the dominant currency, never mixing Kč + EUR", () => {
  const out = deriveBrandContext(project, [
    product({ id: "a", price: 120, currency: "Kč" }),
    product({ id: "b", price: 450, currency: "Kč" }),
    product({ id: "c", price: 99, currency: "EUR" }),
  ]);
  assert.match(out, /120–450 Kč/); // dominant currency (Kč: 2 vs EUR: 1)
  assert.doesNotMatch(out, /99/); // the EUR amount is not merged into the Kč band
  assert.doesNotMatch(out, /EUR/);
});

test("category frequency ranks the sortiment (most common first)", () => {
  const out = deriveBrandContext(project, [
    product({ id: "a", category: "Ořechy" }),
    product({ id: "b", category: "Ořechy" }),
    product({ id: "c", category: "Semínka" }),
  ]);
  assert.match(out, /Sortiment: Ořechy, Semínka/);
});
