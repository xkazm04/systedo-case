#!/usr/bin/env node
/** ADR structure gate — keeps `docs/adr/` a record an agent can rely on rather
 *  than a folder of prose that quietly rots.
 *
 *  Runs as part of `npm run check:ci` (so: every CI run, and every local
 *  pre-push check). Exit non-zero fails the gate. What it enforces:
 *
 *    1. File naming — `NNNN-kebab-slug.md`, four-digit, numbers unique.
 *    2. Title      — first heading is `# ADR-NNNN — <title>`, number matching
 *                    the filename (so a copy-pasted ADR cannot keep the source's
 *                    number).
 *    3. Sections   — every ADR carries `## Status`, `## Context`, `## Decision`
 *                    and `## Consequences`, and Status names a known state.
 *    4. Index      — `docs/adr/README.md` links every ADR exactly once, and
 *                    links nothing that is missing. A new ADR that nobody
 *                    indexed is invisible to the agent reading the index, so
 *                    that is a failure, not a warning.
 *    5. Live paths — every repo path cited in inline code inside an ADR still
 *                    exists. This is the check that matters over time: an ADR
 *                    describing a seam that has since been renamed is worse than
 *                    no ADR, and a rename is exactly when nobody thinks to look
 *                    here. Tokens containing `*` are treated as globs and skipped.
 *
 *  Usage:  node scripts/adr-check.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADR_DIR = join(ROOT, "docs", "adr");
const INDEX_NAME = "README.md";

const FILE_RE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const TITLE_RE = /^#\s+ADR-(\d{4})\s+—\s+\S/;
const REQUIRED_SECTIONS = ["## Status", "## Context", "## Decision", "## Consequences"];
const KNOWN_STATUS = ["Accepted", "Proposed", "Superseded", "Deprecated"];
// A path-looking inline-code token: a known top-level directory plus a relative
// path. Root files (`Dockerfile`, `vercel.json`) are deliberately NOT matched —
// requiring a slash keeps env names and identifiers out of the path check.
const PATH_RE = /^(?:src|scripts|docs|test-unit|test-llm|tests|uat|public|\.github|\.claude)\/[A-Za-z0-9._[\]\-/]+$/;

const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(ADR_DIR)) {
  console.error(`✗ ADR gate: ${ADR_DIR} does not exist.`);
  process.exit(1);
}

const entries = readdirSync(ADR_DIR).filter((f) => f.endsWith(".md") && f !== INDEX_NAME);
if (entries.length === 0) fail("docs/adr/ holds no ADRs — an empty record is not a record.");

const numbers = new Map();

for (const file of entries) {
  const m = FILE_RE.exec(file);
  if (!m) {
    fail(`${file}: name must be NNNN-kebab-slug.md`);
    continue;
  }
  const number = m[1];
  if (numbers.has(number)) fail(`${file}: ADR number ${number} is already used by ${numbers.get(number)}`);
  else numbers.set(number, file);

  const text = readFileSync(join(ADR_DIR, file), "utf8");
  const lines = text.split(/\r?\n/);

  const heading = lines.find((l) => l.startsWith("# "));
  if (!heading || !TITLE_RE.test(heading)) {
    fail(`${file}: first heading must read "# ADR-${number} — <title>" (em dash), got ${heading ?? "(none)"}`);
  } else if (TITLE_RE.exec(heading)[1] !== number) {
    fail(`${file}: heading says ADR-${TITLE_RE.exec(heading)[1]} but the filename says ${number}`);
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!lines.some((l) => l.trim() === section)) fail(`${file}: missing required section "${section}"`);
  }

  const statusIdx = lines.findIndex((l) => l.trim() === "## Status");
  if (statusIdx !== -1) {
    const statusLine = lines.slice(statusIdx + 1).find((l) => l.trim() !== "");
    const named = KNOWN_STATUS.some((s) => (statusLine ?? "").trim().startsWith(s));
    if (!named) {
      fail(`${file}: Status must start with one of ${KNOWN_STATUS.join(" / ")}, got ${JSON.stringify(statusLine ?? "")}`);
    }
  }

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim();
    if (token.includes("*") || !PATH_RE.test(token)) continue;
    if (!existsSync(join(ROOT, token))) fail(`${file}: cites \`${token}\`, which does not exist in the tree`);
  }
}

// --- index parity -----------------------------------------------------------
const indexPath = join(ADR_DIR, INDEX_NAME);
if (!existsSync(indexPath)) {
  fail("docs/adr/README.md is missing — the index is how an agent finds these at all.");
} else {
  const index = readFileSync(indexPath, "utf8");
  const linked = [...index.matchAll(/\]\((\d{4}-[a-z0-9-]+\.md)\)/g)].map((m) => m[1]);
  for (const file of entries) {
    const hits = linked.filter((l) => l === file).length;
    if (hits === 0) fail(`${file}: not linked from docs/adr/README.md`);
    if (hits > 1) fail(`${file}: linked ${hits} times from docs/adr/README.md`);
  }
  for (const link of new Set(linked)) {
    if (!entries.includes(link)) fail(`docs/adr/README.md links ${link}, which does not exist`);
  }
}

if (failures.length) {
  console.error(`\n✗ ADR gate: ${failures.length} problem(s)\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error("");
  process.exit(1);
}

console.log(`✓ ADR gate: ${entries.length} record(s), indexed, sectioned, and every cited path still exists.`);
