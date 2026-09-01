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
 */
import { writeFileSync, appendFileSync } from "node:fs";

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

/** The runbook's own next command, printed next to a failure rather than linked
 *  to. docs/deploy.md § Deploy + rollback is canonical: rollback here is promoting
 *  the previous deployment, NOT a git revert under pressure. */
const NEXT_STEPS = [
  "Rollback is PROMOTE THE PREVIOUS DEPLOYMENT (docs/deploy.md § Deploy + rollback),",
  "not a git revert under pressure — promotion is atomic and takes the alias with it.",
  "The repository leg, once the alias is safe: git revert --no-edit <sha> && push.",
  "The rehearsal, and what each layer costs: docs/runbooks/revert-drill.md.",
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

  const verdict = {
    schema: 1,
    status: problems.length ? "failed" : "healthy",
    at,
    sha,
    url,
    attempts,
    problems,
    // Reported, never asserted: real signals about the deployment that are not
    // signals about THIS release.
    reported: body
      ? { dbMode: body.dbMode ?? null, cronsStale: body.cronsStale ?? null, firestoreReachable: body.firestoreReachable ?? null }
      : null,
  };
  record(verdict);

  if (!problems.length) {
    say("");
    say(`post-deploy: the release answers — ok, dbMode ${body?.dbMode ?? "?"}.`);
    summary("### Post-deploy verification — healthy");
    summary("");
    summary(`\`/api/health\` answered clean after ${attempts.length} attempt(s).`);
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
