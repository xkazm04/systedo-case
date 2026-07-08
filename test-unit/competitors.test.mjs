/** C3 competitors: the input sanitiser, the grounding renderer, and the sqlite store
 *  roundtrip (table `competitors`, DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-competitors-test.db");
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

const { sanitizeCompetitors } = await import("@/lib/competitors/types");
const { competitorGroundingText } = await import("@/lib/competitors/grounding");
const { getCompetitors, saveCompetitors, clearCompetitors } = await import("@/lib/competitors/store");

test("sanitize: keeps named rivals, trims, drops blanks, caps at 8", () => {
  const clean = sanitizeCompetitors({
    competitors: [
      { name: "  Alza  ", note: " levnější " },
      { name: "" },
      { name: "CZC" },
      ...Array.from({ length: 10 }, (_, i) => ({ name: `X${i}` })),
    ],
  });
  assert.equal(clean.competitors.length, 8);
  assert.deepEqual(clean.competitors[0], { name: "Alza", note: "levnější" });
  assert.equal(clean.competitors[1].name, "CZC");
  assert.equal(clean.competitors[1].note, undefined);
});

test("sanitize: nothing usable → null", () => {
  assert.equal(sanitizeCompetitors({ competitors: [{ name: "  " }, {}] }), null);
  assert.equal(sanitizeCompetitors(null), null);
});

test("sanitize: accepts a bare array too", () => {
  const clean = sanitizeCompetitors([{ name: "Notino" }]);
  assert.equal(clean.competitors[0].name, "Notino");
});

test("grounding: empty set → '', else names the set with a no-fabrication guardrail", () => {
  assert.equal(competitorGroundingText(null), "");
  assert.equal(competitorGroundingText({ competitors: [], updatedAt: "x" }), "");
  const cs = competitorGroundingText({ competitors: [{ name: "Alza", note: "levnější" }, { name: "CZC" }], updatedAt: "x" });
  assert.match(cs, /Konkurenční pole: Alza \(levnější\), CZC\./);
  assert.match(cs, /netvrď neověřená čísla/);
  const en = competitorGroundingText({ competitors: [{ name: "Alza" }], updatedAt: "x" }, "en");
  assert.match(en, /Competitive set: Alza\./);
  assert.match(en, /never state unverified competitor numbers/);
});

test("store: save → get roundtrips; clear reverts to null", async () => {
  assert.equal(await getCompetitors("proj-c3"), null);
  await saveCompetitors("proj-c3", { competitors: [{ name: "Alza" }], updatedAt: "2026-07-08T00:00:00.000Z" });
  const got = await getCompetitors("proj-c3");
  assert.equal(got.competitors[0].name, "Alza");
  assert.equal(got.updatedAt, "2026-07-08T00:00:00.000Z");
  await clearCompetitors("proj-c3");
  assert.equal(await getCompetitors("proj-c3"), null);
});
