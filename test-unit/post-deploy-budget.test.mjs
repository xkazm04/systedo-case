/** The post-deploy budget's own shape — the half that can block on every build.
 *
 *  `.github/perf-budgets.json` is the number that stops a change BEFORE it merges.
 *  This is the neighbouring one and the one this repository did not have: a number
 *  that goes red AFTER it, on the deployment, because `master` ships on push and the
 *  push IS the release. Until it existed, the only post-merge signal was
 *  `/api/health` answering `ok: true` — which it does for a release whose homepage
 *  500s and for one that made every page four times slower, since the probe never
 *  asks either question.
 *
 *  Measuring needs a live deployment, a secret and a network, so the measurement
 *  lives in `.github/workflows/post-deploy.yml`. What can be asserted here, on
 *  committed data with nothing running, is that the REGISTRY still describes the
 *  tree and that something still reads it — which is the half that rots:
 *
 *    • a budget naming a route that has been renamed or deleted does not measure
 *      nothing, it FAILS A RELEASE, and it fails it about the list rather than about
 *      the deploy. That is the worst failure mode available to a check that runs
 *      after the merge, so it is the first thing asserted;
 *    • a ceiling with no reason is a number nobody can argue with later, which is how
 *      it gets "adjusted" by the release it was about to refuse;
 *    • a ceiling wide enough to admit anything is the same as no budget, and one
 *      tight enough to fail on a cold serverless start is worse than none — it
 *      teaches an operator that a red release is noise, and the next real one reads
 *      identically;
 *    • and the property that keeps the whole thing honest: the verifier has to be
 *      READING this file, and the release workflow has to be running the verifier. A
 *      budget nothing executes is a document about latency.
 *
 *  WHAT THIS DELIBERATELY DOES NOT ASSERT: that a breach reverts anything. It does
 *  not, on purpose — an automatic revert means a token that can write
 *  `refs/heads/master`, which AGENTS.md § Red refuses, and the verify job holds
 *  `contents: read`. The budget produces the dated automatic answer the rehearsed
 *  rollback (`npm run revert:drill`, docs/runbooks/revert-drill.md) was always
 *  waiting on; arming the revert leg stays a decision an operator makes with a token.
 *
 *  Rung (docs/adr/0007-gate-rung-discipline.md): BLOCKING for the registry's shape.
 *  It passes today, so a red here is a regression this change introduced. Runs inside
 *  `npm run test:unit` → `npm run check:ci` → `.husky/pre-push`. The MEASUREMENT is a
 *  different rung and a different machine: it fails the post-deploy run, which is not
 *  a pre-merge gate and cannot be, because the thing it measures does not exist until
 *  the merge has happened.
 *
 *  Pure — reads files, runs nothing, and never opens a socket.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const CONFIG_REL = ".github/post-deploy-budgets.json";
const VERIFIER_REL = "scripts/post-deploy-verify.mjs";
const WORKFLOW_REL = ".github/workflows/post-deploy.yml";

const config = JSON.parse(read(CONFIG_REL));
const routes = config.routes ?? [];
/** The probe is budgeted the same way and by the same code, so it is held to the
 *  same rules — it is the only measured route that touches the store. */
const entries = [...routes, ...(config.probe ? [{ ...config.probe, label: config.probe.label ?? "Health probe" }] : [])];

test("the budget governs a real, non-duplicated set of routes", () => {
  assert.ok(
    routes.length >= 3,
    `${CONFIG_REL} budgets ${routes.length} public route(s). Fewer than three answers the question for whichever ` +
      "page somebody was already watching, which is the page least likely to regress unnoticed."
  );
  const seen = new Set();
  for (const r of entries) {
    assert.ok(typeof r.path === "string" && r.path.startsWith("/"), `a budget entry has no absolute \`path\`: ${r.path}`);
    assert.ok(!seen.has(r.path), `${r.path} is budgeted twice`);
    seen.add(r.path);
    assert.ok(r.label, `${r.path}: no \`label\` — the failure lands in front of an operator mid-release, and it has to name something they recognise.`);
    assert.ok(
      r.why,
      `${r.path}: say why this route's cost matters. A ceiling with no reason cannot be argued with at 2am, which ` +
        "is exactly when it gets raised instead."
    );
  }
});

test("every budgeted page exists, because a stale row fails a RELEASE", () => {
  // The sharpest edge on this file. `.github/perf-budgets.json` naming a deleted
  // route wastes an e2e run; the same mistake here turns a healthy release red and
  // sends somebody to the rollback runbook for a page that was renamed six weeks
  // ago. So the rows are held to `src/app` on every build, before they can.
  const missing = [];
  for (const r of routes) {
    const path = r.path.split("?")[0].replace(/\/+$/, "");
    const page = path === "" ? "src/app/page.tsx" : `src/app${path}/page.tsx`;
    if (!existsSync(join(ROOT, page))) missing.push(`${r.path} → ${page}`);
  }
  assert.deepEqual(
    missing,
    [],
    `${CONFIG_REL} budgets ${missing.length} route(s) with no page behind them: ${missing.join(", ")}. On this ` +
      "registry that is not a gap in coverage, it is a false alarm during a release — re-point the row or drop it."
  );

  if (config.probe) {
    const handler = `src/app/api${config.probe.path.replace(/^\/api/, "")}/route.ts`;
    assert.ok(
      existsSync(join(ROOT, handler)),
      `${CONFIG_REL} § probe budgets ${config.probe.path}, and ${handler} does not exist.`
    );
  }
});

test("every budgeted route is one an anonymous prober can actually reach", () => {
  // The verifier sends no session cookie. A budgeted page that needs one would
  // answer a redirect or a 401 on every release — a permanent red about the list.
  // Everything under /app is per-project and authed by construction (ADR-0002).
  const authed = routes.filter((r) => r.path === "/app" || r.path.startsWith("/app/"));
  assert.deepEqual(
    authed.map((r) => r.path),
    [],
    "budgeted route(s) under /app, which need a session the prober does not have and will not be given " +
      "(AGENTS.md § Red — never move a credential). /dashboard renders the same composition for the anonymous " +
      "sample tenant and is the proxy this budget uses instead."
  );
});

test("a ceiling is a number somebody could defend, in both directions", () => {
  // Two failures with one shape, and the range is wider than the e2e budget's on
  // purpose: this measures a real deployment over the public internet, where a cold
  // serverless invocation and a round trip are part of the honest cost. Too tight
  // and a release goes red for the platform; too loose and it is decoration.
  for (const r of entries) {
    assert.equal(typeof r.budgetMs, "number", `${r.path}: \`budgetMs\` must be a number of milliseconds.`);
    assert.ok(
      Number.isInteger(r.budgetMs) && r.budgetMs >= 1000 && r.budgetMs <= 15_000,
      `${r.path}: a ${r.budgetMs} ms ceiling is outside the defensible range (1000–15000 ms). Below it a release ` +
        "goes red for a cold start; above it the number cannot refuse anything."
    );
  }
});

test("the metric and the error ceiling are declared, not implied", () => {
  const m = config.metric ?? {};
  assert.ok(m.what, `${CONFIG_REL}: \`metric.what\` must say WHICH cost is measured — the numbers mean nothing without it.`);
  assert.ok(m.why, `${CONFIG_REL}: \`metric.why\` must say why that is the cost worth failing a release on.`);
  assert.ok(
    Number.isInteger(m.warmups) && m.warmups >= 1,
    `${CONFIG_REL}: at least one warm-up. The first request to a serverless function after a deploy is a cold ` +
      "start, which is a fact about the platform and not about this release."
  );
  assert.ok(
    Number.isInteger(m.samples) && m.samples >= 3,
    `${CONFIG_REL}: at least three samples. One measurement over the public internet is a coin toss with a ` +
      "threshold on it, and this one can send somebody to a rollback runbook."
  );
  assert.equal(
    m.statistic,
    "min",
    `${CONFIG_REL}: the compared statistic is the fastest sample — a route that is genuinely slower is slow in all ` +
      "of them, and a transient stall is not this check's finding."
  );
  assert.equal(
    m.redirect,
    "manual",
    `${CONFIG_REL}: redirects must not be followed. A 30x IS the server's answer for that URL, and following one ` +
      "silently measures a different route than the budget names."
  );

  assert.ok(
    Number.isInteger(config.errorRate?.maxFailingRoutes),
    `${CONFIG_REL}: \`errorRate.maxFailingRoutes\` must be a number. How many of these public pages may be down ` +
      "on a shipped release has an answer, and it belongs in the registry rather than hard-coded in the script."
  );
  assert.ok(config.errorRate?.why, `${CONFIG_REL}: say why that ceiling is the right one.`);
});

test("the ratchet and the blind spots are declared, even before anything has measured them", () => {
  // Same honesty rule as .github/perf-budgets.json and .github/typecheck-strict.json:
  // null means "nothing has run this against production yet, so the ceilings are
  // argued and not observed", and an ABSENT key means nobody decided.
  assert.ok(
    Object.prototype.hasOwnProperty.call(config, "baseline"),
    `${CONFIG_REL} declares no \`baseline\`. null is the honest value until a release has recorded what these ` +
      "routes actually cost; missing says nobody made the call."
  );
  assert.ok(
    Array.isArray(config.notCovered) && config.notCovered.length,
    `${CONFIG_REL} must say what it does NOT see — authed pages, real error rates, anything past the first few ` +
      "minutes. A post-deploy check that does not state its blind spots gets read as production monitoring."
  );
});

test("the verifier reads this file and fails on a breach", () => {
  const verifier = read(VERIFIER_REL);
  assert.ok(
    verifier.includes(CONFIG_REL),
    `${VERIFIER_REL} no longer reads ${CONFIG_REL}. Ceilings inlined in the script are ceilings an agent can move ` +
      "without a reviewer ever seeing a budget change."
  );
  assert.match(
    verifier,
    /result\.ms\s*>\s*Number\(entry\.budgetMs\)/,
    `${VERIFIER_REL} no longer compares a measurement against the route's ceiling, so the budget is being printed ` +
      "rather than enforced."
  );
  assert.match(
    verifier,
    /maxFailingRoutes/,
    `${VERIFIER_REL} no longer reads the error ceiling, so a public page being DOWN on a shipped release would be ` +
      "recorded and not failed."
  );
  assert.match(
    verifier,
    /problems\.push\(\.\.\.budgets\.problems\)/,
    `${VERIFIER_REL} measures the budgets without folding the breaches into the run's problems — the numbers would ` +
      "land in the verdict artifact and the job would still go green."
  );
});

test("the release event is what runs it, so the number arrives with the release", () => {
  // A post-merge signal that runs on a schedule tells you a release was bad some time
  // in the next hour. This has to fire on the same event as the deploy.
  const workflow = read(WORKFLOW_REL);
  assert.match(
    workflow,
    /node scripts\/post-deploy-verify\.mjs/,
    `${WORKFLOW_REL} no longer runs the verifier — nothing measures the release.`
  );
  assert.match(
    workflow,
    /push:\s*\n\s*branches:\s*\[master\]/,
    `${WORKFLOW_REL} no longer fires on a push to master. Vercel ships master on push, so that event IS the ` +
      "release, and it is the only one at which this measurement means anything."
  );
  // It must not gain a write token by acquiring the ability to act on its own
  // finding. .github/workflow-permissions.json is the declaration; this is the
  // sentence next to it. Comment lines are skipped for the reason every rule in
  // scripts/actions-pin.mjs skips them: this workflow's own header EXPLAINS why it
  // holds no write grant, and a sentence about a rule is not a breach of it.
  const grants = workflow
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .filter((l) => /contents:\s*write/.test(l));
  assert.deepEqual(
    grants,
    [],
    `${WORKFLOW_REL} has taken a \`contents: write\` grant. A post-deploy check that can write refs is a check ` +
      "that can revert master on its own, which AGENTS.md § Red reserves for the operator. The budget produces " +
      "the answer; a person promotes the previous deployment."
  );
});

test("a breach points at the way back out, not just at the number", () => {
  const verifier = read(VERIFIER_REL);
  assert.ok(
    verifier.includes("docs/deploy.md"),
    `${VERIFIER_REL} no longer prints where rollback is documented. A red release with no next command is a ` +
      "notification, and the rehearsal in docs/runbooks/revert-drill.md is what it is supposed to trigger."
  );
  assert.ok(
    existsSync(join(ROOT, "docs/runbooks/revert-drill.md")),
    "docs/runbooks/revert-drill.md is gone — the verifier points a failing release at a runbook that does not exist."
  );
});
