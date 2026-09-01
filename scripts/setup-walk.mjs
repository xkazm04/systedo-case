#!/usr/bin/env node
/** The documented deploy shape, FOLLOWED rather than described.
 *
 *  WHY THIS EXISTS. The docs here are deep, routed and bilingual, and `npm run
 *  docs:parity` holds the two languages to the same claims while `npm run
 *  docs:staleness` measures whether a page has been re-read since the code under it
 *  moved. Neither of them, and nothing else in this repository, has ever RUN a
 *  documented instruction. So the one document whose failure mode is silent —
 *  docs/open-source/self-hosting.md § Quick start, the page somebody follows on a
 *  machine that has never seen this app — could stop working at any commit, and the
 *  first report would be a confused newcomer rather than a red build. `npm run
 *  check:ci` proves the repository builds; it says nothing about whether the
 *  sentences that tell a stranger how to run it are still true.
 *
 *  WHAT IT WALKS, in the order the page says to:
 *
 *    A  the page still SAYS what this walks. Every command below is asserted to be
 *       present in the document verbatim first, so a doc that was rewritten fails
 *       here — loudly — instead of being silently walked from a stale copy.
 *    B  `cp .env.example .env`, the documented first step.
 *    C  `npm run build` under SELF_HOSTED=true LOCAL_DB=true with an absolute
 *       SYSTEDO_DB_FILE — the no-Docker shape the page gives on one line.
 *    D  `npm start`, then GET / until it answers. This is the assertion that matters:
 *       a Firestore-less, credential-less install actually SERVES, which is the
 *       promise the self-hosting page makes.
 *    E  `docker compose config` — the other documented shape. Its BUILD is not run
 *       here (minutes, and the runner would rebuild what C already built), so this
 *       proves the compose file still parses and still publishes the port and the
 *       data volume the page tells the reader to expect. Recorded as `skipped` with
 *       the reason when docker is not on the machine, never as a pass.
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md): REPORTING. Nothing has ever
 *  measured this, so it is not a required check and .github/workflows/setup-walk.yml
 *  carries `continue-on-error` on the walk step with the sentence that removes it.
 *  What it produces on every run is dated evidence: a row per step in the job
 *  summary and in setup-walk.json, kept as an artifact. Promote it to blocking the
 *  moment it has been seen green — that is one line in the workflow and this
 *  paragraph.
 *
 *  Usage:
 *    node scripts/setup-walk.mjs                  # walk, print, exit 1 on a failure
 *    node scripts/setup-walk.mjs --out FILE       # write the verdict as JSON
 *    node scripts/setup-walk.mjs --summary FILE   # append a markdown table
 *    node scripts/setup-walk.mjs --skip-build     # A, B and E only (a local sanity run)
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "docs/open-source/self-hosting.md";
const PORT = 3000;
const BOOT_TIMEOUT_MS = 90_000;
const BUILD_TIMEOUT_MS = 15 * 60_000;

const argv = process.argv.slice(2);
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const OUT_FILE = flagValue("--out");
const SUMMARY_FILE = flagValue("--summary");
const SKIP_BUILD = argv.includes("--skip-build");

/** The commands the document tells a reader to run. Each is asserted to be present
 *  in the page before it is walked (step A), so this list and the page cannot drift
 *  into two different sets of instructions. */
const DOCUMENTED = {
  copyEnv: "cp .env.example .env",
  compose: "docker compose up -d --build",
  noDocker: "SELF_HOSTED=true LOCAL_DB=true SYSTEDO_DB_FILE=/abs/path/systedo.db npm run build && npm start",
};

const steps = [];
const record = (id, status, detail) => {
  steps.push({ id, status, detail });
  const mark = status === "pass" ? "✓" : status === "skipped" ? "–" : "✗";
  console.log(`${mark} ${id}: ${detail}`);
};

const read = (rel) => readFileSync(join(ROOT, ...rel.split("/")), "utf8");

// --- A. the page still says what this walks ----------------------------------

let docText = "";
try {
  docText = read(DOC);
} catch {
  record("A-document", "fail", `${DOC} is missing — the page this walk follows is gone.`);
}

if (docText) {
  const absent = Object.entries(DOCUMENTED).filter(([, cmd]) => !docText.includes(cmd));
  if (absent.length > 0) {
    record(
      "A-document",
      "fail",
      `${DOC} no longer contains ${absent.map(([k]) => k).join(", ")} — the walk is following instructions the ` +
        "page has stopped giving. Update DOCUMENTED in scripts/setup-walk.mjs in the same diff that moved the page."
    );
  } else {
    record("A-document", "pass", `${DOC} still gives all ${Object.keys(DOCUMENTED).length} documented commands.`);
  }
}

// --- B. cp .env.example .env -------------------------------------------------

const ENV_PATH = join(ROOT, ".env");
if (!existsSync(join(ROOT, ".env.example"))) {
  record("B-env", "fail", "`.env.example` does not exist, so the documented first step cannot be followed at all.");
} else if (existsSync(ENV_PATH)) {
  record("B-env", "skipped", "a .env already exists here — refusing to overwrite somebody's local file.");
} else {
  copyFileSync(join(ROOT, ".env.example"), ENV_PATH);
  record("B-env", "pass", `\`${DOCUMENTED.copyEnv}\` — copied ${read(".env.example").split("\n").length} lines.`);
}

// --- C + D. build, then boot and answer --------------------------------------

/** The two values the page says to set, plus the mode flags from its one-liner.
 *  AUTH_SECRET is generated per run: this is a throwaway install, and a committed
 *  one would be a credential in the repository. */
const DB_FILE = join(ROOT, ".data", "setup-walk.db");
mkdirSync(dirname(DB_FILE), { recursive: true });
const walkEnv = {
  ...process.env,
  NODE_ENV: "production",
  SELF_HOSTED: "true",
  LOCAL_DB: "true",
  SYSTEDO_DB_FILE: DB_FILE,
  AUTH_SECRET: process.env.AUTH_SECRET || `setup-walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  ADAMANT_OPERATOR_PASSWORD: process.env.ADAMANT_OPERATOR_PASSWORD || "setup-walk-operator",
  PORT: String(PORT),
};

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (SKIP_BUILD) {
  record("C-build", "skipped", "--skip-build");
  record("D-serve", "skipped", "--skip-build");
} else {
  const started = Date.now();
  const build = spawnSync(npm, ["run", "build"], {
    cwd: ROOT,
    env: walkEnv,
    encoding: "utf8",
    timeout: BUILD_TIMEOUT_MS,
    shell: process.platform === "win32",
  });
  const secs = Math.round((Date.now() - started) / 1000);
  if (build.status !== 0) {
    const tail = `${build.stdout ?? ""}${build.stderr ?? ""}`.split("\n").slice(-25).join("\n");
    record("C-build", "fail", `\`npm run build\` failed in self-hosted mode after ${secs}s:\n${tail}`);
    record("D-serve", "skipped", "there is nothing to start — the build did not finish.");
  } else {
    record("C-build", "pass", `\`npm run build\` under SELF_HOSTED=true LOCAL_DB=true finished in ${secs}s.`);
    await serve();
  }
}

/** Start the documented `npm start` and ask the app for the page a reader is told
 *  to open. The server is always stopped, including when the poll fails. */
async function serve() {
  const server = spawn(npm, ["start"], {
    cwd: ROOT,
    env: walkEnv,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let answered = null;
  let lastError = "no attempt completed";
  while (Date.now() < deadline && !answered) {
    if (server.exitCode !== null) {
      lastError = `\`npm start\` exited with code ${server.exitCode} before answering:\n${log.split("\n").slice(-20).join("\n")}`;
      break;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`, { redirect: "manual" });
      const body = await res.text();
      if (res.status >= 200 && res.status < 400 && body.length > 0) answered = { status: res.status, bytes: body.length };
      else lastError = `GET / answered ${res.status} with ${body.length} byte(s).`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  server.kill("SIGTERM");
  if (answered) {
    record(
      "D-serve",
      "pass",
      `\`npm start\` came up and GET / answered ${answered.status} with ${answered.bytes} bytes — a ` +
        "Firestore-less, credential-less install serves, which is what the page promises."
    );
  } else {
    record("D-serve", "fail", `the app never answered on port ${PORT} within ${BOOT_TIMEOUT_MS / 1000}s: ${lastError}`);
  }
}

// --- E. the other documented shape, parsed -----------------------------------

const docker = spawnSync("docker", ["compose", "config"], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
if (docker.error || docker.status === null) {
  record("E-compose", "skipped", "docker is not available on this machine, so the compose shape was not parsed.");
} else if (docker.status !== 0) {
  record("E-compose", "fail", `\`docker compose config\` is red:\n${(docker.stderr || docker.stdout || "").trim()}`);
} else {
  const config = docker.stdout;
  const missing = [];
  if (!/:\s*"?3000"?/.test(config)) missing.push(`the port 3000 the page tells the reader to open`);
  if (!/\.data|\/data/.test(config)) missing.push("a data volume for the sqlite store");
  record(
    "E-compose",
    missing.length === 0 ? "pass" : "fail",
    missing.length === 0
      ? "`docker compose config` parses and still publishes port 3000 with a data volume."
      : `\`docker compose config\` parses but no longer declares ${missing.join(" or ")}.`
  );
}

// --- the verdict -------------------------------------------------------------

const failed = steps.filter((s) => s.status === "fail");
const verdict = {
  on: new Date().toISOString(),
  document: DOC,
  status: failed.length === 0 ? "pass" : "fail",
  steps,
  $note:
    "REPORTING rung: this records whether the documented self-hosted setup still works on a clean machine. " +
    "A `fail` is a documentation defect until proven otherwise — fix the page or fix the step it names, and " +
    "never delete the step to go green.",
};

if (OUT_FILE) writeFileSync(OUT_FILE, `${JSON.stringify(verdict, null, 2)}\n`);
if (SUMMARY_FILE) {
  const rows = steps.map((s) => `| ${s.id} | ${s.status} | ${s.detail.split("\n")[0]} |`).join("\n");
  try {
    appendFileSync(
      SUMMARY_FILE,
      `### Setup walk — ${DOC}\n\n| step | result | detail |\n| --- | --- | --- |\n${rows}\n\n` +
        `**${verdict.status.toUpperCase()}** — ${failed.length} failing step(s).\n\n`
    );
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

console.log("");
if (failed.length === 0) {
  console.log("✓ setup walk: the documented self-hosted quick start still works on this machine.");
} else {
  console.log(`✗ setup walk: ${failed.length} documented step(s) no longer work.`);
  console.log(`  Next: read ${DOC} § Quick start and follow it by hand — the walk is only useful if the page is.`);
  process.exitCode = 1;
}
