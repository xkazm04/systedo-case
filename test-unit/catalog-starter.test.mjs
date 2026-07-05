/** Unit tests for the create-time starter catalog (Phase 2c): the right primary kind
 *  per project type, the captured nature applied to every offering, nature-aware
 *  channels/areas, and rows that survive the persistence sanitizer unchanged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultNatureFor, starterCatalog } from "@/lib/catalog/starter";
import { sanitizeOfferings } from "@/lib/catalog/validate";

test("defaultNatureFor: local services default to local, others to online", () => {
  assert.equal(defaultNatureFor("leadgen"), "local");
  assert.equal(defaultNatureFor("eshop"), "online");
  assert.equal(defaultNatureFor("app"), "online");
  assert.equal(defaultNatureFor("content"), "online");
});

test("starterCatalog picks the type's primary kind and applies the nature", () => {
  const kinds = (type, nature) => new Set(starterCatalog("p", type, nature).map((o) => o.kind));
  assert.deepEqual([...kinds("eshop", "online")], ["product"]);
  assert.deepEqual([...kinds("app", "online")], ["plan"]);
  assert.deepEqual([...kinds("leadgen", "local")], ["service"]);
  assert.deepEqual([...kinds("content", "online")].sort(), ["plan", "service"]);

  for (const type of ["eshop", "app", "leadgen", "content"]) {
    const cat = starterCatalog("p", type, "hybrid");
    assert.ok(cat.length > 0, `${type} starter is non-empty`);
    assert.ok(cat.every((o) => o.nature === "hybrid"), `${type} offerings carry the nature`);
    assert.ok(cat.every((o) => o.projectId === "p"));
  }
});

test("nature shapes eshop channels and leadgen service areas", () => {
  const localProduct = starterCatalog("p", "eshop", "local")[0];
  assert.ok(localProduct.channels.includes("Prodejna"));
  assert.ok(!localProduct.channels.includes("Zboží.cz"));

  const hybridProduct = starterCatalog("p", "eshop", "hybrid")[0];
  assert.ok(hybridProduct.channels.includes("Prodejna") && hybridProduct.channels.includes("Zboží.cz"));

  const onlineService = starterCatalog("p", "leadgen", "online")[0];
  assert.deepEqual(onlineService.serviceAreas, []);
  const localService = starterCatalog("p", "leadgen", "local")[0];
  assert.ok(localService.serviceAreas.length > 0);
});

test("starter rows survive the persistence sanitizer unchanged", () => {
  for (const type of ["eshop", "app", "leadgen", "content"]) {
    const cat = starterCatalog("proj-x", type, "online");
    const clean = sanitizeOfferings(cat, "proj-x");
    assert.equal(clean.length, cat.length, `${type}: no rows dropped by the sanitizer`);
  }
});
