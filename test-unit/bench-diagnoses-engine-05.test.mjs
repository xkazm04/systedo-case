/** BENCH FIXTURE — diagnoses-engine-05 (FAIL_TO_PASS).
 *
 *  Defect: both store backends do `JSON.parse(row.data) as DiagnosisState` with no
 *  shape check. A blob that PARSES but is not the expected shape (legacy write,
 *  manual edit, partial migration) reaches setStatusIn, where `prev.items.map`
 *  throws TypeError inside the transaction — so updateDiagnosisStatus 500s forever
 *  instead of returning the designed not-found result.
 *
 *  This asserts the OBSERVABLE contract, not a particular fix site: a malformed
 *  persisted blob must read as empty state and a status PATCH against it must
 *  report not-found rather than throw. A guard in selectState, in setStatusIn, or
 *  a shared validator all satisfy it equally.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-diagnoses-bench-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try { rmSync(dbFile + ext); } catch { /* not present */ }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { getDiagnoses, updateDiagnosisStatus, recordDiagnosis } =
  await import("@/lib/diagnoses/store.local");
const { getDb } = await import("@/lib/db");

function writeRawBlob(projectId, raw) {
  const db = getDb();
  db.prepare(
    `INSERT INTO diagnoses (project_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (project_id) DO UPDATE SET data = excluded.data`
  ).run(projectId, raw, new Date().toISOString());
}

// Control: the happy path must keep working. If this fails, the fixture is broken,
// not the code under test.
test("control - a well-formed blob round-trips and status updates find their id", async () => {
  const p = "ctl-1";
  await recordDiagnosis(p, {
    id: "d1", kind: "cohort", status: "new",
    createdAt: new Date().toISOString(), result: { sample: true },
  });
  const got = await getDiagnoses(p);
  assert.ok(Array.isArray(got?.items), "well-formed state must expose an items array");
  const r = await updateDiagnosisStatus(p, "d1", "acknowledged");
  assert.equal(r?.found ?? r, true, "a known id must be found");
});

for (const [label, raw] of [
  ["an empty object", "{}"],
  ["items as an object", '{"items":{}}'],
  ["a bare array", "[]"],
  ["items as null", '{"items":null,"updatedAt":"x"}'],
]) {
  test(`a parseable-but-malformed blob (${label}) must not crash a status PATCH`, async () => {
    const p = `mal-${label.replace(/\W+/g, "-")}`;
    writeRawBlob(p, raw);
    let res, threw = null;
    try {
      res = await updateDiagnosisStatus(p, "any-id", "resolved");
    } catch (e) {
      threw = e;
    }
    assert.equal(
      threw, null,
      `malformed blob must not throw from the store; got ${threw && threw.constructor.name}: ${threw && threw.message}`
    );
    assert.notEqual(res?.found, true, "an id cannot be found in a malformed blob");
  });

  test(`a parseable-but-malformed blob (${label}) reads as empty, not a bad shape`, async () => {
    const p = `read-${label.replace(/\W+/g, "-")}`;
    writeRawBlob(p, raw);
    let state, threw = null;
    try { state = await getDiagnoses(p); } catch (e) { threw = e; }
    assert.equal(threw, null, `getDiagnoses must not throw on a malformed blob`);
    if (state !== null && state !== undefined) {
      assert.ok(Array.isArray(state.items), "if a state is returned at all, items must be an array");
    }
  });
}
