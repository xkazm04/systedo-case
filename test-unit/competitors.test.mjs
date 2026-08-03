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

const { sanitizeCompetitors, curatedCompetitors, competitorSource, isCurated, MAX_COMPETITORS } =
  await import("@/lib/competitors/types");
const { mergeScanSuggestions } = await import("@/lib/competitors/merge");
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
  assert.deepEqual(clean.competitors[0], { name: "Alza", source: "manual", note: "levnější" });
  assert.equal(clean.competitors[1].name, "CZC");
  assert.equal(clean.competitors[1].note, undefined);
  // The overflow is COUNTED, not silently swallowed — the route turns this into a
  // coded warning on the {ok:true} envelope.
  assert.equal(clean.dropped, 4);
});

test("sanitize: nothing usable → null", () => {
  assert.equal(sanitizeCompetitors({ competitors: [{ name: "  " }, {}] }), null);
  assert.equal(sanitizeCompetitors(null), null);
});

test("sanitize: accepts a bare array too", () => {
  const clean = sanitizeCompetitors([{ name: "Notino" }]);
  assert.equal(clean.competitors[0].name, "Notino");
  assert.equal(clean.dropped, 0);
});

/* ── provenance ───────────────────────────────────────────────────────────── */

test("sanitize: carries provenance, defaults to manual, confirms only scan entries", () => {
  const clean = sanitizeCompetitors({
    competitors: [
      { name: "Alza" },
      { name: "CZC", source: "scan" },
      { name: "Datart", source: "scan", confirmed: true },
      { name: "Mall", source: "nonsense", confirmed: true },
    ],
  });
  assert.deepEqual(clean.competitors, [
    { name: "Alza", source: "manual" },
    { name: "CZC", source: "scan" },
    { name: "Datart", source: "scan", confirmed: true },
    // an unknown source falls back to manual; `confirmed` is meaningless there
    { name: "Mall", source: "manual" },
  ]);
});

test("sanitize: defaultSource tags a whole payload (the onboarding scan path)", () => {
  const clean = sanitizeCompetitors({ competitors: [{ name: "Alza" }] }, { defaultSource: "scan" });
  assert.equal(clean.competitors[0].source, "scan");
  assert.equal(clean.competitors[0].confirmed, undefined);
});

test("sanitize: folds duplicate names (case + diacritics) to one entry", () => {
  const clean = sanitizeCompetitors({ competitors: [{ name: "Alza" }, { name: "alza" }, { name: "Alža" }] });
  assert.equal(clean.competitors.length, 1);
  assert.equal(clean.competitors[0].name, "Alza");
});

test("sanitize: the cap costs SUGGESTIONS first — a manual name is never dropped for a scan guess", () => {
  const clean = sanitizeCompetitors({
    competitors: [
      ...Array.from({ length: 7 }, (_, i) => ({ name: `S${i}`, source: "scan" })),
      { name: "Mine A" },
      { name: "Mine B" },
    ],
  });
  assert.equal(clean.competitors.length, MAX_COMPETITORS);
  assert.equal(clean.dropped, 1);
  const kept = clean.competitors.map((c) => c.name);
  assert.ok(kept.includes("Mine A") && kept.includes("Mine B"), "both manual names survive");
});

test("LEGACY records (no `source`) read as manual and stay grounded", () => {
  const legacy = { name: "Alza" };
  assert.equal(competitorSource(legacy), "manual");
  assert.equal(isCurated(legacy), true);
  assert.equal(curatedCompetitors([legacy]).length, 1);
  const text = competitorGroundingText({ competitors: [legacy], updatedAt: "x" });
  assert.match(text, /Konkurenční pole: Alza\./);
});

/* ── merge: a scan must never clobber curated names ───────────────────────── */

test("merge: appends new suggestions as UNCONFIRMED scan entries, existing untouched", () => {
  const existing = [{ name: "Alza", source: "manual", note: "levnější" }];
  const m = mergeScanSuggestions(existing, ["CZC", "Datart"]);
  assert.deepEqual(m.competitors, [
    { name: "Alza", source: "manual", note: "levnější" },
    { name: "CZC", source: "scan" },
    { name: "Datart", source: "scan" },
  ]);
  assert.equal(m.added, 2);
  assert.equal(m.unchanged, false);
});

test("merge: NEVER overwrites or drops a manually-entered competitor", () => {
  const existing = [
    { name: "Alza", source: "manual", note: "mine" },
    { name: "CZC", source: "scan", confirmed: true },
  ];
  const m = mergeScanSuggestions(existing, ["alza", "CZC", "Nový"]);
  // The two suggestions that collide are SKIPPED — no downgrade to `scan`, no
  // un-confirm, no note loss, no reordering.
  assert.deepEqual(m.competitors.slice(0, 2), existing);
  assert.equal(m.skipped, 2);
  assert.equal(m.added, 1);
  assert.equal(m.competitors[2].name, "Nový");
});

test("merge: a legacy set (entries with no source) survives a re-scan intact", () => {
  const legacy = [{ name: "Alza" }, { name: "CZC" }];
  const m = mergeScanSuggestions(legacy, ["Alza", "Datart"]);
  assert.deepEqual(m.competitors.slice(0, 2), legacy, "legacy entries pass through byte-identical");
  assert.equal(m.skipped, 1);
  assert.equal(curatedCompetitors(m.competitors).map((c) => c.name).join(","), "Alza,CZC");
});

test("merge: the cap only ever costs suggestions, and reports the loss", () => {
  const existing = Array.from({ length: 8 }, (_, i) => ({ name: `M${i}`, source: "manual" }));
  const m = mergeScanSuggestions(existing, ["Nový", "Další"]);
  assert.deepEqual(m.competitors, existing);
  assert.equal(m.added, 0);
  assert.equal(m.dropped, 2);
  assert.equal(m.unchanged, true, "caller can skip the write entirely");
});

test("merge: re-applying the same scan is idempotent (no duplicates, no write)", () => {
  const first = mergeScanSuggestions([], ["Alza", "CZC"]);
  const second = mergeScanSuggestions(first.competitors, ["Alza", "CZC"]);
  assert.deepEqual(second.competitors, first.competitors);
  assert.equal(second.unchanged, true);
});

test("merge: skips blank/whitespace suggestions", () => {
  const m = mergeScanSuggestions([], ["   ", "", "Alza"]);
  assert.equal(m.competitors.length, 1);
  assert.equal(m.added, 1);
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

test("grounding: an UNCONFIRMED scan suggestion never reaches the prompt", () => {
  const set = {
    competitors: [
      { name: "Alza", source: "manual" },
      { name: "CZC", source: "scan" }, // unconfirmed guess
      { name: "Datart", source: "scan", confirmed: true },
    ],
    updatedAt: "x",
  };
  const cs = competitorGroundingText(set);
  assert.match(cs, /Konkurenční pole: Alza, Datart\./);
  assert.equal(cs.includes("CZC"), false, "an unreviewed scan guess must not be asserted to the model");
  // …and the no-fabrication guardrail sentence is untouched.
  assert.match(cs, /netvrď neověřená čísla/);
  assert.match(competitorGroundingText(set, "en"), /never state unverified competitor numbers/);
});

test("grounding: a set of ONLY unconfirmed suggestions grounds nothing", () => {
  const set = { competitors: [{ name: "CZC", source: "scan" }], updatedAt: "x" };
  assert.equal(competitorGroundingText(set), "");
  assert.equal(competitorGroundingText(set, "en"), "");
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

test("store: provenance + ORDER roundtrip unchanged (both backends store the same blob)", async () => {
  // The sqlite and Firestore backends both persist JSON.stringify(set) under the
  // project id, so shape and ordering are identical by construction — this pins that
  // the richer entry shape survives the roundtrip without normalisation.
  const set = {
    competitors: [
      { name: "Alza", source: "manual", note: "levnější" },
      { name: "CZC", source: "scan" },
      { name: "Datart", source: "scan", confirmed: true },
    ],
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
  await saveCompetitors("proj-prov", set);
  assert.deepEqual(await getCompetitors("proj-prov"), set);
  await clearCompetitors("proj-prov");
});

test("store: a LEGACY row (no `source`) still reads back and grounds", async () => {
  await saveCompetitors("proj-legacy", { competitors: [{ name: "Alza" }], updatedAt: "2026-01-01T00:00:00.000Z" });
  const got = await getCompetitors("proj-legacy");
  assert.equal(got.competitors[0].source, undefined, "no backfill — the old shape is left alone");
  assert.match(competitorGroundingText(got), /Alza/);
  await clearCompetitors("proj-legacy");
});
