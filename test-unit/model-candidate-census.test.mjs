/** The candidate rehearsal still describes a swap that has not happened yet — the
 *  blocking half of "nothing rehearses tomorrow's model".
 *
 *  THE PROBLEM. Every proof in this harness is about the model being served today:
 *  the goldens pin each tool's prompt and schema against it, the quality bake pins
 *  how good its answers were, the budget file pins what its prompts cost, and
 *  test-llm/model-pins.json pins which model all of that was true of. None of them
 *  can be pointed at a model the app does not yet serve, so the swap itself was the
 *  experiment — `GEMINI_MODEL` moves and the first evidence about the new model is
 *  production.
 *
 *  `npm run llm:candidate` is the rehearsal (scripts/llm-candidate.mjs) and it needs
 *  a key, money and the network, so it runs weekly and never in `check:ci`. This file
 *  is what committed data can decide, on every build:
 *
 *    • a candidate row's `serving` value is still what src/lib/llm/models.ts declares
 *      — the quiet failure, and the expensive one: once the swap has happened, a row
 *      still naming the OLD model rehearses a move nobody is making, while the model
 *      that actually shipped was never rehearsed at all;
 *    • the candidate is not the serving model (a row that rehearses today is a row
 *      that proves nothing and reports a pass);
 *    • every pinned Gemini path is either rehearsed or explicitly records that no
 *      successor has been announced, so absence cannot masquerade as coverage;
 *    • and the rehearsal is wired to a command and to the weekly job, because a
 *      drill nobody schedules is a design document.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing, spends nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const SPEC_PATH = "test-llm/model-candidates.json";
const spec = JSON.parse(read(SPEC_PATH));
const pins = JSON.parse(read("test-llm/model-pins.json"));
const models = read("src/lib/llm/models.ts");

/** `export const NAME = "value";` out of the model surface, read as text for the
 *  same reason every gate here does: this file imports no TypeScript. */
const declaredValue = (symbol) =>
  new RegExp(`export const ${symbol}\\s*=\\s*"([^"]+)"`).exec(models)?.[1] ?? null;

test("every candidate row is complete and names a real successor", () => {
  const candidates = spec.candidates ?? [];
  assert.ok(
    candidates.length >= 1,
    `${SPEC_PATH} declares no candidates. The file existing with an empty list is the state it was written to `
      + "prevent: a rehearsal that runs, reports a pass, and rehearses nothing."
  );
  const seen = new Set();
  for (const c of candidates) {
    for (const key of ["path", "declaredBy", "serving", "candidate", "vendor", "keyEnv", "tier", "why"]) {
      assert.ok(c[key], `${c.path ?? "(unnamed)"}: candidate row is missing \`${key}\``);
    }
    assert.ok(!seen.has(c.path), `two candidate rows claim \`${c.path}\``);
    seen.add(c.path);
    assert.ok(c.tier === "fast" || c.tier === "quality", `${c.path}: tier must be \`fast\` or \`quality\`.`);
    assert.ok(
      String(c.why).length >= 40,
      `${c.path}: \`why\` must say why THIS model is the successor worth rehearsing — a candidate nobody can `
        + "justify is a model somebody guessed at, and a rehearsal against a guess is worse than none."
    );
  }
});

test("the row still describes a swap that has NOT happened", () => {
  // The failure that matters. After a bump, a row still naming the old model
  // rehearses a move nobody is making — and the model that actually shipped was
  // never rehearsed at all, which is the exact gap this whole mechanism exists for.
  for (const c of spec.candidates ?? []) {
    const declared = declaredValue(c.declaredBy);
    assert.ok(
      declared,
      `${c.path}: src/lib/llm/models.ts no longer declares \`${c.declaredBy}\`. Re-point the candidate row at the `
        + "constant that names the serving model now."
    );
    assert.equal(
      c.serving,
      declared,
      `${c.path}: the candidate row says production serves \`${c.serving}\` and ${c.declaredBy} is now `
        + `\`${declared}\`. The swap happened and the rehearsal did not follow — so this row now rehearses a move `
        + "nobody is making, and whatever shipped was never rehearsed. Move `serving` and pick the next candidate "
        + "in the same diff as the bump (npm run llm:models -- --accept --reason \"…\")."
    );
    assert.notEqual(
      c.candidate,
      declared,
      `${c.path}: the candidate IS the serving model, so the rehearsal proves what the weekly drift run already `
        + "proves and reports a pass for tomorrow that it never tested."
    );
  }
});

test("the candidate paths and the model pins describe the same surface", () => {
  const pinned = new Set((pins.pins ?? []).filter((p) => p.declaredBy?.startsWith("GEMINI_MODEL")).map((p) => p.path));
  const rows = [...(spec.candidates ?? []), ...(spec.awaitingCandidates ?? [])];
  const covered = new Set();
  for (const row of rows) {
    assert.ok(pinned.has(row.path), `${row.path}: test-llm/model-pins.json pins no such Gemini path.`);
    assert.ok(!covered.has(row.path), `${row.path}: appears as both a candidate and an awaiting surface.`);
    covered.add(row.path);
  }
  assert.deepEqual(covered, pinned, "every pinned Gemini surface must be rehearsed or explicitly awaiting a successor");
});

test("an awaiting surface names the current model and the source checked for a successor", () => {
  for (const row of spec.awaitingCandidates ?? []) {
    for (const key of ["path", "declaredBy", "serving", "checkedOn", "source", "why"]) {
      assert.ok(row[key], `${row.path ?? "(unnamed)"}: awaiting row is missing \`${key}\``);
    }
    assert.equal(row.serving, declaredValue(row.declaredBy), `${row.path}: awaiting row is stale against the serving model`);
    assert.match(row.checkedOn, /^\d{4}-\d{2}-\d{2}$/, `${row.path}: checkedOn must be an ISO date`);
    assert.match(row.source, /^https:\/\/ai\.google\.dev\//, `${row.path}: successor check must cite Google's model catalog`);
    assert.ok(String(row.why).length >= 80, `${row.path}: awaiting row must explain why no candidate is named`);
  }
});

test("a candidate that answers in a shape the tool refuses is a failure, not a note", () => {
  const ceiling = spec.acceptance?.maxShapeFailures;
  assert.equal(
    ceiling,
    0,
    "`acceptance.maxShapeFailures` is not 0. The validator is the contract every registered operation already "
      + "meets on the serving model — nothing about a newer model makes a broken shape acceptable, and raising "
      + "this is how a rehearsal becomes a formality."
  );
  assert.ok(
    String(spec.acceptance?.reason ?? "").length >= 40,
    "the acceptance number carries no reason, which is how it gets raised."
  );
  assert.ok(
    (spec.cannotSee ?? []).length >= 3,
    `${SPEC_PATH} no longer says what the rehearsal does NOT cover. It is a SHAPE verdict; a reader who takes it `
      + "for a quality verdict will swap on it."
  );
});

test("the rehearsal is wired to a command and to the weekly job", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(
    String(pkg.scripts?.["llm:candidate"] ?? ""),
    /scripts\/llm-candidate\.mjs/,
    "`npm run llm:candidate` no longer runs the rehearsal. A drill nobody can invoke is not a drill."
  );
  assert.doesNotMatch(
    String(pkg.scripts?.["check:ci"] ?? ""),
    /llm:candidate/,
    "the candidate rehearsal is in check:ci. It spends money against a real provider — AGENTS.md § Amber keeps "
      + "every such run out of the landing path, deliberately and permanently."
  );
  // Comments stripped on purpose: a workflow that only MENTIONS the rehearsal in
  // prose must not satisfy a wiring assertion — that is the exact shape of a
  // practice that looks wired and is not.
  const workflow = read(".github/workflows/llm-drift.yml")
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  assert.match(
    workflow,
    /npm run llm:candidate/,
    "the weekly model workflow no longer runs the candidate rehearsal. On this repository's landing path nobody "
      + "runs it by hand, and the answer would then be as old as the last person who remembered."
  );
  assert.match(
    workflow,
    /schedule:/,
    ".github/workflows/llm-drift.yml no longer runs on a schedule, so the rehearsal only happens when somebody "
      + "dispatches it — which is the state it was written to end."
  );
});
