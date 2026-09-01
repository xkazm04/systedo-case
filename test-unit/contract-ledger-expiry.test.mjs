/** A pin has a date, and the date is read back.
 *
 *  The ceiling on an exception list is proven from the other side in
 *  test-unit/contract-ledger-ceiling.test.mjs: a list that outgrows its ceiling
 *  fails, an uncapped list fails, a softened threshold fails. What none of that
 *  could see is TIME. `reason` and `comesOffWhen` are the two fields a pin carries,
 *  and both read exactly the same on the day somebody argued for the number and
 *  three years later, when the person who argued has gone and the cause has moved.
 *  From inside a green build a considered exception and a shortcut nobody has
 *  revisited since are the same three lines — so the next agent reads both as
 *  precedent, and an exception list only ever grows.
 *
 *  So every pin carries `accepted: { on, reviewBy }`, and this file holds that to
 *  the two rungs it is split across (ADR-0007):
 *
 *    BLOCKING — the shape. A pin with no date, a review date before the day it was
 *      accepted, or one far enough away to be no date at all, fails
 *      `npm run contract:ledger:check`, which is a stage of `check:ci` and
 *      therefore of `.husky/pre-push`. That is what stops the NEXT exception
 *      landing undated, which is the whole failure being closed here.
 *    REPORTING — being past the date. It is printed with its age and it never fails
 *      a build: an expiry that turned master red on a morning nobody chose would be
 *      re-dated in the hurry rather than re-argued, which is the exact move the
 *      ledger exists to make visible.
 *
 *  Two tests spawn the real script against a fixture, for the reason the ceiling
 *  suite gives: a gate nobody has watched fail is a gate nobody knows is wired.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const SCRIPT = join(ROOT, "scripts", "contract-ledger.mjs");

const ledger = JSON.parse(read(".github/contract-ledger.json"));
const rows = ledger.rules ?? [];
const pinsOf = (row) =>
  [
    ["ceiling", row.ceiling],
    ["floor", row.floor],
  ].filter(([, pin]) => pin);

const run = (ledgerPath, today) =>
  spawnSync(
    process.execPath,
    [SCRIPT, "--check", ...(ledgerPath ? ["--ledger", ledgerPath] : []), ...(today ? ["--today", today] : [])],
    { cwd: ROOT, encoding: "utf8" }
  );

/** The real ledger, with one edit, written somewhere the tree does not see. */
function fixture(name, mutate) {
  const copy = JSON.parse(read(".github/contract-ledger.json"));
  mutate(copy);
  const dir = mkdtempSync(join(tmpdir(), "ledger-expiry-"));
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(copy, null, 2) + "\n");
  return path;
}

const rowOf = (obj, id) => (obj.rules ?? []).find((r) => r.id === id);

// --- the inventory: every pin in the repository is dated ----------------------

test("every ceiling and floor in the ledger records when it was accepted", () => {
  const pinned = rows.flatMap((row) => pinsOf(row).map(([name, pin]) => [row.id, name, pin]));
  assert.ok(pinned.length >= 20, `only ${pinned.length} pin(s) found — the ledger holds more than that.`);
  for (const [id, name, pin] of pinned) {
    assert.match(
      String(pin.accepted?.on ?? ""),
      /^\d{4}-\d{2}-\d{2}$/,
      `${id}: the ${name} has no \`accepted.on\`. A number with a reason but no date cannot be told apart from ` +
        "one nobody has looked at since."
    );
  }
});

test("a pin that is absorbing something records when it has to be argued again", () => {
  // A ceiling of 0 on an exception list absorbs nothing, so it has no exception
  // whose age matters and carries `reviewBy: null` on purpose. Everything else —
  // any floor, any ceiling that allows more than zero — owes a date.
  const absorbing = rows.flatMap((row) =>
    pinsOf(row)
      .filter(([name, pin]) => !(name === "ceiling" && pin.max === 0))
      .map(([name, pin]) => [row.id, name, pin])
  );
  assert.ok(absorbing.length >= 10, `only ${absorbing.length} absorbing pin(s) — expected more.`);
  for (const [id, name, pin] of absorbing) {
    assert.match(
      String(pin.accepted?.reviewBy ?? ""),
      /^\d{4}-\d{2}-\d{2}$/,
      `${id}: the ${name} allows something and names no review date, which makes it permanent by default.`
    );
    assert.ok(
      new Date(`${pin.accepted.reviewBy}T00:00:00Z`) > new Date(`${pin.accepted.on}T00:00:00Z`),
      `${id}: the ${name}'s review date is not after the day it was accepted.`
    );
  }
});

// --- and the gate refuses the ways a date can be missing or meaningless -------

test("an undated pin fails the build", () => {
  const path = fixture("undated", (l) => {
    delete rowOf(l, "route-auth").ceiling.accepted;
  });
  const res = run(path, null);
  assert.equal(res.status, 1, "a pin with no date must fail, or the date is decoration the next entry can skip.");
  assert.match(`${res.stdout}${res.stderr}`, /accepted\.on/);
});

test("a live exception with no review date fails the build", () => {
  const path = fixture("no-review", (l) => {
    rowOf(l, "route-auth").ceiling.accepted.reviewBy = null;
  });
  const res = run(path, null);
  assert.equal(res.status, 1);
  assert.match(
    `${res.stdout}${res.stderr}`,
    /accepted\.reviewBy/,
    "five anonymous routes with no date on the decision is exactly the entry that becomes furniture."
  );
});

test("a review date far enough away to be no date at all fails the build", () => {
  const path = fixture("far-horizon", (l) => {
    rowOf(l, "route-auth").ceiling.accepted.reviewBy = "2099-01-01";
  });
  const res = run(path, null);
  assert.equal(res.status, 1, "'review it in seventy years' is how an expiry is disarmed without deleting it.");
  assert.match(`${res.stdout}${res.stderr}`, /horizon/);
});

test("a review date before the day it was accepted fails the build", () => {
  const path = fixture("backwards", (l) => {
    rowOf(l, "route-auth").ceiling.accepted.reviewBy = "2020-01-01";
  });
  const res = run(path, null);
  assert.equal(res.status, 1);
  assert.match(`${res.stdout}${res.stderr}`, /is not after/);
});

// --- being PAST the date is reported, and deliberately does not block ---------

test("a pin past its review date is named, with its age, and does not fail the build", () => {
  // The real tree, read from a day after every review date it holds. Nothing is
  // mutated: this is what this ledger looks like when nobody has revisited it.
  const res = run(null, "2099-01-01");
  assert.equal(
    res.status,
    0,
    "an expired pin must not fail a build — a red that arrives on a morning nobody chose gets re-dated in the " +
      "hurry rather than re-argued, which is the move this ledger exists to make visible."
  );
  const output = `${res.stdout}${res.stderr}`;
  assert.match(output, /past their review date/);
  assert.match(output, /route-auth/);
  assert.match(output, /day\(s\) ago/);
});

test("the ledger check is still green on the tree as it stands", () => {
  // Deliberately NOT an assertion that nothing is overdue: that would be a build
  // red arriving on a morning nobody chose, which is the thing the reporting rung
  // exists to avoid. What must stay true is that dating every pin did not itself
  // break the gate.
  const res = run(null, null);
  assert.equal(res.status, 0, `\`contract:ledger:check\` is red on this tree:\n${res.stdout}\n${res.stderr}`);
});
