/** The delivery contract, parsed — one chain, three consumers (zero-dependency).
 *
 *  `.github/workflows/ci.yml` opens by asking the reader to "keep ci.yml, the
 *  `check:ci` script, and .husky/pre-push pointing at each other so the three can
 *  never drift". That was the one alignment in this repository maintained by good
 *  intentions: every other claim of this shape has a gate behind it, and this one
 *  had a comment. It had already drifted — `docs/deploy.md` § Delivery contract
 *  listed eleven of the sixteen stages, the pre-push hook's own skip message named
 *  eight, and neither list mentioned `sast`, which is the stage that stops a route
 *  shipping without caller identity.
 *
 *  The chain is DECLARED once, in package.json's `check:ci` entry (scripts/lib/
 *  chain.mjs parses it, once). What this module adds is the other half: the
 *  consumers of that declaration are held to it.
 *
 *    D1  every stage of the chain is a real npm script — a typo is a gate that
 *        never runs, on every machine that never got that far;
 *    D2  .husky/pre-push runs the WHOLE chain (`npm run check:ci`) on a push that
 *        updates master — the push is the release act here, so this hook is the
 *        only place a gate can refuse a deploy rather than comment on one;
 *    D3  ci.yml runs that same chain, and when it runs it through the timed
 *        wrapper, the wrapper derives its stages from scripts/lib/chain.mjs
 *        rather than keeping a second list of its own;
 *    D4  every stage is NAMED in ci.yml. The workflow's comment is what justifies
 *        the cheapest-first order, and a gate missing from it is a gate whose
 *        cost nobody argued;
 *    D5  the place that enumerates the chain for a human — docs/deploy.md
 *        § Delivery contract — lists exactly the chain, in order. It is
 *        GENERATED between markers: `npm run delivery:chain -- --write` rewrites
 *        it, and this check refuses a hand-drifted copy.
 *
 *  `.husky/pre-push` states the chain in prose too, and that copy is deliberately
 *  NOT generated: a hook is executable code a contributor is asked to trust, and
 *  a script that rewrites it is a worse thing to have than a stale sentence in it.
 *  What is checked there is behaviour — that it runs the WHOLE chain, on the ref
 *  that matters — which is the half that decides whether a release is proven.
 *
 *  Consumed by scripts/merge-gate.mjs, which already owns "a gate may not quietly
 *  become a comment" and is blocking inside `check:ci` → `.husky/pre-push`. It
 *  reads committed files only, so it holds in a fork's CI and in the hook.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chainStages } from "./chain.mjs";

/** The repository root, from this file's own location. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The markers around every generated copy of the chain. */
export const BEGIN = "BEGIN:check-ci-chain";
export const END = "END:check-ci-chain";

const PKG = "package.json";
const HOOK = ".husky/pre-push";
const WORKFLOW = ".github/workflows/ci.yml";
const DOC = "docs/deploy.md";

const read = (root, rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);

/** The lines strictly between the markers, or null when the region is absent. */
export function region(text) {
  if (text == null) return null;
  const lines = text.split(/\r?\n/);
  const b = lines.findIndex((l) => l.includes(BEGIN));
  const e = lines.findIndex((l) => l.includes(END));
  if (b === -1 || e === -1 || e < b) return null;
  return lines.slice(b + 1, e);
}

/** Replace the marked region's body, keeping the marker lines themselves. */
export function replaceRegion(text, body) {
  const lines = text.split(/\r?\n/);
  const b = lines.findIndex((l) => l.includes(BEGIN));
  const e = lines.findIndex((l) => l.includes(END));
  if (b === -1 || e === -1 || e < b) return null;
  return [...lines.slice(0, b + 1), ...body, ...lines.slice(e)].join("\n");
}

/** The document states the chain as backticked names joined by arrows. */
export const renderDoc = (stages) => [`  ${stages.map((s) => `\`${s}\``).join(" → ")}`];
const readDoc = (body) => {
  const found = body.flatMap((l) => [...l.matchAll(/`([\w:-]+)`/g)].map((m) => m[1]));
  return found.length ? found : null;
};

/** The human-readable copies, and how each is written and read back. */
export const COPIES = [{ file: DOC, read: readDoc, render: renderDoc }];

/** A stage name, matched as a whole token rather than as a substring — `check` is
 *  a prefix of `check:ci`, and `Typecheck` contains it. */
const names = (text, stage) =>
  new RegExp(`(?<![\\w:-])${stage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:-])`).test(text);

/**
 * Every way the three definitions of the gate can have stopped naming the same one.
 *
 * @param {string} [root]  repository root (overridable so a test can point the real
 *                         check at a fixture tree and require a red)
 * @returns {string[]}     one sentence per problem; empty means aligned
 */
export function deliveryDrift(root = REPO_ROOT) {
  const problems = [];

  const pkgText = read(root, PKG);
  if (!pkgText) return [`${PKG} does not exist, so nothing declares the delivery chain.`];
  let pkg;
  try {
    pkg = JSON.parse(pkgText);
  } catch (err) {
    return [`${PKG} is not valid JSON — ${err.message}`];
  }

  const stages = chainStages(pkg);
  if (!stages.length) {
    return [`${PKG} declares no \`check:ci\` chain — the delivery contract has no subject.`];
  }

  // D1 — a stage that is not a script is a gate that never runs.
  const scripts = pkg.scripts ?? {};
  for (const stage of stages) {
    if (!scripts[stage]) {
      problems.push(
        `\`check:ci\` runs \`npm run ${stage}\`, which ${PKG} does not define. A typo in the chain is a stage ` +
          "that silently never runs."
      );
    }
  }

  // D2 — the hook proves the whole chain before the push that IS the release.
  const hook = read(root, HOOK);
  if (!hook) {
    problems.push(`${HOOK} does not exist. Master ships on push, so nothing would prove the gate before a release.`);
  } else {
    if (!/npm run check:ci(?![\w:-])/.test(hook)) {
      problems.push(
        `${HOOK} no longer runs \`npm run check:ci\`. A hook that runs a SUBSET of the chain is the drift this ` +
          "check exists for: the push is the release act here."
      );
    }
    if (!hook.includes("refs/heads/master")) {
      problems.push(`${HOOK} no longer recognises a push that updates master, so the gate applies to nothing.`);
    }
    const handRolled = stages.filter((s) => new RegExp(`npm run ${s}(?![\\w:-])`).test(hook));
    if (handRolled.length) {
      problems.push(
        `${HOOK} runs ${handRolled.join(", ")} directly. A hook that assembles its own subset of the chain is how ` +
          "the release gate and CI's gate become two different things — run `npm run check:ci`, once."
      );
    }
  }

  // D3 — CI runs that same chain, and the timed wrapper keeps no second list.
  const workflow = read(root, WORKFLOW);
  if (!workflow) {
    problems.push(`${WORKFLOW} does not exist, but the delivery contract names it as the other side of the gate.`);
  } else {
    const executed = workflow
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    const timed = /npm run check:ci:timed(?![\w:-])/.test(executed);
    if (!timed && !/npm run check:ci(?![\w:-])/.test(executed)) {
      problems.push(
        `${WORKFLOW} runs neither \`check:ci\` nor \`check:ci:timed\`, so CI and the pre-push hook are now proving ` +
          "different things."
      );
    }
    if (timed) {
      const timings = read(root, "scripts/gate-timings.mjs");
      if (timings && !/lib\/chain\.mjs/.test(timings)) {
        problems.push(
          "scripts/gate-timings.mjs no longer parses the chain out of scripts/lib/chain.mjs, so the timed wrapper " +
            "CI runs holds a second list of stages that can disagree with `check:ci`."
        );
      }
    }

    // D4 — the comment that justifies the cheapest-first order names every gate.
    const unnamed = stages.filter((s) => !names(workflow, s));
    if (unnamed.length) {
      problems.push(
        `${WORKFLOW} never names ${unnamed.length} stage(s) of the chain: ${unnamed.join(", ")}. That file's ` +
          "comment is what argues the cheapest-first order; a gate missing from it is a gate whose cost nobody " +
          "argued and whose failure nobody expects."
      );
    }
  }

  // D5 — the copies written for a human are generated from the declaration.
  for (const copy of COPIES) {
    const text = read(root, copy.file);
    if (!text) {
      problems.push(`${copy.file} does not exist, but it is one of the places the chain is stated.`);
      continue;
    }
    const body = region(text);
    if (body === null) {
      problems.push(
        `${copy.file} has no \`${BEGIN}\` … \`${END}\` region. The chain is enumerated for a human there, and an ` +
          "enumeration nothing regenerates is the one that falls behind. Run `npm run delivery:chain -- --write`."
      );
      continue;
    }
    const listed = copy.read(body);
    if (!listed) {
      problems.push(`${copy.file}: the ${BEGIN} region states no stages. Run \`npm run delivery:chain -- --write\`.`);
      continue;
    }
    if (listed.join(" ") !== stages.join(" ")) {
      const missing = stages.filter((s) => !listed.includes(s));
      const extra = listed.filter((s) => !stages.includes(s));
      problems.push(
        `${copy.file} lists a chain that is not the one \`check:ci\` runs` +
          (missing.length ? `; missing: ${missing.join(", ")}` : "") +
          (extra.length ? `; not in the chain: ${extra.join(", ")}` : "") +
          (!missing.length && !extra.length ? " (same stages, different order)" : "") +
          ". Run `npm run delivery:chain -- --write`."
      );
    }
  }

  return problems;
}

/** The chain and where each copy of it lives — for the CLI's report. */
export function deliveryReport(root = REPO_ROOT) {
  const pkgText = read(root, PKG);
  const pkg = pkgText ? JSON.parse(pkgText) : {};
  return { stages: chainStages(pkg), copies: COPIES.map((c) => c.file), workflow: WORKFLOW, hook: HOOK };
}
