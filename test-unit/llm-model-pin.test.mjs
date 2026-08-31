/** The model the harness proves against is pinned, and the pin bites.
 *
 *  THE PROBLEM. Everything in `test-llm/` records something about the OUTPUT — a
 *  golden's prompt hash and schema, the baked quality scorecard, the input-token
 *  budget — and none of it records which MODEL that was true of. The real-model
 *  re-prove was retired on 2026-08-05 in favour of a static gate, so those records
 *  are now compared against each other and never against a provider. Bumping
 *  `GEMINI_MODEL` to the next preview is a one-word diff that silently re-points
 *  every one of them at a different model.
 *
 *  WHAT THIS ASSERTS. That `test-llm/model-pins.json` still describes
 *  `src/lib/llm/models.ts` — and, in the same run, that the comparison would go red
 *  if it did not. The second half is the part worth having: a pin checked by a
 *  function that no longer detects anything is exactly as green as a correct one,
 *  which is the failure this repository has already caught twice elsewhere
 *  (test-unit/gate-bite.test.mjs, test-unit/mutation-census.test.mjs). So the
 *  known-bad fixtures below are the drill, and they run on every build rather than
 *  weekly, because they cost two string replacements and no provider.
 *
 *  WHAT IT CANNOT ASSERT, and does not pretend to: a provider moving the model
 *  behind a stable alias. `sonnet` is a pointer. That is dated by the weekly
 *  `npm run llm:drift`, and it is written into the pin file's `unpinnable` list.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`. Pure: reads two files, spawns nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PINS_REL,
  SOURCE_REL,
  comparePins,
  declaredModels,
  pinAgeDays,
} from "../scripts/llm-model-pin.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const source = read(SOURCE_REL);
const pins = JSON.parse(read(PINS_REL));

test("every model this app serves through is pinned, and the pins still match the source", () => {
  assert.deepEqual(
    comparePins(source, pins),
    [],
    `${SOURCE_REL} and ${PINS_REL} disagree about which model the harness was proved against. If the model ` +
      'moved on purpose: `npm run llm:drift`, then `npm run llm:models -- --accept --reason "…"`, in one diff.'
  );
});

test("the pin file accounts for EVERY model constant, by pinning it or excluding it with a reason", () => {
  const declared = [...declaredModels(source).keys()];
  assert.ok(declared.length >= 5, `only ${declared.length} model constant(s) parsed out of ${SOURCE_REL} — the ` +
    "parser has stopped seeing the file it exists to read.");
  const pinned = new Set((pins.pins ?? []).flatMap((p) => [p.declaredBy, p.aliasDeclaredBy].filter(Boolean)));
  const excluded = new Map((pins.excluded ?? []).map((e) => [e.declaredBy, e.why]));
  for (const name of declared) {
    assert.ok(
      pinned.has(name) || excluded.has(name),
      `\`${name}\` is neither pinned nor excluded in ${PINS_REL}. A new provider path arriving unaccounted for ` +
        "is exactly how the harness ends up proving one model and serving another."
    );
  }
  for (const [name, why] of excluded) {
    assert.ok(why && why.length > 30, `${name} is excluded from the pins with no real reason given.`);
  }
});

test("the check BITES: a model id that moved is a finding, naming the constant", () => {
  // The drill. `gemini-3-flash-preview` → the shape of its own GA rename, which is
  // the most likely real version of this event.
  const moved = source.replace('GEMINI_MODEL = "gemini-3-flash-preview"', 'GEMINI_MODEL = "gemini-3-flash"');
  assert.notEqual(moved, source, "the fixture no longer patches anything — re-anchor it on the current source.");
  const findings = comparePins(moved, pins);
  assert.ok(findings.length >= 1, "a changed model id produced no finding — the pin check has stopped detecting.");
  assert.ok(
    findings.some((f) => f.includes("GEMINI_MODEL")),
    `the finding does not name the constant that moved: ${JSON.stringify(findings)}`
  );
});

test("the check BITES: a new provider path with no pin and no exclusion is a finding", () => {
  const added = `${source}\nexport const MISTRAL_MODEL = "mistral-large-3";\n`;
  const findings = comparePins(added, pins);
  assert.ok(
    findings.some((f) => f.includes("MISTRAL_MODEL")),
    `a model constant nobody accounted for went unreported: ${JSON.stringify(findings)}`
  );
});

test("the check BITES: pins with no dated, written acceptance are a finding", () => {
  const unsigned = { ...pins, acceptance: { pinnedAt: "2026-08-31" } };
  assert.ok(
    comparePins(source, unsigned).some((f) => f.includes("acceptance")),
    "a pin file with no reason recorded passed the check — a pin nobody signed is a number in a file."
  );
});

test("age is REPORTED, never failed — a calendar is not a regression", () => {
  // ADR-0007. A gate that goes red because time passed is a gate people learn to
  // ignore, and the ignoring generalises to the gates that mean something.
  const ancient = { ...pins, acceptance: { ...pins.acceptance, pinnedAt: "2020-01-01" } };
  assert.deepEqual(comparePins(source, ancient), [], "the pin check failed on age alone.");
  assert.ok(pinAgeDays(ancient, Date.parse("2026-08-31T00:00:00Z")) > 2000, "the age is not being measured at all.");
});

test("the pin claims nothing it has not got: unproven means unproven", () => {
  // The temptation when writing this file is to stamp `provenAt` with today and
  // move on. A provenance nobody earned is worse than none, because the next
  // reader treats it as evidence.
  const { provenAt, provenBy } = pins.acceptance ?? {};
  if (provenAt) {
    assert.ok(provenBy, "`provenAt` is set with no `provenBy` — which run proved it?");
    assert.match(String(provenAt), /^\d{4}-\d{2}-\d{2}$/, "`provenAt` must be a date.");
  } else {
    assert.equal(provenBy ?? null, null, "`provenBy` names a run while `provenAt` says it never happened.");
  }
  assert.ok(
    (pins.unpinnable ?? []).length >= 1,
    "the pin file no longer states what it CANNOT see. A pin that overclaims is worse than no pin — the alias " +
      "half of this problem belongs to `npm run llm:drift`, and saying so is part of the record."
  );
});

test("the pin check is wired to a command", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(String(pkg.scripts?.["llm:models"] ?? ""), /scripts\/llm-model-pin\.mjs/);
  assert.match(String(pkg.scripts?.["llm:models:check"] ?? ""), /scripts\/llm-model-pin\.mjs --check/);
});
