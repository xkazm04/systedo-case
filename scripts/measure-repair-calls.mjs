#!/usr/bin/env node
/**
 * How many self-repair MODEL CALLS does the wrapper still make?
 *
 * Every validate() violation used to trigger a full second model call — double
 * latency, double spend — even when the violation was a char-limit overrun that
 * normalize()'s clamp()/cleanClampedList() fixes deterministically anyway (and
 * which the old failed-repair path then silently fell back to). The wrapper now
 * partitions violations (see partitionViolations in src/lib/ai/tools/_shared.ts)
 * and re-prompts only for the ones a model genuinely has to fix.
 *
 * This measures the effect over the COMMITTED real-model corpus in
 * test-llm/samples/ — the same fixtures test-unit/llm-samples.test.mjs replays.
 *
 * Two populations are reported, because the pristine corpus alone would understate
 * nothing but also prove nothing (a captured sample passed validation by
 * construction — that is why it was captured):
 *
 *   pristine  — each sample exactly as captured. The floor: the change must not
 *               introduce a repair call where there was none.
 *   overrun   — each sample with ONE string field blown past its limit (that
 *               string repeated until it is long), one case per string field.
 *               This is the real-world failure the repair path exists for: a model
 *               that writes a headline four words too long.
 *
 * Deterministic, offline, zero model spend.
 *
 * Usage:  node scripts/measure-repair-calls.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// The TS sources are loaded through the same resolve hook the node:test suites use.
register("./test-llm/resolve-hooks.mjs", pathToFileURL("./"));

const { partitionViolations } = await import("../src/lib/ai/tools/_shared.ts");
const { validateAds } = await import("../src/lib/ai/tools/ads.ts");
const { validateBrief } = await import("../src/lib/ai/tools/brief.ts");
const { validateReport } = await import("../src/lib/ai/tools/campaign-eval.ts");
const { validateLocalReviewReply } = await import("../src/lib/ai/tools/local-review-reply.ts");
const { validateArticleDraft } = await import("../src/lib/ai/tools/article-draft.ts");
const { validateRepurpose } = await import("../src/lib/ai/tools/repurpose.ts");
const { validateSocial } = await import("../src/lib/ai/tools/social.ts");

/** sample id → the app validator, bound to whatever request context it needs.
 *  Only tools whose validator is a function of the parse (plus context derivable
 *  from the sample itself) AND whose module imports without dragging in the app's
 *  JSON data graph are measured; the rest need a live request / a Next build. */
const VALIDATORS = {
  ads: validateAds,
  brief: validateBrief,
  "campaign-eval": validateReport,
  "local-review-reply": validateLocalReviewReply,
  "article-draft": (p) => validateArticleDraft(p, false),
  // The requested channels / platforms are exactly the ones the captured output
  // answered for, so the "missing variant" branch never fires spuriously.
  repurpose: (p) => validateRepurpose(channelsOf(p), p),
  social: (p) => validateSocial(p, platformsOf(p)),
};

const channelsOf = (p) =>
  Array.isArray(p?.variants) ? p.variants.map((v) => v?.channel).filter((c) => typeof c === "string") : [];
const platformsOf = (p) =>
  Array.isArray(p?.posts) ? p.posts.map((v) => v?.platform).filter((c) => typeof c === "string") : [];

const SAMPLES = join(process.cwd(), "test-llm", "samples");

/** Every path to a non-empty string inside a parsed sample. */
function stringPaths(node, path = []) {
  if (typeof node === "string") return node.trim() ? [path] : [];
  if (Array.isArray(node)) return node.flatMap((v, i) => stringPaths(v, [...path, i]));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => stringPaths(v, [...path, k]));
  }
  return [];
}

/** A structural clone with the string at `path` blown well past any tool limit. */
function withOverrun(sample, path) {
  const copy = structuredClone(sample);
  let node = copy;
  for (const key of path.slice(0, -1)) node = node[key];
  const last = path[path.length - 1];
  // Repeat the model's own words rather than pasting filler: the overrun stays
  // realistic prose, so a validator that inspects content still behaves sanely.
  node[last] = Array.from({ length: 24 }, () => node[last]).join(" ");
  return copy;
}

const rows = [];
let pristineBefore = 0;
let pristineAfter = 0;
let overrunCases = 0;
let overrunBefore = 0;
let overrunAfter = 0;

for (const [id, validate] of Object.entries(VALIDATORS)) {
  const file = join(SAMPLES, `${id}.json`);
  if (!existsSync(file)) {
    rows.push({ id, note: "no captured sample" });
    continue;
  }
  const sample = JSON.parse(readFileSync(file, "utf8"));

  const pv = validate(sample);
  const pp = partitionViolations(pv);
  if (pv.length > 0) pristineBefore++;
  if (pp.needsModel.length > 0) pristineAfter++;

  let cases = 0;
  let before = 0;
  let after = 0;
  for (const path of stringPaths(sample)) {
    const v = validate(withOverrun(sample, path));
    const { needsModel } = partitionViolations(v);
    cases++;
    if (v.length > 0) before++;
    if (needsModel.length > 0) after++;
  }
  overrunCases += cases;
  overrunBefore += before;
  overrunAfter += after;

  rows.push({
    id,
    pristine: `${pv.length > 0 ? 1 : 0} → ${pp.needsModel.length > 0 ? 1 : 0}`,
    overrun: `${before}/${cases} → ${after}/${cases}`,
  });
}

const pct = (before, after) => (before === 0 ? "n/a" : `${Math.round(((before - after) / before) * 100)} %`);

console.log("\nrepair MODEL CALLS over test-llm/samples (before → after)\n");
for (const r of rows) {
  if (r.note) {
    console.log(`  ${r.id.padEnd(20)} ${r.note}`);
    continue;
  }
  console.log(`  ${r.id.padEnd(20)} pristine ${r.pristine.padEnd(10)} overrun ${r.overrun}`);
}
console.log("");
console.log(`  pristine corpus : ${pristineBefore} → ${pristineAfter} repair calls  (drop ${pct(pristineBefore, pristineAfter)})`);
console.log(`  overrun corpus  : ${overrunBefore} → ${overrunAfter} repair calls over ${overrunCases} cases  (drop ${pct(overrunBefore, overrunAfter)})`);
console.log("");
