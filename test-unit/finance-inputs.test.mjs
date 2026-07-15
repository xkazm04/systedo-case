/** Direction 1 — the finance-inputs store: the wire sanitizers/coercers (scenario
 *  capping, real-numbers coercion, empty-field omission) and the sqlite store
 *  roundtrip (the `finance_inputs` table, DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-finance-inputs-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const { sanitizeFinanceInputs, coerceScenarios, coerceRealNumbers, coerceChannelMargins, FINANCE_SCENARIO_CAP } =
  await import("@/lib/profit/finance-inputs/types");
const { getFinanceInputs, saveFinanceInputs, clearFinanceInputs } = await import("@/lib/profit/finance-inputs/store");

const scenario = (id, savedAt, marginPct = 0.4) => ({
  id,
  name: `S ${id}`,
  margins: [{ channel: "Google Ads", marginPct }],
  savedAt,
});

test("sanitizeFinanceInputs: a non-object body is rejected (→ 400 in the route)", () => {
  assert.equal(sanitizeFinanceInputs(null), null);
  assert.equal(sanitizeFinanceInputs("nope"), null);
  assert.equal(sanitizeFinanceInputs(42), null);
});

test("sanitizeFinanceInputs: an empty object is valid and clears to a minimal blob", () => {
  assert.deepEqual(sanitizeFinanceInputs({}), { scenarios: [] });
});

test("sanitizeFinanceInputs: omits empty realNumbers / channelMargins, keeps present ones", () => {
  const clean = sanitizeFinanceInputs({
    scenarios: [scenario("a", 1)],
    realNumbers: { 90: { revenue: 1000, spend: 200 } },
    channelMargins: [{ channel: "Meta", marginPct: 0.5 }],
  });
  assert.equal(clean.scenarios.length, 1);
  assert.deepEqual(clean.realNumbers, { 90: { revenue: 1000, spend: 200 } });
  assert.deepEqual(clean.channelMargins, [{ channel: "Meta", marginPct: 0.5 }]);

  // Empty sub-fields are dropped so the stored doc stays minimal.
  const bare = sanitizeFinanceInputs({ scenarios: [], realNumbers: {}, channelMargins: [] });
  assert.deepEqual(bare, { scenarios: [] });
  assert.equal("realNumbers" in bare, false);
  assert.equal("channelMargins" in bare, false);
});

test("coerceScenarios: drops malformed entries (bad id/name/margins)", () => {
  const out = coerceScenarios([
    scenario("ok", 1),
    { id: 5, name: "bad id", margins: [] },
    { id: "x", name: "no margins array" },
    { id: "y", name: "bad margin", margins: [{ channel: "C", marginPct: "NaN" }] },
    null,
  ]);
  assert.equal(out.length, 2); // "ok" and "y" (y keeps [] after its bad margin drops)
  const y = out.find((s) => s.id === "y");
  assert.deepEqual(y.margins, []);
});

test("coerceScenarios: caps to FINANCE_SCENARIO_CAP, keeping the most recently saved", () => {
  const many = Array.from({ length: FINANCE_SCENARIO_CAP + 5 }, (_, i) => scenario(`s${i}`, i));
  const out = coerceScenarios(many);
  assert.equal(out.length, FINANCE_SCENARIO_CAP);
  // The 5 oldest (savedAt 0..4) are dropped; s5.. survive.
  assert.equal(out.some((s) => s.id === "s0"), false);
  assert.equal(out.some((s) => s.id === "s4"), false);
  assert.equal(out.some((s) => s.id === "s5"), true);
});

test("coerceRealNumbers: keeps finite non-negative revenue/spend, floors the rest to 0", () => {
  const out = coerceRealNumbers({
    30: { revenue: 500, spend: 100 },
    90: { revenue: -5, spend: "abc" },
    365: "not-an-object",
  });
  assert.deepEqual(out[30], { revenue: 500, spend: 100 });
  assert.deepEqual(out[90], { revenue: 0, spend: 0 });
  assert.equal(365 in out, false);
});

test("coerceChannelMargins: keeps well-formed pairs, drops the rest", () => {
  const out = coerceChannelMargins([
    { channel: "A", marginPct: 0.3 },
    { channel: 7, marginPct: 0.3 },
    { channel: "B", marginPct: Infinity },
    "nope",
  ]);
  assert.deepEqual(out, [{ channel: "A", marginPct: 0.3 }]);
});

test("store: save → get roundtrips the blob; clear reverts to null", async () => {
  const P = "proj-fin-a";
  assert.equal(await getFinanceInputs(P), null);
  await saveFinanceInputs(P, {
    scenarios: [scenario("a", 1)],
    realNumbers: { 90: { revenue: 2000, spend: 400 } },
    channelMargins: [{ channel: "Google Ads", marginPct: 0.45 }],
    updatedAt: "2026-07-15T00:00:00.000Z",
  });
  const got = await getFinanceInputs(P);
  assert.equal(got.scenarios[0].id, "a");
  assert.equal(got.realNumbers[90].revenue, 2000);
  assert.equal(got.channelMargins[0].marginPct, 0.45);
  await clearFinanceInputs(P);
  assert.equal(await getFinanceInputs(P), null);
});
