/** A2 local-signals: the tolerant rank-import parser, the ladder builder, the
 *  sqlite store roundtrip, and the resolver's live-vs-sample decision. Exercises the
 *  `local_signals` table (DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-local-signals-test.db");
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

const { parseRankRows, ladderFromRows } = await import("@/lib/local-signals/import");
const { getLocalSignals, saveLocalSignals, clearLocalSignals } = await import("@/lib/local-signals/store");
const { resolveLocalLadder } = await import("@/lib/local-signals/resolve");

test("parser: header detection, mixed separators, dedup (last wins), rank clamp", () => {
  const rows = parseRankRows(
    [
      "klíčové slovo;oblast;pozice",
      "zubař;Žižkov;3",
      "zubař,Žižkov,5", // duplicate key → last wins (5)
      "implantáty\tVinohrady\t1",
      "ordinace;Žižkov;0", // rank < 1 → skipped
      "bad-row-only-one-cell",
    ].join("\n")
  );
  const byKey = Object.fromEntries(rows.map((r) => [`${r.keyword}|${r.area}`, r.rank]));
  assert.equal(byKey["zubař|Žižkov"], 5, "last write wins for a duplicate");
  assert.equal(byKey["implantáty|Vinohrady"], 1, "tab-separated row parsed");
  assert.equal(rows.length, 2, "rank<1 and short rows dropped");
});

test("parser: no header → assumes keyword,area,rank; clamps >100", () => {
  const rows = parseRankRows("zubař, Praha, 250");
  assert.deepEqual(rows, [{ keyword: "zubař", area: "Praha", rank: 100 }]);
});

test("parser: empty/blank input → []", () => {
  assert.deepEqual(parseRankRows("   \n\n"), []);
});

test("ladderFromRows: seeds history/current/best from the imported rank", () => {
  const [k] = ladderFromRows([{ keyword: "zubař", area: "Žižkov", rank: 3 }]);
  assert.equal(k.current, 3);
  assert.equal(k.best, 3);
  assert.deepEqual(k.history, [3]);
  assert.equal(k.area, "Žižkov");
});

const SAMPLE = [{ id: "s1", keyword: "x", area: "A", history: [9], current: 9, best: 9 }];

test("resolver: no import → sample ladder, live=false", async () => {
  const res = await resolveLocalLadder("proj-local", SAMPLE);
  assert.equal(res.live, false);
  assert.equal(res.source, "sample");
  assert.deepEqual(res.ladder, SAMPLE);
});

test("resolver: after import → live ladder with provenance", async () => {
  await saveLocalSignals("proj-local", {
    meta: { source: "import", syncedAt: "2026-07-08T09:00:00.000Z", rowCount: 1 },
    ladder: ladderFromRows([{ keyword: "zubař", area: "Žižkov", rank: 2 }]),
  });
  const res = await resolveLocalLadder("proj-local", SAMPLE);
  assert.equal(res.live, true);
  assert.equal(res.source, "import");
  assert.equal(res.ladder[0].current, 2);
});

test("store: clear reverts to sample", async () => {
  assert.ok(await getLocalSignals("proj-local"));
  await clearLocalSignals("proj-local");
  assert.equal(await getLocalSignals("proj-local"), null);
  assert.equal((await resolveLocalLadder("proj-local", SAMPLE)).live, false);
});
