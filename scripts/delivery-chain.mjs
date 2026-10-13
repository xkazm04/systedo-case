#!/usr/bin/env node
/** The delivery chain — printed, and regenerated where it is copied out.
 *
 *  `check:ci` is declared once, in package.json. Three other files describe it:
 *  `.github/workflows/ci.yml` (which runs it, and argues its cheapest-first
 *  order), `.husky/pre-push` (which proves it before the push that IS the
 *  release) and `docs/deploy.md` § Delivery contract (which tells a human what
 *  "green" means). Until now those three were kept in step by a comment asking
 *  the reader to keep them in step, and two of them had already fallen behind.
 *
 *  This is the writer; scripts/lib/delivery.mjs is the reader, and
 *  `npm run merge-gate` — blocking inside `check:ci`, therefore inside the
 *  pre-push hook — is where a drifted copy turns the build red.
 *
 *  Usage:
 *    npm run delivery:chain             # the chain, and whether the copies agree
 *    npm run delivery:chain -- --write  # regenerate the marked regions
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COPIES, REPO_ROOT, deliveryDrift, deliveryReport, replaceRegion } from "./lib/delivery.mjs";

const WRITE = process.argv.slice(2).includes("--write");
const { stages, workflow, hook } = deliveryReport();

console.log(`Delivery chain — ${stages.length} stage(s), declared once in package.json \`check:ci\``);
console.log("");
stages.forEach((stage, i) => console.log(`  ${String(i + 1).padStart(2)}. ${stage}`));
console.log("");
console.log(`  run by      ${workflow} (through \`check:ci:timed\`)`);
console.log(`  proven by   ${hook} before any push that updates master`);
console.log(`  copied into ${COPIES.map((c) => c.file).join(", ")}`);
console.log("");

if (WRITE) {
  let touched = 0;
  for (const copy of COPIES) {
    const path = join(REPO_ROOT, copy.file);
    const before = readFileSync(path, "utf8");
    const after = replaceRegion(before, copy.render(stages));
    if (after === null) {
      console.error(`✗ ${copy.file} has no BEGIN:check-ci-chain … END:check-ci-chain region to write into.`);
      process.exit(1);
    }
    if (after !== before) {
      writeFileSync(path, after);
      touched += 1;
      console.log(`  ✎ ${copy.file}`);
    }
  }
  console.log(touched ? `✓ regenerated ${touched} copy(ies) — commit them.` : "✓ every copy already matches.");
  process.exit(0);
}

const problems = deliveryDrift();
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s) with the delivery contract:`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error("");
  console.error("  Fix: `npm run delivery:chain -- --write` regenerates the copies. A stage ci.yml never names,");
  console.error("  or a hook that runs less than the whole chain, is a change to the gate itself — make it there.");
  process.exit(1);
}
console.log("✓ ci.yml, `check:ci` and .husky/pre-push name the same gate, and every copy of it is current.");
