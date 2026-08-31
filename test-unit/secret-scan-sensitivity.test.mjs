/** The staged-secret scanner, shown catching each thing it claims to catch.
 *
 *  THE PROBLEM. `.husky/pre-commit` runs a secret scan on the staged blob — the
 *  last cheap moment, because once a credential is a commit the only remedy is
 *  rotation. It has never gone red on this repository, and a scanner that has
 *  never fired looks exactly like a scanner whose regexes stopped matching:
 *  `\bapi[_-]?key\b` needs a word boundary, `_` is a word character, and so
 *  `GEMINI_API_KEY = "…"` — the spelling EVERY credential in this app is written
 *  in — never matched the generic rule at all. Nothing said so, because nothing
 *  ever asked a rule to fire.
 *
 *  SO THE LIST IS CLOSED. `node scripts/secret-scan.mjs --rules` prints every rule
 *  the scanner has; each one below gets the smallest file that trips it, and the
 *  real script — the same file the hook runs — must exit non-zero and name that
 *  rule. A rule added with no fixture fails this suite; a rule that has quietly
 *  stopped matching fails it too. The negative cases matter as much: a scanner
 *  that fires on `.env.example` and on every test fixture is one people learn to
 *  pass `--no-verify` around, and then it is not a guard at all.
 *
 *  NO CREDENTIAL-SHAPED LITERAL APPEARS IN THIS FILE. Every fixture is assembled
 *  from pieces at run time, so the scanner reading its own test file (this suite's
 *  own commit is staged like any other) has nothing to find.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`. Spawns the script; no git, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "secret-scan.mjs");

/** Forward slashes even on Windows: the scanner's own path rules are written with
 *  `/` separators (`(^|\/)\.env(\.|$)`), and Node reads either spelling. */
const slash = (p) => p.replace(/\\/g, "/");

/** Run the real scanner over one throwaway file and return what it decided. */
function scan(name, content) {
  const dir = mkdtempSync(join(tmpdir(), "secret-scan-"));
  const file = join(dir, name);
  try {
    writeFileSync(file, content);
    const res = spawnSync(process.execPath, [SCRIPT, slash(file)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return { code: res.status, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The rule names the scanner says it has. Read from the script, never restated
 *  here — that is what makes the coverage assertion below closed. */
function ruleNames() {
  const res = spawnSync(process.execPath, [SCRIPT, "--rules"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(res.status, 0, `\`secret-scan.mjs --rules\` exited ${res.status}: ${res.stderr}`);
  return (res.stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const a = (n) => "a".repeat(n);
const hex = "0123456789abcdef0123456789abcdef";

/** rule → the smallest file that must trip it. `file` names the fixture, because
 *  two of these rules are about the PATH rather than the content. */
const FIXTURES = {
  "private-key-block": { file: "id_rsa.txt", line: `-----BEGIN RSA PRIVATE${" "}KEY-----` },
  "aws-access-key-id": { file: "f.ts", line: `const k = "AKIA${"ABCDEFGHIJKLMNOP"}";` },
  "google-api-key": { file: "f.ts", line: `const k = "AIza${a(35)}";` },
  "gcp-service-account": { file: "sa.json", line: `{ "type": "service${"_account"}" }` },
  "github-token": { file: "f.ts", line: `const k = "ghp_${a(36)}";` },
  "gitlab-token": { file: "f.ts", line: `const k = "glpat-${a(20)}";` },
  "slack-token": { file: "f.ts", line: `const k = "xoxb-${a(6)}1234567890";` },
  "slack-webhook": { file: "f.ts", line: `const u = "https://hooks.slack.com/services/${a(24)}";` },
  "anthropic-key": { file: "f.ts", line: `const k = "sk-ant-${a(30)}";` },
  "openrouter-key": { file: "f.ts", line: `const k = "sk-or-v1-${a(32)}";` },
  "openai-key": { file: "f.ts", line: `const k = "sk-${a(40)}";` },
  "stripe-key": { file: "f.ts", line: `const k = "sk_live_${a(20)}";` },
  "resend-key": { file: "f.ts", line: `const k = "re_${a(8)}_${a(20)}";` },
  "google-oauth-client-secret": { file: "f.ts", line: `const k = "GOCSPX-${a(24)}";` },
  "google-oauth-refresh-token": { file: "f.ts", line: `const k = "1//0${a(40)}";` },
  "sendgrid-key": { file: "f.ts", line: `const k = "SG.${a(20)}.${a(20)}";` },
  "twilio-key": { file: "f.ts", line: `const k = "SK${hex}";` },
  "npm-token": { file: "f.ts", line: `const k = "npm_${a(36)}";` },
  "vercel-token": { file: "f.ts", line: `${a(24)} is the VERCEL_TOKEN` },
  jwt: { file: "f.ts", line: `const t = "eyJ${a(14)}.eyJ${a(14)}.${a(14)}";` },
  "db-url-with-password": { file: "f.ts", line: `const u = "postgres://u:${a(12)}@db.internal:5432/x";` },
  "generic-assigned-secret": { file: "f.ts", line: `const cfg = { apiKey: "9f3b1c7d2e4a6b8c0d5e" };` },
  // The one the generic rule structurally could not see: an env NAME with an
  // underscore in front of the secret-ish word.
  "app-credential-env": { file: "f.ts", line: `process.env.SKLIK_API_TOKEN = "9f3b1c7d2e4a6b8c0d5e";` },
  "forbidden-file": { file: ".env.local", line: "# nothing secret in here at all\n" },
};

test("every rule the scanner declares has a fixture — the list is closed", () => {
  const declared = ruleNames();
  const covered = Object.keys(FIXTURES);
  assert.deepEqual(
    declared.filter((r) => !covered.includes(r)),
    [],
    "a rule was added to scripts/secret-scan.mjs with no fixture here. A pattern nothing has ever asked to " +
      "fire is indistinguishable from one that no longer can — write the smallest file that trips it."
  );
  assert.deepEqual(
    covered.filter((r) => !declared.includes(r)),
    [],
    "a fixture names a rule the scanner no longer has. If the rule was retired on purpose, retire its fixture " +
      "in the same change and say why in the commit."
  );
});

for (const [rule, { file, line }] of Object.entries(FIXTURES)) {
  test(`the scanner goes red on a ${rule}`, () => {
    const { code, out } = scan(file, `${line}\n`);
    assert.equal(code, 1, `\`${rule}\` did not stop the commit. The scanner said:\n${out}`);
    assert.match(
      out,
      new RegExp(`\\[${rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`),
      `the finding was reported under a different rule than \`${rule}\` — a hit labelled with the wrong ` +
        `vendor sends the rotation at the wrong provider. The scanner said:\n${out}`
    );
  });
}

test("the redaction holds: a finding names the rule and the length, never the value", () => {
  const value = `ghp_${a(36)}`;
  const { code, out } = scan("f.ts", `const k = "${value}";\n`);
  assert.equal(code, 1);
  assert.equal(out.includes(value), false, "the scanner printed the credential it found — its own output is a leak");
});

test("a placeholder is not a credential — the shapes docs and templates are written in stay green", () => {
  const clean = [
    'GEMINI_API_KEY = "your-key-here"',
    'const cfg = { apiKey: process.env.GEMINI_API_KEY };',
    'CRON_SECRET = "<generate one with openssl rand>"',
    'process.env.CATALOG_TOKEN_SECRET = "unit-test-secret-please-ignore";',
    'const label = { token: "the value the client branches on" };',
  ].join("\n");
  const { code, out } = scan("f.ts", `${clean}\n`);
  assert.equal(code, 0, `the scanner fired on a file with no credential in it:\n${out}`);
});

test("`secret-scan:allow` on the line is honoured, and only on that line", () => {
  const marked = scan("f.ts", `const k = "ghp_${a(36)}"; // secret-scan:allow\n`);
  assert.equal(marked.code, 0, `the escape hatch did not suppress the finding:\n${marked.out}`);
  const unmarked = scan("f.ts", `// secret-scan:allow\nconst k = "ghp_${a(36)}";\n`);
  assert.equal(unmarked.code, 1, "the marker suppressed a finding on a DIFFERENT line — it is per-line by design");
});

test("this app's own credential names are covered, and adding one is a one-line diff", () => {
  // The rule is only as good as its list, so the names that can actually spend an
  // advertiser's budget, send mail under the operator's name, or open the six cron
  // endpoints are asserted to be in it.
  for (const name of ["SKLIK_API_TOKEN", "GOOGLE_ADS_DEVELOPER_TOKEN", "RESEND_API_KEY", "CRON_SECRET"]) {
    const { code, out } = scan("f.ts", `const x = { ${name}: "9f3b1c7d2e4a6b8c0d5e" };\n`);
    assert.equal(code, 1, `${name} is not in APP_SECRET_ENV — a leak of it would be caught by nothing:\n${out}`);
  }
});
