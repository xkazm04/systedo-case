#!/usr/bin/env node
/** The real-model prove's trail: this week's verdict, and the weeks before it.
 *
 *  A single pass/fail tells you about one Wednesday. What a Monday triage needs is
 *  the shape of the line — an operation that has failed three weeks running is a
 *  contract that moved and nobody noticed; one that failed once between two passes
 *  was an outage. Neither is visible from inside a run, and a job summary expires
 *  with its retention window.
 *
 *  So this renders one page: the verdict scripts/llm-drift.mjs just wrote, plus
 *  the conclusions of the previous runs of the same workflow, read back from the
 *  Actions API. Nothing is stored in the repository — master ships on push, so a
 *  commit from a cron would be a release — and the page is published into one
 *  GitHub issue that is rewritten each week, exactly as
 *  .github/workflows/agent-review-history.yml does with the rubric review's trail.
 *
 *  REPORTING RUNG (docs/adr/0007-gate-rung-discipline.md), permanently: it needs
 *  the network and a token, so it can never sit in `check:ci`, and it exits 0
 *  whatever it finds. The prove's own exit code is the verdict; this only writes
 *  it down.
 *
 *  Usage:
 *    node scripts/llm-drift-history.mjs --verdict verdict.json \
 *      [--runs 20] [--out report.md] [--summary "$GITHUB_STEP_SUMMARY"]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = "llm-drift.yml";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const VERDICT_FILE = arg("--verdict");
const OUT_FILE = arg("--out");
const SUMMARY_FILE = arg("--summary");
const RUNS = Number(arg("--runs") ?? 20) || 20;
const REPO = arg("--repo") ?? process.env.GITHUB_REPOSITORY ?? "";

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

function finish() {
  const text = out.join("\n") + "\n";
  if (SUMMARY_FILE) {
    try {
      appendFileSync(SUMMARY_FILE, text);
    } catch (err) {
      console.error(`(could not write summary: ${err.message})`);
    }
  }
  // Written even when there is nothing to report, so the published page says why
  // it is empty instead of silently keeping last week's answer.
  if (OUT_FILE) {
    try {
      writeFileSync(OUT_FILE, text);
    } catch (err) {
      console.error(`(could not write ${OUT_FILE}: ${err.message})`);
    }
  }
  process.exit(0);
}

/** `gh api <path>` → parsed JSON, or null. Never throws: a missing `gh`, an
 *  expired token and a rate limit all mean "no history to show", not a red cron. */
function api(path) {
  const res = spawnSync("gh", ["api", "-H", "Accept: application/vnd.github+json", path], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

say("## LLM drift — the real-model prove");
say("");
say(
  "`check:ci` is static and key-free by decision (the hash-cached re-prove was retired 2026-08-05), so nothing " +
    "in a build can see the model on the other side of the chokepoint change its mind. This is the prove that " +
    "can, on a schedule, with the verdicts kept where a trend is readable."
);
say("");

// --- this run ----------------------------------------------------------------

let verdict = null;
if (VERDICT_FILE && existsSync(VERDICT_FILE)) {
  try {
    verdict = JSON.parse(readFileSync(VERDICT_FILE, "utf8"));
  } catch (err) {
    say(`_The verdict file could not be parsed — ${err.message}._`);
    say("");
  }
}

if (!verdict) {
  say("### This run");
  say("");
  say("_No verdict was produced. The prove step did not get far enough to write one — see the job log._");
  say("");
} else {
  const badge = { pass: "✅ pass", fail: "❌ fail", skipped: "⏭️ skipped" }[verdict.status] ?? verdict.status;
  say(`### This run — ${badge}`);
  say("");
  say(`- **Provider:** ${verdict.provider ?? "(unknown)"}`);
  say(`- **Measured:** ${verdict.measuredAt ?? "(unknown)"}`);
  if (verdict.status === "skipped") {
    say(`- **Why nothing was proved:** ${verdict.reason ?? "(unrecorded)"}`);
    say("");
    say(
      "A skipped run is not a green one. It means the schedule is running and the provider is not — configure " +
        "`GEMINI_API_KEY` for this repository, or accept that the real-model prove happens only on demand."
    );
  } else {
    say(`- **Operations:** ${verdict.total ?? verdict.tools?.length ?? 0}, of which ${verdict.failed ?? 0} failed`);
  }
  say("");
  const failures = (verdict.tools ?? []).filter((t) => !t.ok);
  if (failures.length) {
    say("| operation | model served | expected | what broke |");
    say("|---|---|---|---|");
    for (const t of failures) {
      const why = t.error
        ? `error: ${String(t.error).slice(0, 120)}`
        : t.demo
          ? "fell back to the demo"
          : t.model !== t.expected
            ? "served by another model"
            : "no longer passes its validator";
      say(`| \`${t.id}\` | ${t.model ?? "—"} | ${t.expected ?? "—"} | ${why} |`);
    }
    say("");
    say(
      "Nothing in the repository changed to cause these. Read them as a provider change first: " +
        "`npm run test:llm` proves the same operations against the development provider, and a shape that " +
        'moved for good is a golden accepted on purpose (`npm run llm:eval:update -- --reason "…"`).'
    );
    say("");
  }
}

// --- the weeks before it -----------------------------------------------------

say("### The runs before this one");
say("");

if (!REPO) {
  say("_No repository to query (`GITHUB_REPOSITORY` unset). Only this run is shown._");
  finish();
}

const runs = api(`/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=${RUNS}`);
if (!runs || !Array.isArray(runs.workflow_runs)) {
  say("_The Actions API could not be read (no `gh`, no token, or a rate limit). Only this run is shown._");
  finish();
}

const rows = runs.workflow_runs
  .filter((r) => r.status === "completed")
  .map((r) => ({
    date: String(r.created_at ?? "").slice(0, 10),
    conclusion: r.conclusion ?? "(none)",
    event: r.event ?? "",
    url: r.html_url ?? "",
  }));

if (!rows.length) {
  say("_No completed run yet. This page fills in from the second week._");
  finish();
}

say("| date | verdict | trigger | run |");
say("|---|---|---|---|");
for (const r of rows) {
  const badge = r.conclusion === "success" ? "✅" : r.conclusion === "failure" ? "❌" : "•";
  say(`| ${r.date} | ${badge} ${r.conclusion} | ${r.event} | ${r.url ? `[log](${r.url})` : "—"} |`);
}
say("");

const failures = rows.filter((r) => r.conclusion === "failure").length;
say(
  `${rows.length} completed run(s), ${failures} red. A single red between greens is an outage; a run of reds is ` +
    "a contract that moved — and the date of the first one is the date the drift arrived."
);

finish();
