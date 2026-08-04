/** The vendor-wide BYOM model fields are validated like the matrix already is.
 *
 *  `isByomCatalogModel` is the SINGLE validator both surfaces call (POST
 *  /api/byom/matrix and PATCH /api/byom), so a model id can never be accepted by one
 *  and rejected by the other. And a model change drops the validation stamp, so the
 *  "Verified" pill can no longer stay lit against a pairing nothing has verified. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-byom-catalog-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
process.env.BYOM_KEY_SECRET = "unit-test-byom-secret-please-ignore";
register("./json-loader.mjs", import.meta.url);

const { BYOM_MODEL_CATALOG, BYOM_VENDORS, isByomCatalogModel } = await import("@/lib/llm/keys/types");
const { markByomValidation, putByomKey, setByomKeyModels } = await import("@/lib/llm/keys/store");
const { getByomConfig } = await import("@/lib/llm/keys/store.local.ts");

test("isByomCatalogModel accepts exactly what the catalog offers", () => {
  for (const vendor of BYOM_VENDORS) {
    const cat = BYOM_MODEL_CATALOG[vendor];
    assert.equal(isByomCatalogModel(vendor, cat.default), true, `${vendor} default`);
    for (const m of cat.models) assert.equal(isByomCatalogModel(vendor, m.id), true, `${vendor}/${m.id}`);
  }
});

test("an unknown model id is rejected — typos, retired ids, other vendors, non-strings", () => {
  assert.equal(isByomCatalogModel("openai", "gpt-5.4-minii"), false); // typo
  assert.equal(isByomCatalogModel("openai", "gpt-4o"), false); // retired
  assert.equal(isByomCatalogModel("openai", "claude-sonnet-5"), false); // another vendor's model
  assert.equal(isByomCatalogModel("anthropic", ""), false);
  assert.equal(isByomCatalogModel("anthropic", undefined), false);
  assert.equal(isByomCatalogModel("anthropic", null), false);
  assert.equal(isByomCatalogModel("anthropic", 42), false);
  assert.equal(isByomCatalogModel("gemini", " gemini-3.5-flash "), false); // no fuzzy match
});

test("the matrix and the vendor-wide field share ONE catalog — no second copy to drift", () => {
  // Every model the matrix can assign is, by construction, a model the vendor-wide
  // field accepts: both ask this same function.
  for (const vendor of BYOM_VENDORS) {
    for (const m of BYOM_MODEL_CATALOG[vendor].models) {
      assert.equal(isByomCatalogModel(vendor, m.id), true);
    }
  }
});

test("changing a model invalidates the verification, but keeps a definitive error", async () => {
  const uid = "byom-catalog-user";
  await putByomKey(uid, "openai", "sk-live-openai-catalog-tail-ZZZZ");
  await markByomValidation(uid, "openai", { ok: true });
  assert.ok((await getByomConfig(uid)).keys.openai.lastValidatedAt, "probe stamped");

  // Same (empty) selection re-saved → the verdict survives.
  await setByomKeyModels(uid, "openai", { model: null, fastModel: null });
  assert.ok((await getByomConfig(uid)).keys.openai.lastValidatedAt, "no-op save keeps the verdict");

  // A real change → the "Verified" claim is dropped (the probe ran on another model).
  await setByomKeyModels(uid, "openai", { model: "gpt-5.4" });
  const after = (await getByomConfig(uid)).keys.openai;
  assert.equal(after.model, "gpt-5.4");
  assert.equal(after.lastValidatedAt, undefined);

  // Re-saving the identical value must not be treated as a change.
  await markByomValidation(uid, "openai", { ok: true });
  await setByomKeyModels(uid, "openai", { model: "gpt-5.4" });
  assert.ok((await getByomConfig(uid)).keys.openai.lastValidatedAt, "identical re-save keeps it");

  // A definitive failure is NOT cured by picking a different model, so lastError stays.
  await markByomValidation(uid, "openai", { ok: false, error: "Neplatný klíč." });
  await setByomKeyModels(uid, "openai", { fastModel: "gpt-5.4-mini" });
  const errored = (await getByomConfig(uid)).keys.openai;
  assert.equal(errored.lastError, "Neplatný klíč.");
  assert.equal(errored.fastModel, "gpt-5.4-mini");
});

test("clearing a model back to the vendor default also invalidates the verification", async () => {
  const uid = "byom-catalog-clear-user";
  await putByomKey(uid, "anthropic", "sk-ant-catalog-key-tail-YYYY");
  await setByomKeyModels(uid, "anthropic", { model: "claude-opus-4-8" });
  await markByomValidation(uid, "anthropic", { ok: true });
  assert.ok((await getByomConfig(uid)).keys.anthropic.lastValidatedAt);

  await setByomKeyModels(uid, "anthropic", { model: null });
  const after = (await getByomConfig(uid)).keys.anthropic;
  assert.equal(after.model, undefined);
  assert.equal(after.lastValidatedAt, undefined);
});
