#!/usr/bin/env node
/** Does the release that just shipped actually answer? (zero-dependency)
 *
 *  THE GAP THIS CLOSES. Vercel ships `master` on push, so the push is the release
 *  act, and everything this repository does about a bad change happens BEFORE it:
 *  fifteen gates, a rubric review, and `.husky/pre-push` running the whole chain
 *  because a required status check never sees this landing path. Past the push,
 *  nothing. The way back OUT is documented and drilled — `npm run revert:drill`
 *  runs weekly and times which layer catches a seeded fault — but a rehearsed
 *  recovery still started with a person noticing a symptom. There was no signal.
 *
 *  There was, however, already a probe: `/api/health`
 *  (src/app/api/health/route.ts) returns the readiness matrix as booleans plus a
 *  real 1-doc Firestore liveness read, behind the same constant-time `CRON_SECRET`
 *  guard as the crons, and its own header says it is safe to wire to an uptime
 *  monitor. Nothing was wiring it. This is the wire.
 *
 *  WHAT IT ASSERTS, and why only these. A post-deploy check that reports everything
 *  is a check nobody keeps, because the first amber turns it into noise. Two
 *  signals, both of which mean "this deployment is not serving" rather than
 *  "something is worth a look":
 *
 *    ok !== true                   the route itself did not come up clean.
 *    firestoreReachable === false  credentials are present and the store cannot be
 *                                  read — the failure that a config-only check
 *                                  passes and every authed page fails on.
 *
 *  Everything else the route returns (`cronsStale`, the credential matrix) is
 *  REPORTED into the verdict and the job summary and never fails the run: a cron
 *  that last ran 90 minutes ago says nothing about the deploy that happened 90
 *  seconds ago.
 *
 *  AND THEN WHETHER IT ANSWERS WELL. Liveness alone is the wrong shape for the only
 *  post-merge signal a repository has: `/api/health` returns `ok: true` for a release
 *  whose homepage 500s and for one that made every page four times slower, because it
 *  never asks either question. So after the probe comes back clean, this measures a
 *  short list of public, key-free routes against
 *  `.github/post-deploy-budgets.json` — document response, warm, best of three — and
 *  a route over its ceiling, or one that does not answer 2xx at all, FAILS the run.
 *  That is the number this repository did not have: one that goes red AFTER the merge,
 *  on the deployment, rather than one more thing to be green before it.
 *
 *  The budget file is deliberately short, generous and unmeasured (`baseline: null`) —
 *  see its own `$comment`. Every run writes what it measured into the verdict, which
 *  the workflow keeps for 90 days, so the first green release produces exactly the
 *  numbers a tighter ceiling needs.
 *
 *  IT DOES NOT REVERT, and that is a decision rather than an omission. Reverting
 *  automatically means a token that can write `refs/heads/master` on a repository
 *  where that push IS a release under the operator's name (AGENTS.md § Red). This
 *  runs with `contents: read`. What it produces is the input the rehearsed rollback
 *  was always waiting for — an automatic, dated answer, with the runbook's own next
 *  command printed next to it.
 *
 *  DEGRADATION IS DECLARED, NOT SILENT. Without `CRON_SECRET` or the deployment URL
 *  it records `status: "skipped"` with the reason and exits 0 — never a green it did
 *  not earn. The capability `post-deploy-verify` in scripts/harness-degradation.mjs
 *  declares that, and `npm run harness:degradation:check` (blocking, inside
 *  test:unit → check:ci) fails if this file stops recording it.
 *
 *  Usage:
 *    node scripts/post-deploy-verify.mjs [--out FILE] [--summary FILE]
 *                                        [--url URL] [--attempts N] [--delay MS]
 *                                        [--budgets FILE] [--no-budgets]
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
};

const OUT = flag("--out");
const SUMMARY = flag("--summary");

/** Vercel builds and promotes in roughly a minute; ten tries thirty seconds apart
 *  covers five, which is long enough for a slow build and short enough that the
 *  answer arrives while the person who pushed is still there. */
const ATTEMPTS = Number(flag("--attempts") ?? 10);
const DELAY_MS = Number(flag("--delay") ?? 30_000);
const REQUEST_TIMEOUT_MS = 15_000;

const BASE = (flag("--url") ?? process.env.ADAMANT_HEALTH_URL ?? "").trim().replace(/\/+$/, "");
const SECRET = (process.env.CRON_SECRET ?? "").trim();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUDGETS_REL = ".github/post-deploy-budgets.json";
const BUDGETS_FILE = flag("--budgets") ?? join(ROOT, ...BUDGETS_REL.split("/"));
/** The escape hatch is for the OPERATOR probing a preview by hand, never for a
 *  release: a run that skips the budgets says so in the verdict rather than
 *  recording a `healthy` it did not measure. */
const NO_BUDGETS = argv.includes("--no-budgets");

/** The runbook's own next command, printed next to a failure rather than linked
 *  to. docs/deploy.md § Deploy + rollback is canonical: rollback here is promoting
 *  the previous deployment, NOT a git revert under pressure. */
const NEXT_STEPS = [
  "Rollback is PROMOTE THE PREVIOUS DEPLOYMENT (docs/deploy.md § Deploy + rollback),",
  "not a git revert under pressure — promotion is atomic and takes the alias with it.",
  "The repository leg, once the alias is safe: git revert --no-edit <sha> && push.",
  "The rehearsal, and what each layer costs: docs/runbooks/revert-drill.md.",
  "If the failure is a BUDGET: the ceiling and the reason it earns one are in",
  ".github/post-deploy-budgets.json. Raising it to make this release pass is rubric B3 —",
  "the release got slower, and the number saying so is the only one there is post-merge.",
];

const say = (line = "") => console.log(line);
const summary = (text) => {
  if (!SUMMARY) return;
  try {
    appendFileSync(SUMMARY, `${text}\n`);
  } catch (err) {
    console.error(`(could not write ${SUMMARY}: ${err.message})`);
  }
};

/** The verdict outlives the run; `if-no-files-found: ignore` in the workflow means
 *  a write failure costs the artifact, never the check. */
function record(verdict) {
  if (!OUT) return;
  try {
    writeFileSync(OUT, `${JSON.stringify(verdict, null, 2)}\n`);
  } catch (err) {
    console.error(`(could not write ${OUT}: ${err.message})`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One probe. Never throws: every failure is a described outcome, because a
 *  post-deploy check that dies on a DNS blip has told the operator nothing. */
async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${SECRET}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401) {
      return { kind: "unauthorized", status: 401 };
    }
    if (!res.ok) {
      return { kind: "http", status: res.status };
    }
    try {
      return { kind: "body", status: res.status, body: await res.json() };
    } catch (err) {
      return { kind: "unparseable", status: res.status, detail: err.message };
    }
  } catch (err) {
    return { kind: "unreachable", detail: err.name === "AbortError" ? "timed out" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** One timed request for the document response — the server committing its answer.
 *
 *  `redirect: "manual"` on purpose: a 30x IS the server's answer for that URL, and
 *  following it would silently measure a different route than the budget names. The
 *  body is drained so the clock covers the response actually arriving rather than
 *  the headers alone, and never throws — a failure is a described outcome, because
 *  a budget that dies on a DNS blip has told the operator nothing.
 */
async function timedGet(url, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", cache: "no-store", headers, signal: controller.signal });
    await res.arrayBuffer().catch(() => null);
    return { ok: res.status < 400, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      status: null,
      ms: Date.now() - started,
      detail: err.name === "AbortError" ? "timed out" : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Measure one route: throw away the warm-ups (a serverless function's first
 *  invocation after a deploy is a cold start, which is a fact about the platform),
 *  keep the rest, and compare the best of them. Best-of-N rather than the mean is
 *  the same trade `.github/perf-budgets.json` makes: less sensitive, and it does not
 *  teach anyone to re-run a red release. */
async function measureRoute(url, metric, headers = {}) {
  const timeoutMs = Number(metric.timeoutMs ?? 15_000);
  const bust = () => (metric.cacheBusting ? `${url}${url.includes("?") ? "&" : "?"}_pd=${Date.now()}` : url);

  for (let i = 0; i < Number(metric.warmups ?? 1); i += 1) await timedGet(bust(), timeoutMs, headers);

  const samples = [];
  for (let i = 0; i < Math.max(1, Number(metric.samples ?? 3)); i += 1) {
    samples.push(await timedGet(bust(), timeoutMs, headers));
  }

  const answered = samples.filter((s) => s.ok);
  return {
    samples: samples.map((s) => ({ status: s.status, ms: s.ms, ...(s.detail ? { detail: s.detail } : {}) })),
    // `null` when nothing answered — a route that is DOWN has no meaningful timing,
    // and reporting its timeout as a duration would read as "slow" when it is "off".
    ms: answered.length ? Math.min(...answered.map((s) => s.ms)) : null,
    answered: answered.length,
    status: samples.at(-1)?.status ?? null,
    detail: samples.find((s) => s.detail)?.detail ?? null,
  };
}

/** The budgets, measured. Returns `{ status, problems, measurements }`; `status` is
 *  `skipped` when the file is absent or the run opted out, which is recorded rather
 *  than counted as a pass. */
async function runBudgets(base) {
  if (NO_BUDGETS) return { status: "skipped", reason: "--no-budgets", problems: [], measurements: [] };
  if (!existsSync(BUDGETS_FILE)) {
    return {
      status: "skipped",
      reason: `${BUDGETS_REL} is missing — nothing measured the release's cost.`,
      problems: [],
      measurements: [],
    };
  }

  let budgets;
  try {
    budgets = JSON.parse(readFileSync(BUDGETS_FILE, "utf8"));
  } catch (err) {
    // A malformed budget file is a problem, not a skip: it is the difference between
    // "we chose not to measure" and "we thought we were measuring".
    return {
      status: "failed",
      problems: [`${BUDGETS_REL} is not parseable JSON — ${err.message}. The release shipped unmeasured.`],
      measurements: [],
    };
  }

  const metric = budgets.metric ?? {};
  // The public routes are timed exactly as a visitor sees them — no cookie, no
  // token, `redirect: "manual"` — because that is the request whose cost this
  // repository is answerable for. The PROBE is the one exception: `/api/health` is
  // behind the constant-time CRON_SECRET guard, so timing it without the bearer
  // would measure a 401 and report the release as down on every deploy.
  const entries = [
    ...(Array.isArray(budgets.routes) ? budgets.routes : []).map((r) => ({ ...r, authorized: false })),
    ...(budgets.probe
      ? [{ ...budgets.probe, label: budgets.probe.label ?? "Health probe", authorized: true }]
      : []),
  ];

  const problems = [];
  const measurements = [];
  let failingRoutes = 0;

  for (const entry of entries) {
    const url = `${base}${entry.path}`;
    const result = await measureRoute(url, metric, entry.authorized ? { authorization: `Bearer ${SECRET}` } : {});
    const overBudget = result.ms !== null && result.ms > Number(entry.budgetMs);
    const down = result.answered === 0;
    measurements.push({
      path: entry.path,
      label: entry.label ?? entry.path,
      budgetMs: Number(entry.budgetMs),
      ms: result.ms,
      answered: result.answered,
      samples: result.samples,
      verdict: down ? "down" : overBudget ? "over" : "ok",
    });

    if (down) {
      failingRoutes += 1;
      problems.push(
        `${entry.path} did not answer on this release (last status ${result.status ?? "none"}` +
          `${result.detail ? `, ${result.detail}` : ""}). It is a public, key-free page — this is not slow, it is down.`
      );
      say(`  ✗ ${entry.path.padEnd(16)} DOWN`);
      continue;
    }
    if (overBudget) {
      problems.push(
        `${entry.path} answered in ${result.ms} ms, over its ${entry.budgetMs} ms ceiling (${entry.label ?? entry.path}). ` +
          `${entry.why ?? ""}`.trim()
      );
      say(`  ✗ ${entry.path.padEnd(16)} ${result.ms} ms  (ceiling ${entry.budgetMs} ms)`);
      continue;
    }
    say(`  ✓ ${entry.path.padEnd(16)} ${result.ms} ms  (ceiling ${entry.budgetMs} ms)`);
  }

  const maxFailing = Number(budgets.errorRate?.maxFailingRoutes ?? 0);
  if (failingRoutes > maxFailing) {
    problems.push(
      `${failingRoutes} budgeted route(s) did not answer; the ceiling is ${maxFailing} ` +
        `(.github/post-deploy-budgets.json § errorRate).`
    );
  }

  return { status: problems.length ? "failed" : "passed", problems, measurements };
}

async function main() {
  const at = new Date().toISOString();
  const sha = process.env.GITHUB_SHA ?? null;

  if (!BASE || !SECRET) {
    const missing = [!BASE && "vars.ADAMANT_HEALTH_URL", !SECRET && "secrets.CRON_SECRET"].filter(Boolean);
    const reason = `${missing.join(" and ")} not configured — the release was not verified.`;
    record({ schema: 1, status: "skipped", at, sha, reason, missing });
    say(`::warning title=Post-deploy verification did not run::${reason}`);
    say("");
    say("  Nothing checked whether this release answers. That is not a failure and it is not a pass:");
    say("  set the deployment URL in the repository variable ADAMANT_HEALTH_URL and CRON_SECRET as a");
    say("  repository secret, and this workflow starts asking /api/health on every release.");
    summary("### Post-deploy verification — SKIPPED");
    summary("");
    summary(`${reason} The release shipped unverified.`);
    return 0;
  }

  const url = `${BASE}/api/health`;
  say(`post-deploy: probing ${url} — up to ${ATTEMPTS} attempts, ${DELAY_MS / 1000}s apart.`);

  const attempts = [];
  let last = null;
  for (let n = 1; n <= ATTEMPTS; n += 1) {
    last = await probe(url);
    attempts.push({ n, kind: last.kind, status: last.status ?? null });
    say(`  attempt ${n}/${ATTEMPTS}: ${last.kind}${last.status ? ` (${last.status})` : ""}`);

    // A 401 is not a deployment that has not come up yet — it is the wrong secret,
    // and retrying nine more times only delays saying so.
    if (last.kind === "unauthorized") break;
    if (last.kind === "body") break;
    if (n < ATTEMPTS) await sleep(DELAY_MS);
  }

  const problems = [];
  let body = null;

  if (last?.kind === "body") {
    body = last.body ?? {};
    if (body.ok !== true) problems.push("/api/health did not report `ok: true`.");
    if (body.firestoreReachable === false) {
      problems.push(
        "credentials are present and Firestore could not be read (`firestoreReachable: false`) — every " +
          "authed page fails on this while a config-only check passes."
      );
    }
  } else if (last?.kind === "unauthorized") {
    problems.push(
      "/api/health answered 401: the CRON_SECRET this workflow holds is not the one the deployment has. " +
        "The six crons are guarded by the same value, so this is also a cron outage."
    );
  } else {
    problems.push(
      `/api/health never answered after ${ATTEMPTS} attempts (last: ${last?.kind}${
        last?.detail ? ` — ${last.detail}` : ""
      }).`
    );
  }

  // The budgets, once the deployment has proved it is answering at all. A release
  // that never came up has nothing to time, and timing a timeout would report
  // "slow" for something that is off.
  let budgets = { status: "skipped", reason: "the deployment never answered, so nothing was timed.", problems: [], measurements: [] };
  if (last?.kind === "body") {
    say("");
    say(`post-deploy: measuring ${BUDGETS_REL} against ${BASE}`);
    budgets = await runBudgets(BASE);
    problems.push(...budgets.problems);
  }

  const verdict = {
    schema: 1,
    status: problems.length ? "failed" : "healthy",
    at,
    sha,
    url,
    attempts,
    problems,
    // The measurements outlive the run whether or not they breached. `baseline` in
    // the budget file is null on purpose, and these are the numbers that make it
    // possible to replace it with something measured.
    budgets: {
      status: budgets.status,
      ...(budgets.reason ? { reason: budgets.reason } : {}),
      measurements: budgets.measurements,
    },
    // Reported, never asserted: real signals about the deployment that are not
    // signals about THIS release.
    reported: body
      ? { dbMode: body.dbMode ?? null, cronsStale: body.cronsStale ?? null, firestoreReachable: body.firestoreReachable ?? null }
      : null,
  };
  record(verdict);

  const budgetTable = () => {
    if (!budgets.measurements.length) return;
    summary("");
    summary("| route | measured | ceiling | verdict |");
    summary("| --- | --- | --- | --- |");
    for (const m of budgets.measurements) {
      summary(`| \`${m.path}\` | ${m.ms === null ? "no answer" : `${m.ms} ms`} | ${m.budgetMs} ms | ${m.verdict} |`);
    }
  };

  if (!problems.length) {
    say("");
    say(`post-deploy: the release answers — ok, dbMode ${body?.dbMode ?? "?"}.`);
    summary("### Post-deploy verification — healthy");
    summary("");
    summary(`\`/api/health\` answered clean after ${attempts.length} attempt(s).`);
    if (budgets.status === "passed") {
      summary("");
      summary(`Every budgeted route answered inside its ceiling (${BUDGETS_REL}).`);
    } else if (budgets.status === "skipped") {
      say(`::warning title=Post-deploy budgets were not measured::${budgets.reason}`);
      summary("");
      summary(`Budgets were NOT measured: ${budgets.reason} The release is live and unmeasured.`);
    }
    budgetTable();
    if (Array.isArray(body?.cronsStale) && body.cronsStale.length) {
      summary("");
      summary(`Reported, not failed: crons past their schedule — ${body.cronsStale.join(", ")}.`);
    }
    return 0;
  }

  for (const p of problems) say(`::error title=Post-deploy verification failed::${p}`);
  say("");
  say("  → what to do next (`post-deploy`):");
  for (const line of NEXT_STEPS) say(`      ${line}`);
  say("");
  summary("### Post-deploy verification — FAILED");
  summary("");
  for (const p of problems) summary(`- ${p}`);
  budgetTable();
  summary("");
  for (const line of NEXT_STEPS) summary(`> ${line}`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // A verifier that crashes must still say something a human can act on.
    console.error(`post-deploy: the verifier itself failed — ${err?.stack ?? err}`);
    console.log("::error title=Post-deploy verification errored::the probe could not run; the release is unverified.");
    process.exit(1);
  }
);
