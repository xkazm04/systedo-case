/** The accessibility budget's own shape — the half that can block on every build.
 *
 *  `tests/a11y-budget.spec.ts` asks whether a page can still be used, and asking
 *  needs a browser and a running server, so it lives in the e2e lane. What can be
 *  asserted here, on committed data with nothing running, is that the REGISTRY
 *  still describes the tree — and that is the half that rots:
 *
 *    • a budget naming a route that has been renamed or deleted checks nothing,
 *      and does it silently: the spec fails on the 404 rather than on the finding,
 *      or the route simply stops being covered while the file still looks like
 *      coverage;
 *    • a rule with no `why` is one nobody can defend later, which is how a blocking
 *      rule gets "reclassified" instead of argued with;
 *    • every rule is on a rung, and the file says which — a budget where everything
 *      is `reporting` reads exactly like one where everything blocks;
 *    • a budget that does not state its BLIND SPOTS gets read as one that has none,
 *      and this one has large ones on purpose (no contrast, no accessibility tree,
 *      no authed shell);
 *    • and the property that keeps the whole thing honest: the spec has to be
 *      READING this file, it has to still ASSERT on the blocking rules, and the
 *      e2e lane has to be running it. A budget nothing executes is a document
 *      about accessibility.
 *
 *  Rung (docs/adr/0007-gate-rung-discipline.md): BLOCKING. It passes today, so a
 *  red here is a regression this change introduced. Runs inside `npm run test:unit`
 *  → `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing, and never starts a server or a browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const CONFIG_REL = ".github/a11y-budgets.json";
const SPEC_REL = "tests/a11y-budget.spec.ts";

const config = JSON.parse(read(CONFIG_REL));
const routes = config.routes ?? [];
const rules = config.rules ?? [];

test("the budget governs a real set of routes", () => {
  assert.ok(
    routes.length >= 5,
    `${CONFIG_REL} covers ${routes.length} route(s). A budget over one favourite page answers the question for ` +
      "the page somebody was already watching."
  );
  const seen = new Set();
  for (const r of routes) {
    assert.ok(typeof r.path === "string" && r.path.startsWith("/"), `a route has no absolute \`path\`: ${r.path}`);
    assert.ok(!seen.has(r.path), `${r.path} is budgeted twice`);
    seen.add(r.path);
    assert.ok(r.label, `${r.path}: no \`label\` — a failure message has to name the page a person recognises.`);
    assert.ok(
      r.why,
      `${r.path}: say why this page's accessibility is worth measuring. A route with no reason cannot be argued ` +
        "with later, which is exactly how it gets dropped."
    );
  }
});

test("every budgeted route is a page that exists", () => {
  // The failure this catches: a page is renamed, the budget keeps its old row, and
  // the suite checks a 404 — or stops covering the page while still reading like
  // coverage. Same shape as test-unit/perf-budget.test.mjs, deliberately.
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

test("every rule declares what it looks at, why, and on which rung", () => {
  assert.ok(rules.length >= 6, `${CONFIG_REL} declares ${rules.length} rule(s) — too few to be a floor.`);
  const seen = new Set();
  for (const rule of rules) {
    assert.ok(rule.id, `${CONFIG_REL}: a rule has no \`id\`.`);
    assert.ok(!seen.has(rule.id), `${CONFIG_REL}: rule \`${rule.id}\` is declared twice.`);
    seen.add(rule.id);
    assert.ok(rule.label, `${rule.id}: no \`label\` — the annotation and the report both read it.`);
    assert.ok(
      ["blocking", "reporting"].includes(rule.enforcement),
      `${rule.id}: \`enforcement\` is ${JSON.stringify(rule.enforcement)}; it must be "blocking" or "reporting" ` +
        "(docs/adr/0007-gate-rung-discipline.md). A rule with no rung is one nobody can tell the weight of."
    );
    assert.ok(
      typeof rule.why === "string" && rule.why.length > 40,
      `${rule.id}: \`why\` must say what a user loses when this breaks. A one-word reason is how a blocking rule ` +
        "gets reclassified instead of fixed."
    );
  }
});

test("the floor is not all ratchet — some rules actually block", () => {
  // A registry where every rule is `reporting` looks identical to one where every
  // rule blocks, and is the state this file would drift into one convenient
  // reclassification at a time (rubric B3).
  const blocking = rules.filter((r) => r.enforcement === "blocking").map((r) => r.id);
  assert.ok(
    blocking.length >= 5,
    `${CONFIG_REL} has ${blocking.length} blocking rule(s). These are the invariants src/app/layout.tsx ` +
      "establishes structurally — they pass today, so they block (ADR-0007). Reclassifying one to go green is " +
      "rubric B3; fix the page instead."
  );
  // The four the root layout guarantees by construction. If one of them is ever
  // legitimately removed, this line is where the argument has to be made.
  for (const id of ["html-lang", "document-title", "main-landmark", "skip-link"]) {
    assert.ok(
      blocking.includes(id),
      `${CONFIG_REL}: \`${id}\` is no longer blocking. src/app/layout.tsx establishes it for every route, so ` +
        "there is no page in this tree it could legitimately fail on."
    );
  }
});

test("the ratchet is declared, even before anything has measured it", () => {
  // Same honesty rule as .github/perf-budgets.json, .github/docs-staleness.json and
  // .github/typecheck-strict.json: null means "nothing has run this yet", and an
  // ABSENT key means nobody decided. Only one of those is waiting for a command.
  assert.ok(
    Object.prototype.hasOwnProperty.call(config, "baseline"),
    `${CONFIG_REL} declares no \`baseline\`. null is the honest value until a run has counted what these pages ` +
      "actually hold; missing says nobody made the call."
  );
  assert.ok(
    Array.isArray(config.notCovered) && config.notCovered.length >= 4,
    `${CONFIG_REL} must say what it does NOT see — contrast, the accessibility tree, motion, the authed shell. ` +
      "An accessibility gate that does not state its blind spots gets read as one that has none."
  );
  const m = config.metric ?? {};
  assert.ok(m.what, `${CONFIG_REL}: \`metric.what\` must say WHICH document is queried.`);
  assert.ok(m.why, `${CONFIG_REL}: \`metric.why\` must say why that is the right moment to query it.`);
});

test("the spec reads this file — a budget nothing executes is an essay about accessibility", () => {
  assert.ok(existsSync(join(ROOT, SPEC_REL)), `${SPEC_REL} is gone, so nothing checks the rules in ${CONFIG_REL}.`);
  const spec = read(SPEC_REL);
  assert.ok(
    spec.includes(CONFIG_REL),
    `${SPEC_REL} no longer reads ${CONFIG_REL}. A spec with its rules inlined is one an agent can soften without ` +
      "the reviewer ever seeing a budget change."
  );
  assert.match(
    spec,
    /blocking\(f\.rule\)/,
    `${SPEC_REL} no longer splits findings by the rung the registry declares, so a blocking rule would be ` +
      "reported rather than enforced."
  );
  assert.match(
    spec,
    /\.toEqual\(\[\]\)/,
    `${SPEC_REL} no longer asserts that the blocking findings are empty — the budget is being printed rather ` +
      "than enforced."
  );
  // Every rule in the registry has to be something the spec actually looks for.
  // A rule nobody evaluates is a line of policy with no instrument behind it.
  const unevaluated = rules.map((r) => r.id).filter((id) => !spec.includes(`"${id}"`));
  assert.deepEqual(
    unevaluated,
    [],
    `${CONFIG_REL} declares rule(s) ${unevaluated.join(", ")} that ${SPEC_REL} never evaluates. A rule nothing ` +
      "measures is policy with no instrument behind it."
  );
});

test("the lane that runs the spec is the one that can stop a change", () => {
  // The e2e job is enumerated in .github/required-checks.json, so a broken
  // invariant fails a check that may stop a change rather than a job nobody reads.
  const ci = read(".github/workflows/ci.yml");
  assert.match(
    ci,
    /npm run test:e2e/,
    ".github/workflows/ci.yml no longer runs the Playwright suite, so the accessibility budget runs nowhere."
  );
  const required = JSON.parse(read(".github/required-checks.json")).required ?? [];
  assert.ok(
    required.some((r) => r.workflow === "ci.yml" && r.job === "e2e-smoke"),
    ".github/required-checks.json no longer names the e2e job as a check that may stop a change — the budget " +
      "still measures, but nothing it finds would refuse anything."
  );
});

test("the invariants the layout guarantees are still in the layout", () => {
  // The blocking rules are blocking BECAUSE src/app/layout.tsx establishes them for
  // every route. If that stops being true, the right answer is to argue about the
  // rung — not to discover it from a red e2e run on a shared runner.
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<html\s[^>]*lang=/s, "src/app/layout.tsx no longer sets `lang` on <html> — `html-lang` was blocking because it did.");
  assert.match(layout, /<main\s+id="obsah"/, "src/app/layout.tsx no longer renders <main id=\"obsah\"> — `main-landmark` and `skip-link` were blocking because it did.");
  assert.match(layout, /href="#obsah"/, "src/app/layout.tsx no longer renders the skip link — `skip-link` was blocking because it did.");
  assert.doesNotMatch(
    layout,
    /userScalable|maximumScale/,
    "src/app/layout.tsx's `viewport` export now constrains zoom. `viewport-zoom` is blocking precisely because " +
      "nothing here did — make the case for it, do not let the e2e lane discover it."
  );
});
