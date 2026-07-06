/** Integration test for the wrapper-side BYOM wiring: the AsyncLocalStorage
 *  context round-trips, and resolveProviders puts the caller's own provider first
 *  with the vendor-default/override model reported. Does NOT call
 *  generateStructured (which would emit telemetry) — it exercises exactly the glue
 *  Phase 3/4 added: the context seam + provider ordering. resolveProviders probes
 *  the app's env providers (claude --version); that is cached and CI-safe (an
 *  absent CLI simply resolves to unavailable, leaving BYOM first regardless). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProviders } from "@/lib/llm/index.ts";
import { getByomContext, runWithByomContext } from "@/lib/llm/byom-context";

test("byom context round-trips and clears outside the run", () => {
  const key = { vendor: "openai", apiKey: "k", model: "gpt-4o" };
  assert.equal(getByomContext(), undefined);
  runWithByomContext(key, () => {
    assert.equal(getByomContext(), key);
  });
  assert.equal(getByomContext(), undefined);
});

test("resolveProviders puts the BYOM provider first with the resolved model", () => {
  const providers = resolveProviders(true, {
    vendor: "openai",
    apiKey: "k",
    model: "gpt-4o",
    fastModel: "gpt-4o-mini",
  });
  assert.ok(providers.length >= 1);
  // BYOM is always "available" (we only build it when a key is resolved) and first.
  assert.equal(providers[0].available(), true);
  assert.equal(providers[0].modelFor("quality"), "gpt-4o");
  assert.equal(providers[0].modelFor("fast"), "gpt-4o-mini");
});

test("resolveProviders without BYOM returns only env providers", () => {
  const providers = resolveProviders(true, undefined);
  // No key resolved → no BYOM entry; whatever env providers are available (0+).
  for (const p of providers) {
    assert.notEqual(p.modelFor("quality"), "gpt-4o"); // none is the openai BYOM provider
  }
});
