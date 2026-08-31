#!/usr/bin/env node
/** The revert drill, run by a machine instead of by somebody remembering
 *  (zero-dependency).
 *
 *  WHY THIS EXISTS. Everything else in this repository verifies a change on the
 *  way IN — the goldens, the quality bake, the budget gate, the rubric review,
 *  the checkpoint check. Vercel ships `master` on push, so the push IS the
 *  release act (docs/deploy.md § Delivery contract), and ~97% of the pushes are
 *  agent-written. The way back out was written down in
 *  docs/runbooks/revert-drill.md and, by that file's own admission, never once
 *  rehearsed: its Results table had no rows, because running it meant a person
 *  deciding to spend thirty minutes on it.
 *
 *  A rehearsal nobody schedules is a design. So the two legs that need no
 *  production access run here, unattended, weekly
 *  (.github/workflows/revert-drill.yml) and on demand (`npm run revert:drill`):
 *
 *    DETECT   A real fault is seeded on a seam this repository says matters, and
 *             the gate layers run in the order CI runs them until one goes red.
 *             The answer is a layer and a number of seconds. A seed that survives
 *             every layer is the drill's most valuable outcome and its red: that
 *             change would have shipped.
 *    RESTORE  The seed is removed and the file is compared byte-for-byte against
 *             what was read before it was applied. This is the repository half of
 *             a rollback in miniature — "does taking it back out actually leave
 *             the tree where it was?" — and it runs in a `finally`, so a drill
 *             that dies mid-run still puts the tree back.
 *
 *  WHAT IT DELIBERATELY DOES NOT DO. It never touches git, never pushes, and
 *  never promotes: flipping the production alias is a production action under the
 *  operator's name (AGENTS.md § Red), and `vercel promote <last-good-url>` stays
 *  the operator's leg with its steps in docs/deploy.md § Deploy + rollback. This
 *  drill measures how fast a bad change is CAUGHT and proves it can be taken back
 *  out cleanly; it does not claim to have rolled anything back.
 *
 *  RUNG: reporting (docs/adr/0007-gate-rung-discipline.md). It runs the whole
 *  unit suite twice over, so it can never sit in `check:ci` or the pre-push hook,
 *  and it is deliberately absent from .github/required-checks.json. Its red is a
 *  signal to a human — a seam that nothing catches, or a seed that no longer
 *  applies — not a blocked release.
 *
 *  Usage:
 *    npm run revert:drill                  # this week's seed
 *    npm run revert:drill -- --list        # the catalogue
 *    npm run revert:drill -- --seed key-sanitiser
 *    npm run revert:drill -- --out drill.json --summary "$GITHUB_STEP_SUMMARY"
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The seeds. Each is ONE LINE, subtle, types cleanly, and lands on a seam this
 *  repository has written a decision record about — so a seed that survives is a
 *  statement about a seam and not about a typo.
 *
 *  `find` is matched literally and must occur EXACTLY ONCE in the file: an anchor
 *  that has drifted fails the drill loudly rather than seeding something else by
 *  accident. Single-line anchors only — a multi-line one would depend on the
 *  checkout's line endings.
 *
 *  `caughtBy` records which layer has caught it before. It is reported, never
 *  asserted: which layer bites is the measurement, and pinning it would turn an
 *  improvement (a cheaper layer learning the seam) into a failure. */
const SEEDS = [
  {
    id: "key-sanitiser",
    seam: "Tenancy — ADR-0002 (the tenant key embeds the user id)",
    file: "src/lib/campaigns/store-keys.ts",
    find: '  return s.replace(/[^A-Za-z0-9_-]/g, "_");',
    replace: '  return s.replace(/[^A-Za-z0-9_/-]/g, "_");',
    why:
      "one character added to a character class lets a `/` survive sanitisation, so a tenant-key component " +
      "can break out of its Firestore document path into a nested sub-collection. Nothing about the shape " +
      "of the code looks wrong.",
    caughtBy: "test:unit",
  },
  {
    id: "doc-id-order",
    seam: "The store — ADR-0001 (one interface, two backends)",
    file: "src/lib/campaigns/store-keys.ts",
    find: "  return `${period}_${campaignId}`;",
    replace: "  return `${campaignId}_${period}`;",
    why:
      "the two halves of a period-keyed document id are swapped. Every id is still unique and still parses; " +
      "they no longer sort into per-period ranges, and every document written before the change is now " +
      "unreachable by the reader.",
    caughtBy: "test:unit",
  },
  {
    id: "range-sentinel",
    seam: "The store — the snapshot id-range upper bound",
    file: "src/lib/campaigns/store-keys.ts",
    find: 'export const AFTER_ANY_ID = "\\uF8FF";',
    replace: 'export const AFTER_ANY_ID = "";',
    why:
      "the private-use sentinel that bounds a period's snapshot id-range is emptied — exactly what an " +
      "editor's \"strip non-printable characters\" or a careless refactor would do. `gte === lt`, so every " +
      "snapshot range query returns nothing and every screen renders empty rather than broken.",
    caughtBy: "test:unit",
  },
];

/** The layers, in the order CI runs them, cheapest first. `sees` is the honest
 *  limit — what this layer cannot catch — and it is the column the runbook's
 *  detection table is built from. */
const LAYERS = [
  {
    id: "typecheck",
    script: "typecheck",
    cannotSee: "anything that type-checks and is still wrong — which is every seed in the catalogue above",
  },
  {
    id: "test:unit",
    script: "test:unit",
    cannotSee: "a seam with no unit test, and every fault that only appears against a real store or a real model",
  },
];

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const OUT = arg("--out");
const REPORT = arg("--report");
const SUMMARY = arg("--summary");

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

if (argv.includes("--list")) {
  console.log("Revert-drill seeds (docs/runbooks/revert-drill.md):\n");
  for (const s of SEEDS) {
    console.log(`  ${s.id}`);
    console.log(`    seam: ${s.seam}`);
    console.log(`    file: ${s.file}`);
    console.log(`    why:  ${s.why}`);
    console.log("");
  }
  process.exit(0);
}

/** Which seed. A named one, or this week's — rotating means a seed the suite has
 *  since been taught is not the only thing this ever proves. */
function pickSeed() {
  const named = arg("--seed");
  if (named) {
    const found = SEEDS.find((s) => s.id === named);
    if (!found) {
      console.error(`revert-drill: no seed called "${named}". Known: ${SEEDS.map((s) => s.id).join(", ")}`);
      process.exit(1);
    }
    return found;
  }
  const now = new Date();
  const week = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * 24 * 3600 * 1000));
  return SEEDS[week % SEEDS.length];
}

const seed = pickSeed();
const target = join(ROOT, seed.file);

let original;
try {
  original = readFileSync(target, "utf8");
} catch (err) {
  console.error(`revert-drill: cannot read ${seed.file} — ${err.message}`);
  console.error("The seed names a file that has moved. Update the catalogue in scripts/revert-drill.mjs.");
  process.exit(1);
}

const occurrences = original.split(seed.find).length - 1;
if (occurrences !== 1) {
  console.error("");
  console.error(`✗ revert-drill: the "${seed.id}" seed no longer applies to ${seed.file}.`);
  console.error(`  Its anchor occurs ${occurrences} time(s); a seed must match exactly once or it would edit`);
  console.error("  something nobody chose. The code moved — re-anchor the seed in scripts/revert-drill.mjs,");
  console.error("  or drop it and say in the commit which seam is now unrehearsed.");
  console.error("");
  console.error(`  anchor: ${seed.find}`);
  console.error("");
  process.exit(1);
}

const npm = "npm";
/** 64 MB, because the unit suite prints a line per assertion and the default 1 MB
 *  would truncate it — and a truncated child exits non-zero, which this drill
 *  would then report as a layer catching the seed. A buffer limit must never be
 *  able to look like a detection. */
const runOpts = {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 64 * 1024 * 1024,
};

function runLayer(layer) {
  const started = Date.now();
  const res = spawnSync(npm, ["run", layer.script], runOpts);
  const seconds = (Date.now() - started) / 1000;
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  // A layer that could not be STARTED (npm missing, buffer blown) has not caught
  // anything; saying so is the difference between a measurement and a guess.
  if (res.error) return { broken: res.error.message, red: false, seconds, output };
  return { broken: null, red: res.status !== 0, seconds, output };
}

say(`Revert drill — seed "${seed.id}" on ${seed.file}`);
say("");
say(`  seam: ${seed.seam}`);
say(`  what it does: ${seed.why}`);
say("");

// The baseline, before anything is seeded. A layer that is ALREADY red would be
// reported below as having caught the seed, which is the one way this drill could
// lie — and it would lie in the reassuring direction. So the clean tree is proven
// green first, and a red baseline stops the run instead of being measured against.
for (const layer of LAYERS) {
  const { broken, red, seconds, output } = runLayer(layer);
  if (broken) {
    console.error(`✗ revert-drill: could not run \`npm run ${layer.script}\` — ${broken}`);
    process.exit(1);
  }
  say(`  ${red ? "RED " : "green"}  ${layer.id.padEnd(10)} ${seconds.toFixed(1)}s  (baseline, no seed applied)`);
  if (!red) continue;
  console.error("");
  console.error(`✗ revert-drill: \`npm run ${layer.script}\` is already red on the unseeded tree.`);
  console.error("  A detection drill measured against a red baseline reports every layer as having caught the");
  console.error("  seed. Fix the tree, then run the drill. Its last lines:");
  console.error("");
  for (const line of output.trim().split(/\r?\n/).slice(-12)) console.error(`    ${line}`);
  console.error("");
  process.exit(1);
}
say("");

const verdict = {
  ranAt: new Date().toISOString(),
  seed: seed.id,
  seam: seed.seam,
  file: seed.file,
  caughtBy: null,
  detectSeconds: null,
  restored: false,
  restoreSeconds: null,
  layers: [],
};

let failure = null;

try {
  writeFileSync(target, original.split(seed.find).join(seed.replace));
  const t0 = Date.now();
  say("  T0 — seed applied.");

  for (const layer of LAYERS) {
    const { broken, red, seconds, output } = runLayer(layer);
    if (broken) {
      failure = `could not run \`npm run ${layer.script}\` with the seed applied — ${broken}`;
      break;
    }
    verdict.layers.push({ id: layer.id, red, seconds: Number(seconds.toFixed(1)) });
    say(`  ${red ? "RED " : "green"}  ${layer.id.padEnd(10)} ${seconds.toFixed(1)}s`);
    if (!red) continue;
    verdict.caughtBy = layer.id;
    verdict.detectSeconds = Number(((Date.now() - t0) / 1000).toFixed(1));
    const tail = output.trim().split(/\r?\n/).slice(-12).join("\n");
    say("");
    say(`  T1 — caught by \`npm run ${layer.script}\` after ${verdict.detectSeconds}s. Its last lines:`);
    say("");
    for (const line of tail.split("\n")) say(`    ${line}`);
    break;
  }

  if (!verdict.caughtBy && !failure) {
    verdict.detectSeconds = Number(((Date.now() - t0) / 1000).toFixed(1));
    failure =
      `nothing caught the "${seed.id}" seed. It passed ` +
      `${LAYERS.map((l) => l.id).join(" and ")} — on this repository's landing path that change would have ` +
      "been pushed, and Vercel would have shipped it.";
  }
} finally {
  // RESTORE — the repository half of a rollback, and the reason this runs in a
  // `finally`: a drill that dies with a seeded fault on disk has left the tree
  // worse than it found it, which is the one thing a rehearsal must never do.
  const startedRestore = Date.now();
  try {
    writeFileSync(target, original);
    verdict.restored = readFileSync(target, "utf8") === original;
  } catch (err) {
    verdict.restored = false;
    console.error(`revert-drill: could not restore ${seed.file} — ${err.message}`);
  }
  verdict.restoreSeconds = Number(((Date.now() - startedRestore) / 1000).toFixed(2));
}

say("");
if (verdict.restored) {
  say(`  T3 — seed removed; ${seed.file} is byte-for-byte what it was (${verdict.restoreSeconds}s).`);
} else {
  say(`  ✗ ${seed.file} was NOT restored. Check the file before doing anything else.`);
}

say("");
say("| Date | Seed | Caught by | Detect (s) | Restored |");
say("| --- | --- | --- | --- | --- |");
say(
  `| ${verdict.ranAt.slice(0, 10)} | \`${verdict.seed}\` | ${verdict.caughtBy ?? "**nothing**"} | ` +
    `${verdict.detectSeconds ?? "—"} | ${verdict.restored ? "yes" : "**no**"} |`
);
say("");
say(
  "The promote leg is the operator's and is not rehearsed here: `vercel promote <last-good-deployment-url>` " +
    "(docs/deploy.md § Deploy + rollback). What this drill measures is how long a bad change survives the " +
    "gates, and that removing it restores the tree."
);
for (const layer of LAYERS) say(`  · \`${layer.id}\` cannot see: ${layer.cannotSee}`);

if (OUT) {
  try {
    writeFileSync(OUT, `${JSON.stringify(verdict, null, 2)}\n`);
  } catch (err) {
    console.error(`(revert-drill: could not write ${OUT} — ${err.message})`);
  }
}
if (REPORT) {
  // The dated record, in the form the trail issue publishes. Not committed: master
  // ships on push, so a commit from a scheduled job would be a release.
  try {
    writeFileSync(
      REPORT,
      [
        "## Revert drill — how long a bad change survives",
        "",
        `_Run ${verdict.ranAt} · seed \`${verdict.seed}\` · ${verdict.seam}._`,
        "",
        ...out,
        "",
      ].join("\n")
    );
  } catch (err) {
    console.error(`(revert-drill: could not write ${REPORT} — ${err.message})`);
  }
}
if (SUMMARY) {
  try {
    appendFileSync(SUMMARY, `### Revert drill\n\n${out.join("\n")}\n`);
  } catch (err) {
    console.error(`(revert-drill: could not write the summary — ${err.message})`);
  }
}

if (failure) {
  console.error("");
  console.error(`✗ revert-drill: ${failure}`);
  console.error("");
  console.error("  That is the drill's FINDING, not its bug. Write the seed into the Findings section of");
  console.error("  docs/runbooks/revert-drill.md and open the missing test. Do not widen the seed until");
  console.error("  something catches it, and do not delete it to go green.");
  console.error("");
  process.exit(1);
}
if (!verdict.restored) process.exit(2);
process.exit(0);
