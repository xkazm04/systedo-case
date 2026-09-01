/** The performance budget's own shape — the half that can block on every build.
 *
 *  `tests/perf-budget.spec.ts` measures what a route costs, and measuring needs a
 *  browser and a running server, so it lives in the e2e lane. What can be asserted
 *  here, on committed data with nothing running, is that the REGISTRY still
 *  describes the tree — and that is the half that rots:
 *
 *    • a budget naming a route that has been renamed or deleted measures nothing,
 *      and does it silently: the spec would fail on the 404 rather than on the
 *      number, or the route simply stops being covered and the file still looks
 *      like a budget;
 *    • a budget with no reason is a number nobody can defend later, which is how a
 *      ceiling gets "adjusted" instead of argued with;
 *    • a ceiling wide enough to admit anything is the same as no budget, and one
 *      tight enough to fail on a runner stall is worse than none — it teaches
 *      whoever is waiting to re-run the build;
 *    • and the property that keeps the whole thing honest: the spec has to be
 *      READING this file, and the e2e lane has to be running the spec. A budget
 *      nothing executes is a document about performance.
 *
 *  Rung (docs/adr/0007-gate-rung-discipline.md): BLOCKING. It passes today, so a
 *  red here is a regression this change introduced. Runs inside `npm run test:unit`
 *  → `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing, and never starts a server.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const CONFIG_REL = ".github/perf-budgets.json";
const SPEC_REL = "tests/perf-budget.spec.ts";

const config = JSON.parse(read(CONFIG_REL));
const routes = config.routes ?? [];

test("the budget governs a real set of routes", () => {
  assert.ok(
    routes.length >= 5,
    `${CONFIG_REL} budgets ${routes.length} route(s). A budget over one favourite page answers the cost question ` +
      "for the page somebody was already watching."
  );
  const seen = new Set();
  for (const r of routes) {
    assert.ok(typeof r.path === "string" && r.path.startsWith("/"), `a route has no absolute \`path\`: ${r.path}`);
    assert.ok(!seen.has(r.path), `${r.path} is budgeted twice`);
    seen.add(r.path);
    assert.ok(r.label, `${r.path}: no \`label\` — the failure message has to name the page a person recognises.`);
    assert.ok(
      r.why,
      `${r.path}: say why this route's cost matters. A ceiling with no reason cannot be argued with later, which ` +
        "is exactly how it gets raised instead."
    );
  }
});

test("every budgeted route is a page that exists", () => {
  // The failure this catches: a page is renamed, the budget keeps its old row, and
  // the suite measures a 404 — or measures nothing at all, while the file still
  // reads like coverage.
  const missing = [];
  for (const r of routes) {
    const path = r.path.split("?")[0].replace(/\/+$/, "");
    const page = path === "" ? "src/app/page.tsx" : `src/app${path}/page.tsx`;
    if (!existsSync(join(ROOT, page))) missing.push(`${r.path} → ${page}`);
  }
  assert.deepEqual(
    missing,
    [],
    `${CONFIG_REL} budgets ${missing.length} route(s) with no page behind them: ${missing.join(", ")}. Re-point ` +
      "the row at where the route went, or drop it and say what now covers that surface."
  );
});

test("a ceiling is a number somebody could defend, in both directions", () => {
  // Two failures with one shape. A ceiling in the tens of seconds admits anything
  // and is a budget in name only; a ceiling in the low hundreds of milliseconds
  // fails on a shared runner's stall, and a perf gate that fails at random stops
  // being read long before it stops running.
  for (const r of routes) {
    assert.equal(typeof r.budgetMs, "number", `${r.path}: \`budgetMs\` must be a number of milliseconds.`);
    assert.ok(
      Number.isInteger(r.budgetMs) && r.budgetMs >= 500 && r.budgetMs <= 10_000,
      `${r.path}: a ${r.budgetMs} ms ceiling is outside the defensible range (500–10000 ms). Below it the gate ` +
        "fails on runner noise; above it the gate is decoration."
    );
  }
});

test("the metric is declared, so a number can be compared with the next one", () => {
  const m = config.metric ?? {};
  assert.ok(m.what, `${CONFIG_REL}: \`metric.what\` must say WHICH cost is measured — the numbers mean nothing without it.`);
  assert.ok(m.why, `${CONFIG_REL}: \`metric.why\` must say why that is the cost worth gating on.`);
  assert.ok(
    Number.isInteger(m.warmups) && m.warmups >= 1,
    `${CONFIG_REL}: at least one warm-up navigation. The first hit on a route in \`next dev\` compiles it, which ` +
      "is a fact about the bundler and not about the page."
  );
  assert.ok(
    Number.isInteger(m.samples) && m.samples >= 3,
    `${CONFIG_REL}: at least three samples. One measurement on a shared runner is a coin toss with a threshold on it.`
  );
  assert.equal(
    m.statistic,
    "min",
    `${CONFIG_REL}: the compared statistic is the fastest sample. A route that is genuinely slower is slow in ` +
      "every sample; a runner that stalled is not."
  );
});

test("the ratchet is declared, even before anything has measured it", () => {
  // Same honesty rule as .github/docs-staleness.json and .github/typecheck-strict.json:
  // null means "nothing has run this yet, so the ceilings are argued and not observed",
  // and an ABSENT key means nobody decided. Only one of those is waiting for a command.
  assert.ok(
    Object.prototype.hasOwnProperty.call(config, "baseline"),
    `${CONFIG_REL} declares no \`baseline\`. null is the honest value until a run has recorded what these routes ` +
      "actually cost; missing says nobody made the call."
  );
  assert.ok(
    Array.isArray(config.notCovered) && config.notCovered.length,
    `${CONFIG_REL} must say what the budget does NOT see (bundle size, load, production). A perf gate that does ` +
      "not state its blind spots gets read as one that has none."
  );
});

test("the spec reads this file — a budget nothing executes is an essay about performance", () => {
  assert.ok(existsSync(join(ROOT, SPEC_REL)), `${SPEC_REL} is gone, so nothing measures the ceilings in ${CONFIG_REL}.`);
  const spec = read(SPEC_REL);
  assert.ok(
    spec.includes(CONFIG_REL),
    `${SPEC_REL} no longer reads ${CONFIG_REL}. A spec with its ceilings inlined is one an agent can edit without ` +
      "the reviewer ever seeing a budget change."
  );
  assert.match(
    spec,
    /toBeLessThanOrEqual\(route\.budgetMs\)/,
    `${SPEC_REL} no longer compares the measurement against the route's ceiling, so the budget is being printed ` +
      "rather than enforced."
  );
});

test("the lane that runs the spec is the one that can stop a change", () => {
  // The e2e job is enumerated in .github/required-checks.json, so a route over its
  // ceiling fails a check that may stop a change rather than a job nobody reads.
  const ci = read(".github/workflows/ci.yml");
  assert.match(
    ci,
    /npm run test:e2e/,
    ".github/workflows/ci.yml no longer runs the Playwright suite, so the performance budget is measured nowhere."
  );
  const required = JSON.parse(read(".github/required-checks.json")).required ?? [];
  assert.ok(
    required.some((r) => r.workflow === "ci.yml" && r.job === "e2e-smoke"),
    ".github/required-checks.json no longer names the e2e job as a check that may stop a change — the budget " +
      "still measures, but nothing it finds would refuse anything."
  );
});
