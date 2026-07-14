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

const { parseRankRows, ladderFromRows, mergeLadder, normalizeLadder, normalizeSignals } =
  await import("@/lib/local-signals/import");
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

test("ladderFromRows: seeds a single date-stamped point; current/best from the rank", () => {
  const [k] = ladderFromRows([{ keyword: "zubař", area: "Žižkov", rank: 3 }], "2026-07-01T00:00:00.000Z");
  assert.equal(k.current, 3);
  assert.equal(k.best, 3);
  assert.deepEqual(k.history, [{ rank: 3, at: "2026-07-01" }]);
  assert.equal(k.area, "Žižkov");
});

test("mergeLadder: stamps each import, appends dated points, keeps HISTORY_CAP", () => {
  let ladder = ladderFromRows([{ keyword: "zubař", area: "Žižkov", rank: 5 }], "2026-05-01T00:00:00Z");
  ladder = mergeLadder(ladder, [{ keyword: "zubař", area: "Žižkov", rank: 3 }], "2026-06-01T00:00:00Z");
  ladder = mergeLadder(ladder, [{ keyword: "zubař", area: "Žižkov", rank: 2 }], "2026-07-01T00:00:00Z");
  const [k] = ladder;
  assert.deepEqual(
    k.history.map((p) => [p.rank, p.at]),
    [[5, "2026-05-01"], [3, "2026-06-01"], [2, "2026-07-01"]]
  );
  assert.equal(k.current, 2);
  assert.equal(k.best, 2); // min across the dated history
  // cap: 15 sequential imports retain only the last 12 points
  let capped = ladderFromRows([{ keyword: "k", area: "A", rank: 20 }], "2026-01-01T00:00:00Z");
  for (let i = 1; i <= 15; i++) {
    const at = new Date(Date.parse("2026-01-01T00:00:00Z") + i * 86_400_000).toISOString();
    capped = mergeLadder(capped, [{ keyword: "k", area: "A", rank: 20 - (i % 5) }], at);
  }
  assert.equal(capped[0].history.length, 12);
});

test("normalizeLadder: reads a LEGACY bare-number history cleanly (dual-shape)", () => {
  const legacy = [{ id: "s1", keyword: "x", area: "A", history: [9, 6, 4], current: 4, best: 4 }];
  const [k] = normalizeLadder(legacy, "2026-07-01T00:00:00Z");
  // coerced to dated points, newest anchored on the import time, oldest back-dated
  assert.equal(k.history.length, 3);
  assert.equal(k.history[2].at, "2026-07-01");
  assert.deepEqual(k.history.map((p) => p.rank), [9, 6, 4]);
  assert.equal(k.current, 4);
  assert.equal(k.best, 4);
  for (const p of k.history) assert.match(p.at, /^\d{4}-\d{2}-\d{2}$/);
});

test("normalizeLadder: passes a new-shape history through unchanged", () => {
  const fresh = [
    { id: "s1", keyword: "x", area: "A", history: [{ rank: 5, at: "2026-06-01" }, { rank: 3, at: "2026-07-01" }], current: 3, best: 3 },
  ];
  const [k] = normalizeLadder(fresh, "2026-07-01T00:00:00Z");
  assert.deepEqual(k.history, [{ rank: 5, at: "2026-06-01" }, { rank: 3, at: "2026-07-01" }]);
  assert.equal(k.best, 3);
});

test("normalizeSignals: coerces a legacy blob anchored on its own syncedAt", () => {
  const blob = {
    meta: { source: "import", syncedAt: "2026-07-01T00:00:00Z", rowCount: 1 },
    ladder: [{ id: "s1", keyword: "x", area: "A", history: [8, 2], current: 2, best: 2 }],
  };
  const out = normalizeSignals(blob);
  assert.equal(out.ladder[0].history[1].at, "2026-07-01");
  assert.equal(out.meta.source, "import"); // meta untouched
});

const SAMPLE = [{ id: "s1", keyword: "x", area: "A", history: [{ rank: 9, at: "2026-06-01" }], current: 9, best: 9 }];

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
