#!/usr/bin/env node
/** Does every registered LLM operation still work against a REAL provider?
 *
 *  WHY THIS EXISTS. The standing gate is static and key-free by decision: the
 *  hash-cached real-model re-prove was retired on 2026-08-05 because it cost too
 *  much to run on every change (see .github/workflows/ci.yml). What is left in
 *  `check:ci` proves the things committed data can prove — that every call site is
 *  tagged and registered, that no prompt or schema drifted from its golden, that
 *  no operation costs more than its recorded ceiling. None of that can see the one
 *  thing nobody in this repository controls: the MODEL on the other side of the
 *  chokepoint changing what it returns.
 *
 *  That change arrives without a commit. Under the retired arrangement the first
 *  thing to notice it was whoever next ran `npm run test:llm` by hand — which is
 *  to say, usually an incident. This script is the same prove on a schedule
 *  (.github/workflows/llm-drift.yml, weekly), and the point of a schedule is not
 *  the run, it is the RECORD: a dated pass/fail per operation, so a Monday triage
 *  sees a trend and can date the drift instead of discovering it.
 *
 *  HOW IT DIFFERS FROM test-llm/real.test.mjs, which stays. That suite proves the
 *  DEVELOPMENT provider — the Claude CLI on the maintainer's subscription — and
 *  asserts the Claude model ids, so it cannot run on a CI runner at all. This one
 *  is provider-agnostic: it proves whichever provider the environment configures,
 *  which on a runner with `NODE_ENV=production` and `GEMINI_API_KEY` is the
 *  provider real users are actually served by. Both go through the one chokepoint
 *  and assert the same contract:
 *
 *    • the call was answered by a real provider (`meta.demo === false`), not by
 *      the deterministic demo the wrapper falls back to;
 *    • it came from the model this tool's TIER resolves to, so a silent downgrade
 *      to a cheaper model is a failure and not a shrug;
 *    • and the parsed result still passes the tool's own validator — the shape
 *      contract, from the registry, unchanged.
 *
 *  NO PROVIDER IS NOT A FAILURE. With nothing configured the wrapper serves the
 *  demo, which is a product property (AGENTS.md § Green). Reporting that as drift
 *  would make the weekly record red for a reason that has nothing to do with the
 *  model, and a record that is always red is a record nobody reads. So the verdict
 *  is `skipped`, it says so in the trail, and the exit code stays 0.
 *
 *  AMBER: this spends money against a real provider (AGENTS.md § Amber). It is
 *  deliberately NOT in `check:ci` and never will be.
 *
 *  Usage:
 *    npm run llm:drift                       # prove, print a table
 *    npm run llm:drift -- --out verdict.json # …and write the machine-readable verdict
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  generateStructured,
  isDevEnvironment,
  CLAUDE_MODEL,
  CLAUDE_MODEL_FAST,
  GEMINI_MODEL,
  GEMINI_MODEL_FAST,
} from "../src/lib/llm/index.ts";
import { LLM_TOOLS } from "../test-llm/registry.mjs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const OUT_FILE = arg("--out");

/** Two, not three. real.test.mjs retries three times because the Claude CLI
 *  flakes on truncated output; here a retry exists to absorb one transient
 *  network error, and a provider that needs three attempts to answer IS the
 *  finding. */
const MAX_ATTEMPTS = 2;

const dev = isDevEnvironment();
const provider = dev ? "claude (development)" : "gemini (production)";

/** The model a tool must be served by, on the active provider and its own tier. */
const expectedModelFor = (tool) =>
  dev
    ? tool.tier === "fast"
      ? CLAUDE_MODEL_FAST
      : CLAUDE_MODEL
    : tool.tier === "fast"
      ? GEMINI_MODEL_FAST
      : GEMINI_MODEL;

/** The pinned model surface (test-llm/model-pins.json), carried into the verdict.
 *  This run is the only one in the repository that touches a real provider, so it
 *  is the only place a dated record can say WHICH MODEL SURFACE was proved — the
 *  fact neither the goldens nor the quality bake keep. Never fatal: a drift run
 *  must not fail because a pin file would not parse. */
function pinnedSurface() {
  try {
    const pins = JSON.parse(readFileSync(new URL("../test-llm/model-pins.json", import.meta.url), "utf8"));
    return {
      pinnedAt: pins.acceptance?.pinnedAt ?? null,
      models: Object.fromEntries((pins.pins ?? []).map((p) => [p.path, p.tag])),
    };
  } catch {
    return null;
  }
}

function write(verdict) {
  if (!OUT_FILE) return;
  try {
    writeFileSync(OUT_FILE, JSON.stringify({ ...verdict, pins: pinnedSurface() }, null, 2) + "\n");
  } catch (err) {
    console.error(`(could not write ${OUT_FILE}: ${err.message})`);
  }
}

const measuredAt = new Date().toISOString();

// In production mode the provider is Gemini and its key is the only thing that
// decides whether a real call is possible. In development the provider is a local
// CLI whose absence cannot be tested without calling it — so that case falls
// through and shows up as every tool returning the demo, which the report says in
// those words.
if (!dev && !process.env.GEMINI_API_KEY) {
  console.log("llm drift: no GEMINI_API_KEY — the wrapper would serve the demo, so there is nothing to prove.");
  console.log("           (This is a `skipped`, not a failure: degrading without keys is a product property.)");
  write({ schema: 1, status: "skipped", reason: "no provider configured", provider, measuredAt, tools: [] });
  process.exit(0);
}

console.log(`llm drift: proving ${LLM_TOOLS.length} operation(s) against ${provider}.`);
{
  const surface = pinnedSurface();
  if (surface) {
    console.log(
      `           model surface pinned ${surface.pinnedAt ?? "never"} (test-llm/model-pins.json): ` +
        Object.entries(surface.models)
          .map(([path, tag]) => `${path}=${tag}`)
          .join(", ")
    );
  }
}
console.log("");

const tools = [];

for (const tool of LLM_TOOLS) {
  const expected = expectedModelFor(tool);
  let res = null;
  let error = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await generateStructured({
        id: tool.id,
        system: tool.system,
        prompt: tool.prompt,
        schema: tool.schema,
        tier: tool.tier,
        normalize: (parsed) => parsed,
        demo: () => ({ __demo: true }),
      });
      error = null;
    } catch (err) {
      res = null;
      error = err?.message ?? String(err);
    }
    if (res && res.meta.demo === false && res.meta.model === expected && tool.validate(res.result)) break;
  }

  const demo = res ? res.meta.demo !== false : true;
  const model = res?.meta?.model ?? null;
  const valid = res && !demo ? Boolean(tool.validate(res.result)) : false;
  const ok = Boolean(res) && !demo && model === expected && valid;

  tools.push({ id: tool.id, label: tool.label, ok, demo, model, expected, valid, error });

  const why = ok
    ? "ok"
    : error
      ? `error: ${error}`
      : demo
        ? "fell back to the demo — no real provider answered"
        : model !== expected
          ? `served by ${model}, expected ${expected}`
          : "the result no longer passes the tool's validator";
  console.log(`  ${ok ? "✓" : "✗"} ${tool.id}${ok ? "" : `  — ${why}`}`);
}

const failed = tools.filter((t) => !t.ok);
const allDemo = tools.length > 0 && tools.every((t) => t.demo);

console.log("");

// Every single operation on the demo means the provider never answered at all —
// a missing CLI, a revoked key, an outage. That is worth recording and it is not
// "the model's output drifted", so it is not counted as a failure.
if (allDemo) {
  console.log("llm drift: every operation fell back to the demo — no provider answered. Nothing was proved.");
  write({ schema: 1, status: "skipped", reason: "no provider answered", provider, measuredAt, tools });
  process.exit(0);
}

const status = failed.length ? "fail" : "pass";
write({ schema: 1, status, provider, measuredAt, total: tools.length, failed: failed.length, tools });

if (failed.length) {
  console.log(`✗ llm drift: ${failed.length} of ${tools.length} operation(s) no longer hold against ${provider}.`);
  console.log("");
  console.log("  This is the failure mode the static gate cannot see: nothing in this repository changed.");
  console.log("  Read the rows above, then:");
  console.log("    npm run test:llm            # the same prove against the development provider");
  console.log("    npm run llm:quality         # is it worse, or just different? (spends money)");
  console.log("  A shape that moved for good is a golden to accept ON PURPOSE:");
  console.log('    npm run llm:eval:update -- --reason "provider X changed <what> on <date>"');
  process.exit(1);
}

console.log(`✓ llm drift: all ${tools.length} operation(s) still answer in shape, on their own tier, via ${provider}.`);
process.exit(0);
