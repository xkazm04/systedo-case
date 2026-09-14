/** Which rules have a fence, and which are honour-system — asserted, not implied.
 *
 *  eslint.config.mjs already made the argument: prose is read by whoever reads it,
 *  ~97% of the commits here are agent-written, and a constraint re-derived from a
 *  document on every run needs something that FAILS. Three constraints got fences.
 *  What was never written down is which of the rest did not — and a rule with a
 *  gate behind it and a rule that holds only because somebody remembered read
 *  exactly alike in AGENTS.md.
 *
 *  `.github/constraint-map.json` is that map and the table in AGENTS.md § "Which of
 *  these rules will actually stop you" is its readable half. This file is what stops
 *  either one drifting away from the tree they describe:
 *
 *    • a `gate` naming an npm script package.json does not define, or a `lint`
 *      naming a config block eslint.config.mjs does not declare, is a fence
 *      claimed and not built — worse than an honest "honour";
 *    • a `quote` that is no longer a sentence in the file it is attributed to means
 *      the rule moved and the map did not;
 *    • a row in the table with no entry in the JSON (or the reverse) means the two
 *      halves have started disagreeing about the same question;
 *    • and the property that keeps it from rotting: EVERY STAGE of `check:ci` has
 *      to appear here as somebody's enforcement. A gate added to the chain with no
 *      rule attached to it is a check nobody can name the purpose of.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chainStages } from "../scripts/lib/chain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
/** Whitespace-flattened, so a quote that the source file line-wraps still matches.
 *  The map records sentences, not line breaks. */
const flat = (s) => s.replace(/\s+/g, " ");

const MAP_REL = ".github/constraint-map.json";
const map = JSON.parse(read(MAP_REL));
const constraints = map.constraints ?? [];

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};
const eslintConfig = read("eslint.config.mjs");
const rubric = read(".github/agent-review-rubric.md");
const agents = read("AGENTS.md");

const RUNGS = new Set(["blocking", "reporting", "partial", "honour"]);
const KINDS = new Set(["gate", "lint", "test", "hook", "permission", "review", "type", "honour"]);

test("the map is well formed and states a rule per entry", () => {
  assert.ok(
    constraints.length >= 20,
    `${MAP_REL} lists ${constraints.length} constraint(s). AGENTS.md states far more than that — a map of a ` +
      "handful of favourites answers the question for the rules nobody was going to break anyway."
  );
  const ids = constraints.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate constraint id");
  for (const c of constraints) {
    for (const key of ["id", "rule", "rung"]) {
      assert.ok(typeof c[key] === "string" && c[key], `${c.id ?? "(no id)"}: missing \`${key}\``);
    }
    assert.ok(RUNGS.has(c.rung), `${c.id}: unknown rung "${c.rung}" (expected ${[...RUNGS].join(" | ")})`);
    assert.ok(Array.isArray(c.enforcement) && c.enforcement.length, `${c.id}: declares no \`enforcement\``);
  }
});

test("every rule is attributed to a file that states it, in words that are still there", () => {
  // The failure this catches: a constraint is reworded or moved and the map keeps
  // pointing a reader at a sentence that is no longer in the document.
  for (const c of constraints) {
    const src = c.statedIn ?? {};
    assert.ok(src.file && src.quote, `${c.id}: \`statedIn\` needs both a \`file\` and a \`quote\``);
    assert.ok(existsSync(join(ROOT, src.file)), `${c.id}: statedIn.file ${src.file} does not exist.`);
    assert.ok(
      flat(read(src.file)).includes(flat(src.quote)),
      `${c.id}: ${src.file} no longer contains "${src.quote}". The rule moved, was reworded, or was dropped — ` +
        "update the map to whatever the document says now, or delete the row if the rule is gone."
    );
  }
});

test("every claimed fence exists — a gate that is not there is worse than an honest honour row", () => {
  for (const c of constraints) {
    for (const e of c.enforcement) {
      assert.ok(KINDS.has(e.kind), `${c.id}: unknown enforcement kind "${e.kind}"`);
      if (e.kind === "honour") {
        assert.ok(!e.name, `${c.id}: an \`honour\` enforcement names ${e.name} — honour means nothing runs.`);
        continue;
      }
      assert.ok(e.name, `${c.id}: a \`${e.kind}\` enforcement with no \`name\``);
      switch (e.kind) {
        case "gate":
          assert.ok(
            scripts[e.name],
            `${c.id}: claims \`npm run ${e.name}\` enforces it, and package.json defines no such script.`
          );
          break;
        case "lint":
          assert.ok(
            eslintConfig.includes(`name: "${e.name}"`),
            `${c.id}: claims the lint block "${e.name}" fences it, and eslint.config.mjs declares no block by ` +
              "that name. A fence in the map and not in the config is a rule nobody is enforcing."
          );
          break;
        case "review":
          assert.match(
            rubric,
            new RegExp(`^### ${e.name}\\b`, "m"),
            `${c.id}: names rubric rule ${e.name}, which .github/agent-review-rubric.md does not have.`
          );
          break;
        case "test":
        case "hook":
        case "permission":
        case "type":
          assert.ok(
            existsSync(join(ROOT, e.name)),
            `${c.id}: names ${e.name} as what enforces it, and that file does not exist.`
          );
          break;
      }
    }
  }
});

test("an honour row says why there is no fence, and what would notice a breach", () => {
  // The whole point of the map is that these rows are legible. "honour" with no
  // explanation is the same silence the map was written to end.
  for (const c of constraints) {
    const kinds = new Set(c.enforcement.map((e) => e.kind));
    const isHonour = kinds.size === 1 && kinds.has("honour");
    assert.equal(
      c.rung === "honour",
      isHonour,
      `${c.id}: rung "${c.rung}" and enforcement ${[...kinds].join("+")} disagree. A row is "honour" exactly ` +
        "when nothing runs on a breach."
    );
    if (c.rung === "honour") {
      assert.ok(c.why, `${c.id}: an honour row must say WHY it has no fence — often the answer is that one is possible.`);
      assert.ok(c.mitigation, `${c.id}: an honour row must say what would notice a breach, even if the answer is nothing.`);
    }
    if (c.rung === "partial") {
      assert.ok(
        c.gapNote,
        `${c.id}: a partial row must say which breaches its enforcement does NOT catch — that gap is the only ` +
          "reason the row is not simply blocking."
      );
    }
  }
});

test("where a rule is in both files, the two do not disagree about it", () => {
  // .github/contract-ledger.json is keyed by the enforcement and this map by the
  // rule, which is a useful split and a duplication hazard: two answers to "is this
  // enforced?" is worse than one. `ledgerId` is the join, and the one thing the two
  // may never do is disagree about whether anything runs.
  const ledger = JSON.parse(read(".github/contract-ledger.json"));
  const byId = new Map((ledger.rules ?? []).map((r) => [r.id, r]));
  for (const c of constraints) {
    if (!c.ledgerId) continue;
    const row = byId.get(c.ledgerId);
    assert.ok(
      row,
      `${c.id}: ledgerId "${c.ledgerId}" is not a rule in .github/contract-ledger.json. The join is the only ` +
        "thing keeping the two files from drifting into two different answers."
    );
    if (/^nothing\b/i.test(row.enforcedBy ?? "")) {
      assert.ok(
        c.rung === "honour" || c.rung === "partial",
        `${c.id}: the contract ledger records that NOTHING enforces "${c.ledgerId}", and this map calls it ` +
          `"${c.rung}". The optimistic answer is the one a reader acts on.`
      );
    }
  }
});

/** The stages `check:ci` actually runs, in order — through the one parser
 *  (scripts/lib/chain.mjs). */
const stages = chainStages(pkg);

test("every gate in the chain is attached to a rule it enforces", () => {
  // The ratchet that keeps the map alive: a check added to check:ci has to name the
  // constraint it exists for, or the map silently stops describing the gate set.
  assert.ok(stages.length >= 15, `check:ci runs ${stages.length} stages — did the chain get shortened?`);
  const enforced = new Set(
    constraints.flatMap((c) => c.enforcement.filter((e) => e.kind === "gate").map((e) => e.name))
  );
  for (const stage of stages) {
    assert.ok(
      enforced.has(stage),
      `check:ci runs \`npm run ${stage}\` and no constraint in ${MAP_REL} names it. Every gate exists for a ` +
        "stated rule — add the rule, or attach the stage to the one it already enforces."
    );
  }
});

// --- the readable half -------------------------------------------------------

/** The table rows in AGENTS.md § "Which of these rules will actually stop you",
 *  each keyed by the id in its first cell. */
function tableRows(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\|\s*`([a-z0-9-]+)`\s*[—-][^|]*\|([^|]*)\|([^|]*)\|\s*$/.exec(line);
    if (m) rows.push({ id: m[1], enforcedBy: m[2].trim(), rung: m[3].replace(/[*\s]/g, "") });
  }
  return rows;
}

const rows = tableRows(agents);

test("AGENTS.md carries the table, and it lists exactly the rules the map holds", () => {
  assert.ok(
    agents.includes(".github/constraint-map.json"),
    "AGENTS.md no longer points at .github/constraint-map.json, so the machine-readable half is unreachable from " +
      "the document every agent is told to read first."
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    constraints.map((c) => c.id),
    "the table in AGENTS.md and .github/constraint-map.json no longer list the same rules in the same order. " +
      "Two answers to \"is this enforced?\" is worse than one."
  );
});

test("the table's rung column says what the map says", () => {
  for (const row of rows) {
    const entry = constraints.find((c) => c.id === row.id);
    assert.equal(
      row.rung,
      entry.rung,
      `AGENTS.md calls \`${row.id}\` "${row.rung}" and ${MAP_REL} calls it "${entry.rung}". The rung is the ` +
        "column a reader acts on — an optimistic one in the document is how a rule gets believed."
    );
  }
});

test("a row that claims a fence names one", () => {
  // An honour row's cell is deliberately empty; every other row has to name
  // something, or the table is a list of rules again.
  for (const row of rows) {
    const entry = constraints.find((c) => c.id === row.id);
    if (entry.rung === "honour") {
      assert.equal(row.enforcedBy, "—", `${row.id}: an honour row's "Enforced by" cell should be an em dash.`);
    } else {
      assert.notEqual(row.enforcedBy, "—", `${row.id}: rung "${entry.rung}" but the table names no enforcement.`);
    }
  }
});
