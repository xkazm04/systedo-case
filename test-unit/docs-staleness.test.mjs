/** The staleness budget's own shape — the half that can block today.
 *
 *  `npm run docs:staleness` measures age against git, which is a question with a
 *  different answer on every machine and on every day; ADR-0007 says a check like
 *  that reports until its baseline has been measured and accepted. What can be
 *  asserted now, and is asserted here, is that the REGISTRY describes the tree:
 *
 *    • an entry naming a document that has been moved or deleted measures nothing,
 *      and does it silently — the doc is gone, so no commit will ever overtake it;
 *    • a `watches` path that no longer exists is worse than no entry at all: the
 *      doc looks governed and is not, because the code it is watched against can
 *      never move again;
 *    • and a runbook that lands in docs/runbooks/ with no budget is exactly the
 *      document this whole idea was written for — the page read during an
 *      incident, by someone who cannot check it against the code.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_REL = ".github/docs-staleness.json";
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const config = JSON.parse(read(CONFIG_REL));
const docs = config.docs ?? [];

test("the budget governs a real set of documents", () => {
  assert.ok(
    docs.length >= 8,
    `${CONFIG_REL} governs ${docs.length} document(s). A budget over a handful of favourites answers the age ` +
      "question for the pages somebody was already watching."
  );
  const seen = new Set();
  for (const d of docs) {
    assert.ok(d.doc, "an entry has no `doc`");
    assert.ok(!seen.has(d.doc), `${d.doc} is registered twice`);
    seen.add(d.doc);
    assert.ok(Array.isArray(d.watches) && d.watches.length, `${d.doc}: no \`watches\` — nothing can overtake it.`);
    assert.equal(typeof d.maxAgeDays, "number", `${d.doc}: \`maxAgeDays\` must be a number of days.`);
    assert.ok(d.why, `${d.doc}: say why this document's age costs something — the budget is a judgement, not a list.`);
  }
});

test("every governed document, and everything it is watched against, still exists", () => {
  const missing = [];
  for (const d of docs) {
    if (!existsSync(join(ROOT, d.doc))) missing.push(`${d.doc} (the document)`);
    for (const w of d.watches ?? []) {
      if (!existsSync(join(ROOT, w))) missing.push(`${w} (watched by ${d.doc})`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `${CONFIG_REL} names ${missing.length} path(s) that do not exist: ${missing.join(", ")}. An entry pointing at ` +
      "a moved file measures nothing and says so to nobody — re-point it, or drop the entry."
  );
});

test("every runbook has a budget", () => {
  // The documents the idea exists for: a runbook is read during an incident, by
  // someone who has no time to check it against the code.
  const dir = join(ROOT, "docs", "runbooks");
  const runbooks = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  assert.ok(runbooks.length > 0, "docs/runbooks/ holds no runbooks — has the directory moved?");
  const governed = new Set(docs.map((d) => d.doc));
  const unbudgeted = runbooks.filter((f) => !governed.has(`docs/runbooks/${f}`));
  assert.deepEqual(
    unbudgeted,
    [],
    `docs/runbooks/${unbudgeted.join(", ")} has no entry in ${CONFIG_REL}. Add one naming the scripts and ` +
      "workflows the runbook describes, so the page goes red when they move under it."
  );
});

test("the ratchet is declared, even before it has been measured", () => {
  // null is the honest value, and it has to be PRESENT: an absent ratchet key and a
  // deliberately unmeasured one look the same to a reader, and only one of them is
  // waiting for somebody to run the command.
  assert.ok(
    Object.prototype.hasOwnProperty.call(config.ratchet ?? {}, "stale"),
    `${CONFIG_REL} declares no \`ratchet.stale\`. Null means "not measured yet, so --check reports"; missing ` +
      "means nobody decided."
  );
  const floor = config.ratchet.stale;
  assert.ok(
    floor === null || (Number.isInteger(floor) && floor >= 0),
    `${CONFIG_REL}: ratchet.stale must be null or a non-negative integer, not ${JSON.stringify(floor)}.`
  );
  if (floor !== null) {
    assert.ok(
      config.ratchet.reason,
      "a pinned ratchet must carry the reason it was accepted at that number (`--accept --reason`)."
    );
  }
});

test("the script the budget belongs to is wired to a command", () => {
  const scripts = JSON.parse(read("package.json")).scripts ?? {};
  for (const name of ["docs:staleness", "docs:staleness:check"]) {
    assert.ok(scripts[name], `package.json defines no \`${name}\` script, so the budget is a file nothing reads.`);
  }
  assert.ok(existsSync(join(ROOT, "scripts/docs-staleness.mjs")), "scripts/docs-staleness.mjs is gone.");
});
