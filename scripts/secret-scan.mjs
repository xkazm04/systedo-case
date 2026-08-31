#!/usr/bin/env node
/** Zero-dependency staged-secret scanner — the FALLBACK half of the pre-commit
 *  secret guard (.husky/pre-commit).
 *
 *  Secret scanning is the one supply-chain guardrail that PREVENTS a leak rather
 *  than reporting one, which is why it belongs in the hook and not only in CI. The
 *  hook prefers `gitleaks` when it is on PATH; this script is what runs when it is
 *  not, so the guard is never simply absent on a machine that never installed it.
 *
 *  HONEST LIMITS — read these before trusting it:
 *   - It is a pattern matcher over ~24 well-known credential shapes, plus two
 *     NAME-keyed rules: the generic secret-ish assignment, and this app's own env
 *     names (APP_SECRET_ENV below). gitleaks ships 150+ rules and an entropy
 *     model; this catches the common cases, not the clever ones.
 *   - What it will NOT see: a credential stored under a name nobody added to
 *     APP_SECRET_ENV, and any opaque token pasted as a bare string with no name
 *     next to it. Both are why the hook prefers gitleaks when it is installed.
 *   - It scans the STAGED blob (`git show :path`), which is what is about to be
 *     committed — not the working tree, and not history. History is CI's job
 *     (.github/workflows/supply-chain.yml runs a full-history gitleaks scan).
 *   - Binary and very large blobs are skipped.
 *   - It is a ratchet against accident, not a control against intent: anyone who
 *     wants to commit a secret can rename it, split it, or pass --no-verify.
 *
 *  Escape hatch: put `secret-scan:allow` on the same line (a test fixture, a
 *  documented public key). Use it sparingly — every use is a claim.
 *
 *  Usage:  node scripts/secret-scan.mjs [--all] [paths…]
 *          (default: staged files; --all: every tracked file)
 *          node scripts/secret-scan.mjs --rules      # the rule names, one per line
 *
 *  Proven from the other side by test-unit/secret-scan-sensitivity.test.mjs: every
 *  rule listed by `--rules` has a fixture this script must go red on, and a clean
 *  file it must stay green on. Blocking, inside `npm run test:unit`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const ALL = argv.includes("--all");
const explicit = argv.filter((a) => !a.startsWith("--"));

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });

/** Paths whose content is expected to look secret-ish or is not source at all. */
const SKIP_PATH = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)\.gitleaksignore$/,
  /(^|\/)scripts\/secret-scan\.mjs$/, // this file's own patterns
  /^\.claude\//, // vendored agent tooling, not this app's source
  /\.env\.(example|sample)$/, // a template of env NAMES is the point of the file
  /\.(png|jpe?g|gif|webp|avif|ico|svg|pdf|woff2?|ttf|otf|mp4|zip|gz)$/i,
];

/** Never commit these at all, whatever is inside them. */
const FORBIDDEN_PATH = [/(^|\/)\.env(\.|$)/, /(^|\/)serviceAccount.*\.json$/i, /\.pem$/, /\.p12$/, /\.pfx$/];
const FORBIDDEN_PATH_ALLOW = [/\.env\.example$/, /\.env\.sample$/];

/** THIS APPLICATION'S OWN credentials, by env NAME.
 *
 *  A generic pattern set is written for the shapes it can recognise — an `AIza…`,
 *  an `sk-ant-…`, a JWT. Three of the credentials this repository actually holds
 *  have no recognisable shape at all: a Sklik API token, a Google Ads developer
 *  token and a `CRON_SECRET` are opaque strings, and no rule keyed on the VALUE
 *  will ever see one. What identifies them is the NAME they are assigned to.
 *
 *  And the generic rule below could not see them either, for a reason worth
 *  writing down: its `\bapi[_-]?key\b` needs a word boundary, and `_` is a word
 *  character — so `GEMINI_API_KEY = "…"` never matched `api_key`, and neither did
 *  `SKLIK_API_TOKEN`, `BYOM_KEY_SECRET` or any other `PREFIX_NAME` env assignment,
 *  which is the exact spelling every credential in this app is written in.
 *
 *  Mined from `.env.example` and every `process.env.*` read in src/ and scripts/.
 *  Adding a secret-bearing env var means adding it here. */
const APP_SECRET_ENV = [
  "ADAMANT_OPERATOR_PASSWORD",
  "ANTHROPIC_API_KEY",
  "AUTH_SECRET",
  "BYOM_KEY_SECRET",
  "CATALOG_TOKEN_SECRET",
  "CRON_SECRET",
  "GEMINI_API_KEY",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_CLIENT_SECRET",
  "LEONARDO_API_KEY",
  "LIGHTTRACK_KEY",
  "LINKEDIN_CLIENT_SECRET",
  "META_APP_SECRET",
  "NEXTAUTH_SECRET",
  "RESEND_API_KEY",
  "SKLIK_API_TOKEN",
  "WEBHOOK_SECRET_KEY",
];

/** name → regex. Ordered roughly by confidence. */
const RULES = [
  ["private-key-block", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ["aws-access-key-id", /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["gcp-service-account", /"type"\s*:\s*"service_account"/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["gitlab-token", /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ["slack-token", /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ["slack-webhook", /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/+]{20,}/],
  // The two `sk-` vendors go BEFORE the OpenAI rule: `sk-ant-…` and `sk-or-v1-…`
  // both satisfy `sk-[A-Za-z0-9_-]{32,}`, one finding is reported per line, and a
  // hit labelled with the wrong vendor sends the rotation at the wrong provider.
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{24,}\b/],
  ["openrouter-key", /\bsk-or-v1-[A-Za-z0-9]{32,}\b/],
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["stripe-key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  // The four this app is actually issued, by shape. `re_<id>_<secret>` is Resend
  // (transactional mail from `schranka`), `GOCSPX-` is the Google OAuth client
  // secret and `1//0…` a Google refresh token — the two halves of the Google Ads
  // credential pair, which is the one credential here that can spend money.
  ["resend-key", /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}\b/],
  ["google-oauth-client-secret", /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/],
  ["google-oauth-refresh-token", /\b1\/\/0[A-Za-z0-9_-]{30,}/],
  ["sendgrid-key", /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/],
  ["twilio-key", /\bSK[0-9a-fA-F]{32}\b/],
  ["npm-token", /\bnpm_[A-Za-z0-9]{36}\b/],
  ["vercel-token", /\b[A-Za-z0-9]{24}\b(?=[^\n]{0,40}VERCEL_TOKEN)/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ["db-url-with-password", /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]{6,}@/],
  // Generic: a secret-ish NAME assigned a long, non-placeholder literal. The
  // placeholder guard is what keeps .env.example and docs quiet.
  [
    "generic-assigned-secret",
    /\b(?:api[_-]?key|secret|passwd|password|token|private[_-]?key|client[_-]?secret|access[_-]?key)\b\s*[:=]\s*["'`]([^"'`\n]{16,})["'`]/i,
  ],
  // One of THIS app's env names, assigned a quoted literal. Same placeholder guard
  // as the generic rule, which is what keeps the suite's own fixtures
  // (`process.env.CRON_SECRET = "cron-secret-under-test"`) quiet: a value with no
  // digit in it is not a credential. A quote is required — an unquoted right-hand
  // side is an expression (`= before`, `= process.env.X`), never a literal.
  [
    "app-credential-env",
    new RegExp(`\\b(?:${APP_SECRET_ENV.join("|")})\\b\\s*[:=]\\s*["'\`]([^"'\`\\n]{12,})["'\`]`),
  ],
];

/** Rules whose hit is only a finding if the value LOOKS like a credential. Both
 *  are name-keyed rather than shape-keyed, so the value is whatever a developer
 *  wrote there — prose, a fixture, an expression — and the guard is the whole
 *  difference between a scanner people keep and one they start passing
 *  `--no-verify` around. */
const PLACEHOLDER_GUARDED = new Set(["generic-assigned-secret", "app-credential-env"]);

/** `--rules`: every rule this scanner has, one per line.
 *
 *  A pattern matcher's quiet failure is a rule that stops matching anything — a
 *  regex edited past the shape it was written for reads exactly like a shape that
 *  never occurs. So the list is machine-readable, and
 *  test-unit/secret-scan-sensitivity.test.mjs reads it back and requires EVERY
 *  name here to have a fixture that this script goes red on. A rule added without
 *  one fails the unit suite; a rule that has quietly stopped matching fails it
 *  too. */
if (argv.includes("--rules")) {
  for (const [name] of RULES) console.log(name);
  console.log("forbidden-file");
  process.exit(0);
}

/** Values that are obviously not real credentials. */
const PLACEHOLDER =
  /^(?:[x*.]{3,}|<[^>]+>|\$\{[^}]+\}|process\.env\.|your[_-]|example|changeme|placeholder|dummy|fake|sample|demo|unit[_-]?test|test[_-]?(?:key|token|secret)|redacted|sk-fake|todo|null|undefined|true|false)/i;

/** The generic rule is the noisy one, so its value must LOOK like a credential:
 *  one token, no whitespace, and mixed letters+digits. That single predicate is
 *  what keeps English prose ("token: the value the client branches on"), string
 *  concatenation (`"token=" + encodeURI(x)`) and lowercase identifiers out of the
 *  report — the three false-positive families a first version reported. */
function isPlaceholder(value) {
  const v = value.trim();
  if (PLACEHOLDER.test(v)) return true;
  if (/\s/.test(v)) return true; // prose or an expression, not a credential
  if (/[{}$+()]/.test(v)) return true; // template / interpolation / concatenation
  if (!/[0-9]/.test(v) || !/[A-Za-z]/.test(v)) return true; // credentials mix both
  if (/^[a-z_.-]+$/.test(v)) return true; // a lowercase identifier
  return false;
}

function stagedPaths() {
  if (explicit.length) return explicit;
  const args = ALL
    ? ["ls-files"]
    : ["diff", "--cached", "--name-only", "--diff-filter=ACM"];
  return git(args).split("\n").map((s) => s.trim()).filter(Boolean);
}

function contentOf(path) {
  try {
    // Staged mode reads the INDEX blob (`git show :path`) — that is what is about
    // to be committed, which can differ from the working tree. --all / explicit
    // paths read the working tree directly: one process instead of one `git show`
    // per file turns a ~1 000-file sweep from minutes into under a second.
    const buf =
      ALL || explicit.length
        ? readFileSync(path)
        : execFileSync("git", ["show", `:${path}`], { encoding: "buffer", maxBuffer: 1 << 26 });
    if (buf.length > 2_000_000) return null;
    if (buf.includes(0)) return null; // binary
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

const findings = [];
for (const path of stagedPaths()) {
  if (SKIP_PATH.some((re) => re.test(path))) continue;

  if (FORBIDDEN_PATH.some((re) => re.test(path)) && !FORBIDDEN_PATH_ALLOW.some((re) => re.test(path))) {
    findings.push({ path, line: 0, rule: "forbidden-file", excerpt: "this file class must never be committed" });
    continue;
  }

  const src = contentOf(path);
  if (src === null) continue;

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("secret-scan:allow") || line.includes("gitleaks:allow")) continue;
    if (line.length > 4000) continue;
    for (const [rule, re] of RULES) {
      const m = re.exec(line);
      if (!m) continue;
      if (PLACEHOLDER_GUARDED.has(rule) && isPlaceholder(m[1])) continue;
      const hit = (m[1] ?? m[0]).trim();
      findings.push({
        path,
        line: i + 1,
        rule,
        excerpt: hit.length > 12 ? `${hit.slice(0, 6)}…${hit.slice(-4)} (${hit.length} chars)` : hit,
      });
      break; // one finding per line is enough to stop the commit
    }
  }
}

if (findings.length === 0) {
  process.exit(0);
}

console.error(`\n✖ secret-scan: ${findings.length} possible credential(s) in the staged change:\n`);
for (const f of findings) {
  console.error(`  ${f.path}:${f.line}  [${f.rule}]  ${f.excerpt}`);
}
console.error(
  `\nNothing has been committed. If a hit is a false positive, add \`secret-scan:allow\` on that line.\n` +
    `If it is real: do NOT just unstage it — rotate the credential, it has been on disk.\n`
);
process.exit(1);
