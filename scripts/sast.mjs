#!/usr/bin/env node
/** Static application security rules for THIS repo (zero-dependency, ADR-0008).
 *
 *  Runs blocking in CI (.github/workflows/sast.yml, job `repo-rules`) on every
 *  push and pull request, and locally via `npm run sast`. A finding that is not
 *  allowlisted exits non-zero and fails the job.
 *
 *  It is the repo-local half of a two-part SAST posture: Semgrep's registry packs
 *  run beside it on the reporting rung and know the generic JavaScript/Node
 *  vulnerability classes; these rules know the invariants that are specific to
 *  Adamant and that no off-the-shelf pack can see — the tenant key, the route
 *  guards, the BYOM key path, the client/server env boundary.
 *
 *  Every rule below passes on the tree today, which is what earns it the blocking
 *  rung (ADR-0007). Deliberate exceptions live in
 *  .github/security/sast-allowlist.json with a written reason, never in a code
 *  comment — an exception nobody can enumerate is not an exception, it is a hole.
 *
 *  Usage:
 *    node scripts/sast.mjs                 # scan, print findings, exit 1 if any
 *    node scripts/sast.mjs --inventory     # also print the API route/guard table
 *    node scripts/sast.mjs --summary FILE  # append a markdown report to FILE
 *                                          # (used for $GITHUB_STEP_SUMMARY)
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { recordFiring } from "./fence-firings.mjs";
import { printRemedy } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const ALLOWLIST_PATH = join(ROOT, ".github", "security", "sast-allowlist.json");

const argv = process.argv.slice(2);
const WANT_INVENTORY = argv.includes("--inventory");
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;

// --- file collection --------------------------------------------------------

/** Repo-relative, forward-slashed path (the form the allowlist is keyed by). */
const rel = (abs) => abs.slice(ROOT.length + 1).split(sep).join("/");

function collect(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

const files = collect(SRC).map((abs) => ({ path: rel(abs), text: readFileSync(abs, "utf8") }));
const routes = files.filter((f) => /^src\/app\/api\/.*\/route\.ts$/.test(f.path));

// --- source normalisation ---------------------------------------------------
// Two views of each file. `noComments` keeps string and template contents, so a
// rule that is ABOUT a template (SQL interpolation) can still see it. `codeOnly`
// also blanks literals, so a rule that is about identifiers never fires on prose
// — "key present but undecryptable — secret rotated?" is a log message, not a
// leaked secret, and a rule that cannot tell those apart gets switched off.

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

// Double quotes first: this codebase quotes with `"`, so blanking those removes
// nearly all prose — including the apostrophes that would otherwise make the
// single-quote pass swallow real code between two unrelated `'` characters.
function stripLiterals(src) {
  return src
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

for (const f of files) {
  f.noComments = stripComments(f.text);
  f.codeOnly = stripLiterals(f.noComments);
}

// --- allowlist --------------------------------------------------------------

let allowlist = {};
if (existsSync(ALLOWLIST_PATH)) {
  try {
    allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  } catch (err) {
    console.error(`✗ SAST: ${rel(ALLOWLIST_PATH)} is not valid JSON — ${err.message}`);
    process.exit(1);
  }
}

const used = new Set();
function allowed(ruleId, path) {
  const entry = allowlist[ruleId];
  if (!entry || typeof entry !== "object") return null;
  const reason = entry[path];
  if (typeof reason !== "string" || reason.trim() === "") return null;
  used.add(`${ruleId}::${path}`);
  return reason;
}

// --- rules ------------------------------------------------------------------
// Each rule returns [{ path, line, detail }]. `line` is 1-indexed and best-effort
// (it is derived from the normalised view, which preserves newlines).

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function scan(view, re, predicate) {
  const out = [];
  for (const f of files) {
    const src = f[view];
    for (const m of src.matchAll(re)) {
      if (predicate && !predicate(m, f)) continue;
      out.push({ path: f.path, line: lineOf(src, m.index), detail: m[0].trim().slice(0, 120) });
    }
  }
  return out;
}

/** Anything that proves a handler established WHO is calling before it acts. */
const GUARD_RE =
  /currentUserId|currentSession|requireAdmin|isAdminEmail|cronAuthorized|from "@\/auth"|auth\(\)|require[A-Za-z]*Project|require[A-Za-z]*User|requireSession|api-guard|rejectUnknownProject/;

const RULES = [
  {
    id: "raw-engine-outside-seam",
    rung: "reporting",
    // 15 files import an engine outside a backend file today (2026-08-29, after
    // wave 0 moved microsite, control-plane and mutations behind seams). The
    // number is a debt count, not a budget: lower it when a module grows a store,
    // and graduate a permanently-legitimate one (src/auth.ts needs the Firestore
    // adapter by construction) into the allowlist with a written reason instead.
    ratchet: 15,
    title: "Store engine imported outside the dual-store seam",
    why:
      "ADR-0001 says every persisted domain speaks through ONE interface module with a " +
      ".firestore.ts / .local.ts pair beside it. A module that opens firestore or getDb " +
      "itself is outside that seam: it has no local twin, so it is a hole in offline dev " +
      "and in every self-hosted install, and it is invisible to the pair convention that " +
      "caught the original twelve Firestore-only modules. It also re-scatters the question " +
      "ADR-0002 depends on — 'what writes to tenants/{tenant}?' should be a directory " +
      "listing, not an investigation across a dozen modules.",
    // Matched against `noComments`, which keeps string contents: an import's module
    // specifier IS a string literal, so the `codeOnly` view (which blanks literals)
    // cannot see it at all. Comments are stripped so a doc comment mentioning
    // firebase-admin — several of them do — is not a finding.
    run: () => {
      // The seam itself: the two engine owners, plus every backend implementation.
      // `users/local.ts` and `campaigns/store/local-docs.ts` are backends whose names
      // predate the .local.ts convention; excluded as implementations, not waivers.
      const SEAM =
        /(^src\/lib\/firebase\.ts$|^src\/lib\/db\.ts$|\.firestore\.ts$|\.local\.ts$|^src\/lib\/users\/local\.ts$|^src\/lib\/campaigns\/store\/local-docs\.ts$|^src\/lib\/tenant-docs\/(firestore|local)\.ts$)/;
      const ENGINE = /from\s+"(firebase-admin[^"]*|@\/lib\/firebase|@\/lib\/db)"/;
      const out = [];
      for (const f of files) {
        if (SEAM.test(f.path)) continue;
        const m = ENGINE.exec(f.noComments);
        if (!m) continue;
        out.push({
          path: f.path,
          line: f.noComments.slice(0, m.index).split("\n").length,
          detail: `imports ${m[1]} with no .firestore/.local twin`,
        });
      }
      return out;
    },
  },
  {
    id: "route-auth",
    title: "API route with no caller identity established",
    why:
      "SECURITY.md names src/app/api/ as in scope and the product holds live ad-platform " +
      "credentials. Worse than a leak here is the quiet failure of ADR-0002: an unverified " +
      "projectId does not 401, it mints a fresh empty tenant that reads as 'no data yet'.",
    // Matched against the RAW file, comments included, on purpose. Naming a guard
    // in a comment while calling none would pass — but that is a lie, not an
    // oversight, and this rule exists to catch the oversight. Failing an honest
    // handler because its only mention of the guard sat in a doc comment would be
    // the expensive error: it would make the security gate the thing people route
    // around.
    run: () =>
      routes
        .filter((f) => !GUARD_RE.test(f.text))
        .map((f) => ({ path: f.path, line: 1, detail: "no guard helper referenced" })),
  },
  {
    id: "client-env",
    title: "Client component reads a server environment variable",
    why:
      "Anything a \"use client\" module reads from process.env is inlined into the browser " +
      "bundle at build time. Only NODE_ENV and NEXT_PUBLIC_* may cross that line.",
    run: () => {
      const out = [];
      for (const f of files) {
        if (!/^\s*["']use client["']/m.test(f.text)) continue;
        for (const m of f.codeOnly.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          const name = m[1];
          if (name === "NODE_ENV" || name.startsWith("NEXT_PUBLIC_")) continue;
          out.push({ path: f.path, line: lineOf(f.codeOnly, m.index), detail: `process.env.${name}` });
        }
      }
      return out;
    },
  },
  {
    id: "eval-sink",
    title: "Dynamic code execution",
    why: "eval / new Function turn any reachable string — a model response, a feed field — into code.",
    run: () => scan("codeOnly", /\beval\s*\(|\bnew\s+Function\s*\(/g),
  },
  {
    id: "sql-template-interpolation",
    title: "SQL built by template interpolation",
    why:
      "node:sqlite statements must bind parameters with ?. Interpolating into the SQL text is " +
      "injection unless the interpolated value is a constant identifier the caller cannot reach.",
    run: () => scan("noComments", /\.prepare\(\s*`[^`]*\$\{/g),
  },
  {
    id: "secret-in-log",
    title: "Credential-shaped identifier passed to console",
    why:
      "SECURITY.md's promise is that the LLM chokepoint logs operation names, token counts and " +
      "cost — not credentials. Vercel and container logs are a second copy of anything printed.",
    run: () =>
      scan(
        "codeOnly",
        /console\.[a-z]+\([^)]*\b(apiKey|secret|password|credential|accessToken|refreshToken|privateKey|plaintextKey)\b/gi
      ),
  },
  {
    id: "plaintext-key-in-route",
    title: "Route handler imports the decrypted BYOM key",
    why:
      "resolveByomKey returns a user's decrypted provider key. A route that holds one is one " +
      "Response.json() away from returning it; the settings surfaces use getPublicByomConfig.",
    run: () =>
      files
        .filter((f) => f.path.startsWith("src/app/api/") && /\bresolveByomKey\b/.test(f.codeOnly))
        .map((f) => ({ path: f.path, line: 1, detail: "imports resolveByomKey" })),
  },
  {
    id: "insecure-transport",
    title: "TLS verification disabled",
    why: "Turning off certificate verification makes every outbound provider call trivially interceptable.",
    run: () => scan("codeOnly", /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/g),
  },
  {
    id: "public-env-secret",
    title: "Secret-shaped value exposed through a NEXT_PUBLIC_ variable",
    why: "NEXT_PUBLIC_ is a promise that the value is public. A SECRET/PASSWORD/PRIVATE name there is a contradiction.",
    run: () => scan("codeOnly", /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE)/g),
  },
  {
    id: "deprecated-cipher",
    title: "Key-derived cipher with no explicit IV",
    why:
      "createCipher/createDecipher derive an IV from the password. Both token-crypto seams " +
      "(src/lib/inventory/token-crypto.ts, src/lib/llm/keys/crypto.ts) must stay on the IV form.",
    run: () => scan("codeOnly", /\bcreateCipher\s*\(|\bcreateDecipher\s*\(/g),
  },
];

// --- run --------------------------------------------------------------------

const blocking = [];
const waived = [];

// A rule is BLOCKING by default: it passes on the tree today, so any finding is a
// regression and fails the job (ADR-0007's first rung). A rule may instead declare
// `rung: "reporting"` with a numeric `ratchet` — the second rung, for an invariant
// that is right but that the tree does not satisfy YET. Its findings are counted
// and printed in full, and it fails only when the count RISES above the ratchet.
// Fix findings and lower the ratchet in the same commit; never raise it. This is
// the rung that lets a boundary be stated and measured on the day it is agreed,
// instead of waiting for a big-bang cleanup that never comes.
const reporting = [];
for (const rule of RULES) {
  for (const finding of rule.run()) {
    const reason = allowed(rule.id, finding.path);
    if (reason) waived.push({ rule, ...finding, reason });
    else if (rule.rung === "reporting") reporting.push({ rule, ...finding });
    else blocking.push({ rule, ...finding });
  }
}

const lines = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};

say(`SAST (repo rules) — ${RULES.length} rules over ${files.length} source files, ${routes.length} API routes`);
say("");

if (blocking.length) {
  say(`✗ ${blocking.length} finding(s):`);
  say("");
  for (const f of blocking) {
    say(`  ${f.path}:${f.line}`);
    say(`    [${f.rule.id}] ${f.rule.title} — ${f.detail}`);
    say(`    why: ${f.rule.why}`);
    say("");
  }
  say("If a finding is a deliberate, understood exception, add it to");
  say(".github/security/sast-allowlist.json with a reason. Anything else is a fix.");

  // Which RULE caught it, written down. "The security gate went red" is not the
  // question anybody has: a rule that has never fired is dead weight in a blocking
  // chain, one that fires constantly is either a real problem or a badly drawn
  // line, and neither is visible from inside one red build. Ten rules here have
  // been blocking for months with no record of what any of them caught
  // (scripts/fence-firings.mjs · npm run fences).
  for (const id of new Set(blocking.map((f) => f.rule.id))) {
    recordFiring(id, { detail: `sast: ${blocking.filter((f) => f.rule.id === id).length} finding(s)` });
  }
} else {
  say(`✓ no findings.`);
}

if (waived.length) {
  say("");
  say(`Allowlisted (${waived.length}) — reviewed exceptions, re-read them when they change:`);
  for (const w of waived) say(`  • [${w.rule.id}] ${w.path} — ${w.reason}`);
}

// A stale entry is rot: it silently pre-approves a finding that no longer exists,
// so the next real one at that path lands pre-waived. Reported, not fatal — a
// deleted file should not turn the security gate red on someone else's commit.
const stale = [];
for (const [ruleId, entries] of Object.entries(allowlist)) {
  if (!entries || typeof entries !== "object" || ruleId.startsWith("$")) continue;
  for (const path of Object.keys(entries)) {
    if (!used.has(`${ruleId}::${path}`)) stale.push(`${ruleId} → ${path}`);
  }
}
if (stale.length) {
  say("");
  say(`⚠ ${stale.length} stale allowlist entr(y/ies) — the finding is gone; delete the waiver:`);
  for (const s of stale) say(`  • ${s}`);
}

// Reporting rung: counted against each rule's ratchet. Over budget is a failure;
// under budget is a request to lower the number while the win is fresh.
const overRatchet = [];
for (const rule of RULES.filter((r) => r.rung === "reporting")) {
  const found = reporting.filter((f) => f.rule.id === rule.id);
  say("");
  say(`${found.length > rule.ratchet ? "✗" : "•"} [${rule.id}] ${rule.title} — ${found.length} finding(s), ratchet ${rule.ratchet}`);
  say(`    why: ${rule.why}`);
  for (const f of found) say(`  ${f.path}:${f.line} — ${f.detail}`);
  if (found.length > rule.ratchet) {
    overRatchet.push(rule.id);
    say(`    ✗ ${found.length} > ${rule.ratchet}. This rule is on the reporting rung: it fails only when the`);
    say(`      count RISES. Route the new one through the seam, or allowlist it with a written reason.`);
  } else if (found.length < rule.ratchet) {
    say(`    ↓ ${found.length} < ${rule.ratchet} — lower the ratchet to ${found.length} in this commit.`);
  }
}

if (WANT_INVENTORY || SUMMARY_FILE) {
  say("");
  say("API route guard inventory:");
  for (const f of routes) {
    const guard = GUARD_RE.exec(f.text);
    const methods = [...f.noComments.matchAll(/export\s+async\s+function\s+([A-Z]+)\s*\(/g)].map((m) => m[1]);
    say(`  ${f.path.replace(/^src\/app\/api/, "").replace(/\/route\.ts$/, "") || "/"}  ` +
      `[${methods.join(",") || "—"}]  ${guard ? guard[0] : "UNAUTHENTICATED"}`);
  }
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, `### SAST (repo rules)\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

// The next command, printed by the gate itself on the way out (scripts/gate-remedy.mjs)
// — a finding names the rule and the file, and the reader meeting this gate for the
// first time needs to know that the answer is the seam and not the allowlist.
const failed = Boolean(blocking.length || overRatchet.length);
if (failed) printRemedy("sast");
process.exit(failed ? 1 : 0);
