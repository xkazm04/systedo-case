/** Every prompt builder has an answer on file to "who wrote the text this renders?".
 *
 *  WHAT THIS ADDS TO THE CORPUS NEXT DOOR. test-unit/llm-adversarial.test.mjs runs
 *  hostile payloads through the builders somebody thought to quarantine, and proves
 *  the fence holds. It is silent about a builder nobody thought about — which is not
 *  a hypothetical: `onboarding-scan` pasted the text of a FETCHED WEBSITE into a
 *  prompt (and the public /sken mode lets an anonymous visitor pick the site),
 *  `local-page` pasted public review bodies into a prompt whose output is PUBLISHED,
 *  and `channel-research` grounded on profile prose derived from that same page text.
 *  Three unfenced third-party surfaces, three green builds. A corpus cannot find
 *  those; only an enumeration can.
 *
 *  So test-llm/adversarial/surfaces.json declares every module that builds a prompt
 *  with the ORIGIN of the text it renders, and this holds the declaration to the tree
 *  in the four directions a file can be checked in:
 *
 *    1. COMPLETE     — every module that builds a prompt has a row, and every row
 *                      names a module that exists. A new tool with no row is red.
 *    2. BACKED       — a row that says `outside` has to be true in the code: the
 *                      module imports the quarantine, calls the containment helper
 *                      each field declares, and appends the firewall block.
 *    3. UNESCAPABLE  — a module that reaches for the quarantine must be declared
 *                      `outside`, so the cheap way out (quarantine the field, skip
 *                      the row) is not a way out.
 *    4. REHEARSED    — every `outside` module is exercised by a real payload in
 *                      test-llm/adversarial/corpus.json, so the declaration cannot
 *                      become the whole of the defence.
 *
 *  Runs in `npm run test:unit` → `npm run check:ci` → .husky/pre-push. It reads files
 *  and executes nothing, which is why it is in the always tier of
 *  .github/test-tiers.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Repo-relative, forward-slash paths everywhere — joined per segment so the census
 *  reads the same on Windows as in CI. */
const readRepo = (rel) => readFileSync(join(ROOT, ...rel.split("/")), "utf8");

const DECL = JSON.parse(readRepo("test-llm/adversarial/surfaces.json"));
const CORPUS = JSON.parse(readRepo("test-llm/adversarial/corpus.json"));

const ORIGINS = ["outside", "tenant", "none"];
const TOOLS_DIR = "src/lib/ai/tools";
/** A module builds a prompt when it declares a `build…Prompt` function. Same shape
 *  every tool here uses, and the reason the enumeration is derived rather than
 *  listed: a builder added in a directory nobody thought to watch still lands. */
const BUILDER_RE = /function build[A-Za-z]*Prompt\s*\(/;
/** An import of the quarantine module, whatever specifier a caller reached it by
 *  (`../untrusted`, `../ai/untrusted`, `@/lib/ai/untrusted`). */
const QUARANTINE_IMPORT_RE = /from\s+["'][^"']*\/untrusted["']/;

/** Every `.ts` under src/lib, repo-relative with forward slashes. */
function walk(rel) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, ...rel.split("/")))) {
    const child = `${rel}/${entry}`;
    if (statSync(join(ROOT, ...child.split("/"))).isDirectory()) out.push(...walk(child));
    else if (entry.endsWith(".ts")) out.push(child);
  }
  return out;
}

const sources = new Map(walk("src/lib").map((rel) => [rel, readRepo(rel)]));

/** The modules a row is owed for: every tool module (a tool with no builder today is
 *  one refactor away from having one), plus every module anywhere under src/lib that
 *  actually builds a prompt. */
const enumerated = [
  ...[...sources.keys()].filter((rel) => rel.startsWith(`${TOOLS_DIR}/`) && !rel.slice(TOOLS_DIR.length + 1).startsWith("_")),
  ...[...sources.entries()].filter(([, text]) => BUILDER_RE.test(text)).map(([rel]) => rel),
].filter((rel, i, all) => all.indexOf(rel) === i);

const rows = DECL.modules ?? [];
const rowFor = new Map(rows.map((r) => [r.path, r]));

// --- 1. complete, in both directions -----------------------------------------

test("the declaration is shaped the way the census reads it", () => {
  assert.equal(DECL.schema, 1);
  assert.ok(rows.length > 0, "test-llm/adversarial/surfaces.json declares no modules at all.");
  assert.equal(new Set(rows.map((r) => r.path)).size, rows.length, "a module is declared twice.");
  for (const r of rows) {
    assert.ok(ORIGINS.includes(r.origin), `${r.path}: origin "${r.origin}" is not one of ${ORIGINS.join(" | ")}.`);
    assert.ok(
      typeof r.why === "string" && r.why.trim().length >= 60,
      `${r.path}: the row's \`why\` is the whole content of a census entry — name the fields and say where ` +
        "their text comes from, in a sentence a later reader can check against the code."
    );
  }
});

test("every module that builds a prompt is declared", () => {
  const missing = enumerated.filter((rel) => !rowFor.has(rel));
  assert.deepEqual(
    missing,
    [],
    "these modules build a prompt and test-llm/adversarial/surfaces.json does not say whose text they render. " +
      "Add a row: `outside` if any field is written by somebody who is not the tenant (a synced ad account, a " +
      "public review, an inbound message, a fetched page), `tenant` otherwise — and say which fields, in the `why`."
  );
});

test("every declared module still exists", () => {
  for (const r of rows) {
    assert.ok(
      sources.has(r.path),
      `${r.path} is declared in test-llm/adversarial/surfaces.json and is not in the tree. A census that ` +
        "describes modules that are gone is read exactly like one that is current."
    );
  }
});

// --- 2. an `outside` row is backed by the code -------------------------------

const outside = rows.filter((r) => r.origin === "outside");

test("there are `outside` rows at all — a census with none is a census that stopped looking", () => {
  assert.ok(outside.length >= 5, `only ${outside.length} module(s) declared \`outside\`.`);
});

for (const r of outside) {
  test(`[backed] ${r.path}: the quarantine is in the code, not only in the row`, () => {
    const src = sources.get(r.path) ?? "";
    assert.match(
      src,
      QUARANTINE_IMPORT_RE,
      `${r.path} is declared \`outside\` and does not import src/lib/ai/untrusted. Either it quarantines its ` +
        "third-party fields or the row is wrong; making the row wrong is not the fix."
    );
    assert.ok(
      src.includes("untrustedFirewallLines("),
      `${r.path}: no untrustedFirewallLines(...) call. Structural neutralisation alone does nothing for a ` +
        "single-line payload — the model has to be told, in the prompt it is reading, that the quoted text is data."
    );
    assert.ok(Array.isArray(r.fields) && r.fields.length > 0, `${r.path}: an \`outside\` row must name its fields.`);
    for (const f of r.fields) {
      assert.ok(
        typeof f.from === "string" && f.from.trim().length > 0,
        `${r.path}.${f.name}: say where the text comes from — that is the claim the classification rests on.`
      );
      assert.ok(
        src.includes(f.name),
        `${r.path}: the row names a field \`${f.name}\` that does not appear in the module. It was renamed or ` +
          "removed, and the row is now describing a surface that is not there."
      );
      const helper = f.containment === "block" ? "quoteUntrusted(" : "inlineUntrusted(";
      assert.ok(
        ["inline", "block"].includes(f.containment),
        `${r.path}.${f.name}: containment "${f.containment}" is neither inline nor block.`
      );
      assert.ok(
        src.includes(helper),
        `${r.path}.${f.name} declares ${f.containment} containment and the module never calls ${helper}...). ` +
          "An inline surface folds its line breaks; a block surface is delimited."
      );
    }
    assert.ok(Array.isArray(r.builders) && r.builders.length > 0, `${r.path}: name the builder(s) the corpus can reach.`);
    for (const b of r.builders) {
      assert.ok(
        src.includes(`export function ${b}(`),
        `${r.path}: \`${b}\` is not exported, so nothing outside the module can put a hostile payload through it.`
      );
    }
  });
}

// --- 3. the row cannot be skipped --------------------------------------------

test("a module that reaches for the quarantine is declared `outside`", () => {
  for (const rel of enumerated) {
    if (!QUARANTINE_IMPORT_RE.test(sources.get(rel) ?? "")) continue;
    const row = rowFor.get(rel);
    assert.ok(row, `${rel} imports the quarantine and has no row.`);
    assert.equal(
      row.origin,
      "outside",
      `${rel} quarantines third-party text and its row says \`${row.origin}\`. Quarantining a field and then ` +
        "declaring the module clean is the one combination that leaves the census lying in the safe direction."
    );
  }
});

// --- 4. and it is rehearsed against a real payload ---------------------------

const corpusBuilders = new Set((CORPUS.cases ?? []).map((c) => c.builder));

test("every `outside` module is exercised by the adversarial corpus", () => {
  for (const r of outside) {
    assert.ok(
      r.builders.some((b) => corpusBuilders.has(b)),
      `${r.path} is declared \`outside\` and no case in test-llm/adversarial/corpus.json goes through ` +
        `${r.builders.join(" / ")}. A declaration nothing rehearses is a claim, and this repository's whole ` +
        "argument is that a claim is not a fence."
    );
  }
});

test("every corpus case names a builder some declared `outside` module owns", () => {
  const owned = new Set(outside.flatMap((r) => r.builders));
  for (const b of corpusBuilders) {
    assert.ok(
      owned.has(b),
      `the corpus exercises \`${b}\` and no \`outside\` row claims it. Either the module's row is missing or the ` +
        "builder moved — both leave the census describing a surface nobody owns."
    );
  }
});
