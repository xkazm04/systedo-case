#!/usr/bin/env node
/** The stricter TypeScript project, MEASURED — on a loop, not when somebody
 *  remembers.
 *
 *  WHY THIS EXISTS. `tsconfig.strict.json` turns on the two flags `strict: true`
 *  does not (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), and
 *  `npm run typecheck:strict` runs it. Nothing ran it. A second standard that
 *  nothing executes gives no feedback to the author of a change: the strict frontier
 *  could only move when a maintainer thought to look, and the number it produces —
 *  the one ADR-0007 says a promotion decision needs — was never produced. From the
 *  outside "an instrument nobody is routed to" and "a gate somebody forgot to wire"
 *  are the same file.
 *
 *  So this runs it, parses the errors, and prints the two numbers a decision needs:
 *  HOW MANY, and HOW CLUSTERED. It runs on every push and pull request as a
 *  reporting step of .github/workflows/ci.yml, next to the i18n audit and for the
 *  same reason (ADR-0007) — the count is not zero today, so making it blocking would
 *  only teach people to skip CI. What it produces instead is a measurement with a
 *  date on it, in the job summary, every time.
 *
 *  AND IT HAS A RATCHET WAITING. `.github/typecheck-strict.json` starts with no
 *  accepted baseline, deliberately: `tsconfig.strict.json` says in its own words that
 *  what must not happen is a ratchet baseline invented without running it, and no
 *  offline session can run `tsc`. The first maintainer (or CI run) to measure it
 *  closes that in one command:
 *
 *      npm run typecheck:strict:report                       # what does it cost?
 *      npm run typecheck:strict:accept -- --reason "…"       # pin today's count
 *
 *  After that `npm run typecheck:strict:check` fails when the count RISES, which is
 *  the rung above reporting and the one that makes the frontier one-way. Until then
 *  it prints and exits 0 — a green it did not earn is worse than an honest number.
 *
 *  AND A TOTAL DOES NOT KNOW WHERE IT HURTS. One number for the whole tree is a
 *  ratchet a regression can BUY ITS WAY PAST: three new `noUncheckedIndexedAccess`
 *  errors in the LLM chokepoint, four cleaned up in a marketing page, total falls,
 *  gate content — and the hole was opened in the seam where a wrong type is a bill
 *  or a breach. So the measurement is also taken per SEAM, over the load-bearing
 *  paths declared in `.github/typecheck-strict.json` (`seams`), each seam pinned at
 *  the same moment the total is. A seam over its own pin is reported even when the
 *  total fell, which is the offsetting case the global count structurally cannot
 *  see. The seams are printed on every run, baseline or not, because "where is the
 *  strict debt?" is a question worth answering before anybody pins anything.
 *
 *  Usage:
 *    node scripts/typecheck-strict.mjs                    # measure and print
 *    node scripts/typecheck-strict.mjs --check            # …and fail above baseline
 *    node scripts/typecheck-strict.mjs --accept --reason "…"
 *    node scripts/typecheck-strict.mjs --summary "$GITHUB_STEP_SUMMARY"
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE_PATH = ".github/typecheck-strict.json";
export const STRICT_CONFIG = "tsconfig.strict.json";

/** `path/to/File.ts(12,3): error TS2532: …` — the only line shape tsc reports a
 *  diagnostic in, with or without `--pretty false`. Returns one row per error. */
export function parseDiagnostics(output) {
  const rows = [];
  for (const line of String(output).split(/\r?\n/)) {
    const m = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    rows.push({ file: m[1].replace(/\\/g, "/"), line: Number(m[2]), code: m[4], message: m[5] });
  }
  return rows;
}

/** Errors per file and per rule, most first — "is it clustered, or spread?" is the
 *  question that decides whether the flag can be promoted in one commit or needs an
 *  `include` narrowed to the directories that are already clean. */
export function cluster(rows) {
  const byFile = new Map();
  const byCode = new Map();
  for (const r of rows) {
    byFile.set(r.file, (byFile.get(r.file) ?? 0) + 1);
    byCode.set(r.code, (byCode.get(r.code) ?? 0) + 1);
  }
  const sort = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { byFile: sort(byFile), byCode: sort(byCode) };
}

/** A diagnostic's file as the declared seam paths spell it: forward slashes, no
 *  leading `./`, and project-relative even when tsc reported an absolute path. */
export function normalizeDiagnosticFile(file) {
  const f = String(file).replace(/\\/g, "/").replace(/^\.\//, "");
  const i = f.lastIndexOf("/src/");
  return i === -1 ? f : f.slice(i + 1);
}

/** Errors per declared SEAM — the count a total cannot give you. A path ending in
 *  `/` matches the directory and everything under it; anything else is one file.
 *  Seams may overlap: a row inside two of them is counted in both, because each
 *  seam's pin is a statement about that seam and not a share of a budget. */
export function bySeam(rows, seams) {
  return (seams ?? []).map((seam) => {
    const paths = seam.paths ?? [];
    const hits = rows.filter((row) => {
      const file = normalizeDiagnosticFile(row.file);
      return paths.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));
    });
    return {
      id: seam.id,
      errors: hits.length,
      files: new Set(hits.map((h) => normalizeDiagnosticFile(h.file))).size,
    };
  });
}

/** The seams that are worse than what was pinned for them. A seam with no pin is
 *  not a finding — it is a seam declared after the baseline was accepted, and the
 *  answer to that is the next `--accept`, not a red build over a number nobody
 *  measured. */
export function seamRegressions(counts, pins) {
  if (!pins) return [];
  return counts
    .filter((c) => typeof pins[c.id] === "number" && c.errors > pins[c.id])
    .map((c) => ({ id: c.id, errors: c.errors, pin: pins[c.id] }));
}

/** The recorded baseline, or a fresh unaccepted one. Never throws: a malformed
 *  record must not be the reason a measurement cannot be taken. */
export function readBaseline(root) {
  const path = join(root, BASELINE_PATH);
  if (!existsSync(path)) return { schema: 1, accepted: null };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schema: 1, accepted: null, unreadable: true };
  }
}

const REASON_FILLER = /^(update|fix|chore|wip|because|reasons?|n\/?a|\.+)$/i;

/** A reason that says nothing is refused, exactly as the golden and budget
 *  acceptances refuse one — the record exists to be read later. */
export function reasonProblem(reason) {
  const r = String(reason ?? "").trim();
  if (!r) return "no --reason given. A baseline with no sentence behind it is a number nobody can argue with.";
  if (r.length < 12) return `the reason "${r}" is too short to tell a future reader what was measured and why.`;
  if (REASON_FILLER.test(r)) return `"${r}" is filler. Say what the count is and why pinning it here is right.`;
  return null;
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
  };
  const CHECK = argv.includes("--check");
  const ACCEPT = argv.includes("--accept");
  const SUMMARY = arg("--summary");

  const out = [];
  const say = (s = "") => {
    out.push(s);
    console.log(s);
  };

  const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tsc)) {
    // Reporting rung: a missing toolchain is not a finding about this repository's
    // types, so it never decides an exit code.
    console.log(`typecheck:strict — typescript is not installed here (${tsc} is missing). Nothing measured.`);
    process.exit(0);
  }

  const started = Date.now();
  const res = spawnSync(process.execPath, [tsc, "--noEmit", "--pretty", "false", "-p", STRICT_CONFIG], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = (Date.now() - started) / 1000;
  if (res.error) {
    console.log(`typecheck:strict — could not run tsc (${res.error.message}). Nothing measured.`);
    process.exit(0);
  }

  const rows = parseDiagnostics(`${res.stdout ?? ""}${res.stderr ?? ""}`);
  const { byFile, byCode } = cluster(rows);
  const baseline = readBaseline(ROOT);
  const pinned = typeof baseline.accepted?.errors === "number" ? baseline.accepted.errors : null;
  const seamCounts = bySeam(rows, baseline.seams);
  const seamPins = baseline.accepted?.bySeam ?? null;
  const seamOver = seamRegressions(seamCounts, seamPins);

  say(`### Stricter typecheck (\`${STRICT_CONFIG}\`)`);
  say("");
  say(
    `  ${rows.length} error(s) across ${byFile.length} file(s), measured in ${seconds.toFixed(1)}s` +
      (pinned === null ? " — no baseline accepted yet" : ` (baseline ${pinned})`)
  );
  say("");
  if (rows.length) {
    say("  Most affected files:");
    for (const [file, n] of byFile.slice(0, 10)) say(`    ${String(n).padStart(4, " ")}  ${file}`);
    say("");
    say("  By rule:");
    for (const [code, n] of byCode.slice(0, 6)) say(`    ${String(n).padStart(4, " ")}  ${code}`);
    say("");
  }

  if (seamCounts.length) {
    // Printed whether or not anything was found, and whether or not a baseline
    // exists: a seam at zero is the number that says the frontier is already clean
    // where it matters most, and it is the one a total can never show.
    say("  By seam (the load-bearing paths — a rise here is not offset by cleanup elsewhere):");
    for (const seam of seamCounts) {
      const pin = seamPins && typeof seamPins[seam.id] === "number" ? ` (pin ${seamPins[seam.id]})` : "";
      say(`    ${String(seam.errors).padStart(4, " ")}  ${seam.id}${pin}`);
    }
    say("");
  }

  if (SUMMARY) {
    try {
      appendFileSync(SUMMARY, `${out.join("\n")}\n`);
    } catch (err) {
      console.error(`(could not write the summary: ${err.message})`);
    }
  }

  if (ACCEPT) {
    const problem = reasonProblem(arg("--reason"));
    if (problem) {
      console.error(`✗ typecheck:strict --accept: ${problem}`);
      process.exit(1);
    }
    const record = {
      schema: 1,
      $comment:
        "The measured cost of the stricter TypeScript project, pinned so it can only fall. Written by " +
        "`npm run typecheck:strict:accept -- --reason \"…\"`; read by `npm run typecheck:strict:check`, and " +
        "held in shape by test-unit/typecheck-strict.test.mjs. `accepted: null` means nobody has measured it " +
        "yet, which is the honest state for a check nothing has ever run (ADR-0007). `accepted.bySeam` pins " +
        "each declared seam separately, so a rise in one is not paid for by cleanup somewhere cheaper.",
      // Carried through on purpose: the seam declaration is reviewed data, not
      // something an --accept run gets to drop on its way past.
      $seams: baseline.$seams,
      seams: baseline.seams ?? [],
      accepted: {
        errors: rows.length,
        files: byFile.length,
        bySeam: Object.fromEntries(seamCounts.map((s) => [s.id, s.errors])),
        at: new Date().toISOString().slice(0, 10),
        reason: String(arg("--reason")).trim(),
      },
      history: [...(baseline.history ?? []), ...(baseline.accepted ? [baseline.accepted] : [])],
    };
    if (record.$seams === undefined) delete record.$seams;
    writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`✓ baseline recorded in ${BASELINE_PATH}: ${rows.length} error(s). It may fall; it may not rise.`);
    for (const seam of seamCounts) console.log(`  ${seam.id}: ${seam.errors} pinned`);
    process.exit(0);
  }

  if (pinned === null) {
    say(
      "  REPORTING RUNG (docs/adr/0007-gate-rung-discipline.md): no baseline has been accepted, so this run " +
        "measures and does not decide. Pin the count on purpose to make it one-way:"
    );
    say('    npm run typecheck:strict:accept -- --reason "what this count is and why pinning it here is right"');
    if (seamCounts.length) {
      say(
        `  That one command pins the total AND each of the ${seamCounts.length} seams above, so a later change ` +
          "cannot pay for a hole in the chokepoint or a store driver with cleanup in a marketing page."
      );
    }
    process.exit(0);
  }

  if (rows.length > pinned || seamOver.length) {
    console.error("");
    if (rows.length > pinned) {
      console.error(
        `✗ typecheck:strict: ${rows.length} error(s), above the accepted baseline of ${pinned}. This change made the ` +
          "stricter frontier worse."
      );
    }
    for (const seam of seamOver) {
      console.error(
        `✗ typecheck:strict: the \`${seam.id}\` seam is at ${seam.errors} error(s), above its pin of ${seam.pin}.` +
          (rows.length > pinned
            ? ""
            : " The TOTAL did not rise — this is exactly the trade a single number cannot see, and the seam is " +
              "where a type hole costs a bill or a breach.")
      );
    }
    console.error("");
    console.error("  → what to do next:");
    console.error("      npm run typecheck:strict    # the raw compiler output, file by file");
    console.error("      Fix the new errors. Never raise a baseline you could have lowered (AGENTS.md § amber).");
    console.error('      A higher count is a decision: npm run typecheck:strict:accept -- --reason "…"');
    console.error("      A higher SEAM count is a bigger one — say which seam, and why that hole is acceptable.");
    console.error("");
    process.exit(CHECK ? 1 : 0);
  }

  if (rows.length < pinned) {
    say(
      `  ↓ ${pinned - rows.length} fewer than the baseline. Lower it in this commit: ` +
        'npm run typecheck:strict:accept -- --reason "…"'
    );
  }
  process.exit(0);
}
