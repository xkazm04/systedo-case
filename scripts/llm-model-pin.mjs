#!/usr/bin/env node
/** WHICH MODEL was any of this proved against? (zero-dependency, offline, free)
 *
 *  WHAT WAS MISSING. The LLM harness here is unusually complete and every part of
 *  it records something about the OUTPUT: `test-llm/golden/` pins each tool's
 *  prompt hash, system prompt and schema; `test-llm/quality/` bakes a scorecard
 *  with a floor; `test-llm/budget.json` pins what a prompt costs on the input
 *  side. Not one of them records which MODEL that was true of. The hash-cached
 *  real-model re-prove was retired on 2026-08-05 in favour of the static gate, so
 *  a golden accepted a year ago is asserting a shape that a model somebody has
 *  since renamed — or replaced — once produced. The dependency that can change
 *  underneath this harness is the model itself, and it was the one dependency
 *  nothing in the repository named.
 *
 *  WHAT THIS PINS. The model SURFACE this app serves through: the tags and CLI
 *  aliases in `src/lib/llm/models.ts`, which that file's own header calls the
 *  single source of truth. `test-llm/model-pins.json` records each one and the
 *  reason it was last accepted. Bumping `GEMINI_MODEL` to the next preview is a
 *  one-word diff that changes what every golden in the corpus is asserting
 *  against; with a pin it is a one-word diff that fails the build until somebody
 *  says, in writing, what was re-proved.
 *
 *  AND WHAT IT CANNOT. A provider moving the model behind a stable alias. `sonnet`
 *  is a pointer and `gemini-3-flash-preview` is a pointer; what they point at
 *  ships without a commit here, and no committed file can see it. That is dated by
 *  the weekly `npm run llm:drift` instead, and it is written down in the pin
 *  file's own `unpinnable` list rather than left for a reader to discover. A pin
 *  that overclaims is worse than no pin.
 *
 *  RUNG. Blocking through the unit suite (test-unit/llm-model-pin.test.mjs, inside
 *  `npm run test:unit` → `check:ci` → `.husky/pre-push`), because it passes today
 *  and costs nothing: it reads two committed files, spawns nothing and calls
 *  nobody. The AGE of a pin is reported and never blocks — that is a clock, not a
 *  regression (ADR-0007).
 *
 *  Usage:
 *    npm run llm:models                      # the pinned surface, and its age
 *    npm run llm:models:check                # exit 1 on drift between source and pins
 *    npm run llm:models -- --accept --reason "…"   # re-pin from the source, on purpose
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_REL = "src/lib/llm/models.ts";
export const PINS_REL = "test-llm/model-pins.json";

/** Every `export const NAME = "literal"` whose name says it is a model. Deliberately
 *  literal-only: `APP_MODEL = CLAUDE_MODEL` and `BYOM_DEFAULT_MODELS = { … }` are an
 *  alias and a table of user-choosable defaults, neither of which is a new model id
 *  arriving. Pure — the whole point is that this can be run against a STRING in a
 *  test, not only against the file on disk. */
export function declaredModels(source) {
  const found = new Map();
  const re = /export const ([A-Za-z0-9_]+)\s*(?::[^=\n]+)?=\s*"([^"]*)"\s*;/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    if (!/MODEL/.test(m[1])) continue;
    found.set(m[1], m[2]);
  }
  return found;
}

/** Compare what the source declares with what the pin file records. Returns a list
 *  of findings, each a sentence a reader can act on. Pure. */
export function comparePins(source, pins) {
  const declared = declaredModels(source);
  const findings = [];
  const accounted = new Set();

  for (const pin of pins.pins ?? []) {
    for (const [key, aliasKey] of [
      ["declaredBy", "tag"],
      ["aliasDeclaredBy", "alias"],
    ]) {
      const constName = pin[key];
      if (!constName) continue;
      accounted.add(constName);
      const value = declared.get(constName);
      if (value === undefined) {
        findings.push(
          `${pin.path}: ${SOURCE_REL} no longer declares \`${constName}\`. The pin is now describing a provider ` +
            "path that does not exist — re-pin, or retire the path and say which harness records go with it."
        );
        continue;
      }
      if (value !== pin[aliasKey]) {
        findings.push(
          `${pin.path}: \`${constName}\` is now "${value}", pinned as "${pin[aliasKey]}". Everything the harness ` +
            "recorded — the goldens, the quality bake, the budget ceilings — was accepted against the pinned " +
            "model. Re-prove and re-pin in the same change."
        );
      }
    }
  }

  for (const ex of pins.excluded ?? []) {
    if (ex.declaredBy) accounted.add(ex.declaredBy);
  }

  for (const [name, value] of declared) {
    if (accounted.has(name)) continue;
    findings.push(
      `${SOURCE_REL} declares a model constant nothing accounts for: \`${name}\` = "${value}". Pin it in ` +
        `${PINS_REL}, or list it under \`excluded\` with the reason the harness never proves it.`
    );
  }

  if (!pins.acceptance?.pinnedAt || !pins.acceptance?.reason) {
    findings.push(
      `${PINS_REL} has no dated \`acceptance\` with a reason. A pin nobody signed is a number in a file — ` +
        'record it with `npm run llm:models -- --accept --reason "…"`.'
    );
  }

  return findings;
}

/** Days since the pins were last accepted. Reported, never blocking: a calendar is
 *  not a regression, and a gate that goes red because time passed is a gate people
 *  learn to ignore. */
export function pinAgeDays(pins, now = Date.now()) {
  const at = Date.parse(`${pins.acceptance?.pinnedAt ?? ""}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  return Math.floor((now - at) / 86_400_000);
}

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
  };
  const CHECK = argv.includes("--check");
  const ACCEPT = argv.includes("--accept");

  const source = read(SOURCE_REL);
  const pins = JSON.parse(read(PINS_REL));

  if (ACCEPT) {
    const reason = arg("--reason");
    // The same discipline as `npm run llm:eval:update`: accepting is legitimate and
    // routine, and a one-word reason is how an accepted drift becomes invisible.
    if (!reason || reason.trim().length < 20) {
      console.error("✗ llm:models --accept needs `--reason \"…\"` — at least a sentence.");
      console.error("  Say what changed and what was re-proved against the new model, e.g.:");
      console.error('    npm run llm:models -- --accept --reason "gemini-3-flash GA replaced the preview tag;');
      console.error('      npm run llm:drift green on all 23 operations 2026-09-04"');
      process.exit(1);
    }
    const declared = declaredModels(source);
    for (const pin of pins.pins ?? []) {
      if (pin.declaredBy && declared.has(pin.declaredBy)) pin.tag = declared.get(pin.declaredBy);
      if (pin.aliasDeclaredBy && declared.has(pin.aliasDeclaredBy)) pin.alias = declared.get(pin.aliasDeclaredBy);
    }
    pins.acceptance = {
      ...(pins.acceptance ?? {}),
      pinnedAt: new Date().toISOString().slice(0, 10),
      reason: reason.trim(),
    };
    writeFileSync(join(ROOT, PINS_REL), `${JSON.stringify(pins, null, 2)}\n`);
    console.log(`✓ ${PINS_REL} re-pinned from ${SOURCE_REL}.`);
    console.log("  Commit it with the change that moved the model — the two belong in one diff.");
    process.exit(0);
  }

  const findings = comparePins(source, pins);
  const age = pinAgeDays(pins);

  console.log(`Model pins — ${pins.pins?.length ?? 0} provider path(s), from ${SOURCE_REL}`);
  console.log("");
  for (const pin of pins.pins ?? []) {
    const alias = pin.alias ? `  (CLI alias \`${pin.alias}\`)` : "";
    console.log(`  ${pin.path.padEnd(20)} ${pin.tag}${alias}`);
  }
  console.log("");
  console.log(`  accepted: ${pins.acceptance?.pinnedAt ?? "never"}${age === null ? "" : ` (${age} days ago)`}`);
  console.log(`  proved against a real model under this pin: ${pins.acceptance?.provenAt ?? "not yet"}`);
  if (age !== null && pins.maxAgeDays && age > pins.maxAgeDays) {
    console.log("");
    console.log(
      `  ⚠ the pins are ${age} days old (budget ${pins.maxAgeDays}). Reported, not failed — but every record in ` +
        "test-llm/ is that old too. `npm run llm:drift` re-proves them against the configured provider."
    );
  }
  console.log("");
  for (const line of pins.unpinnable ?? []) console.log(`  · cannot be pinned here: ${line}`);

  if (findings.length) {
    console.error("");
    console.error(`✗ model pins: ${findings.length} finding(s):`);
    for (const f of findings) console.error(`  • ${f}`);
    console.error("");
    console.error("  If the model moved on purpose, re-prove it and record that:");
    console.error('    npm run llm:drift                                   # what the provider actually answers');
    console.error('    npm run llm:models -- --accept --reason "…"         # the pin, with the reason');
    console.error("");
    process.exit(1);
  }

  if (CHECK) {
    console.log("");
    console.log("✓ model pins: every model this app serves through is the one the harness records were accepted for.");
  }
  process.exit(0);
}
