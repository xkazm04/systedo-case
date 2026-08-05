#!/usr/bin/env node
/** i18n coverage + leftover-source audit for the colocated `T` table catalog.
 *
 *  There is no parity script in this repo — `TDict` makes structural parity a
 *  typecheck error (see docs/i18n/contract.md). What typecheck CANNOT see is a
 *  key whose translated value was never actually written: the fallback is
 *  `dict[locale] ?? dict.en`, so a cs gap silently renders English. This script
 *  is that missing check, plus the coverage gap (user-facing strings that never
 *  reached a `T` table at all).
 *
 *  Reported:
 *    - coverage : files rendering hardcoded Czech outside any `T` table
 *    - leftover : cs values byte-identical to en, minus the Do-Not-Translate list
 *    - register : tykání in the cs column (constructions-cs.md § CS-REGISTER)
 *
 *  Usage:  node scripts/i18n-audit.mjs [--json] [--corpus <path>]
 *
 *  NOTE on parsing: many tables close with `} as const;`, not `};`. A parser
 *  that looks for a literal "\n};" silently reports every string in those tables
 *  as hardcoded — brace-match instead. That bug inflated the first run of this
 *  audit from 234 findings to 1 910.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const JSON_OUT = process.argv.includes("--json");

/** Czech-specific letters — the cheapest reliable "this is Czech" signal. */
const CZ = /[ěščřžýáíéúůňťďóĚŠČŘŽÝÁÍÉÚŮŇŤĎÓ]/;

/** Values that are legitimately identical in both columns (contract.md). */
const DNT =
  /^(PNO|CAC|LTV|PPC|SEO|CTR|ROAS|RSA|CPC|UX|CPL|CPQL|SKU|ARPU|RPM|POAS|AOV|CSV|JSON|API|URL|GA4|PMax|A\/B|LTV\s*[:/]\s*CAC|Google(\s+Ads)?|Sklik|Gemini|Firestore|SQLite|Adamant|Systedo|OpenAI|Claude|OpenRouter|Meta|LinkedIn|Facebook|Instagram|TikTok|YouTube|Reddit|Discord|Slack|X|Trend|Detail|Reset|Online|Model|Markdown|Brief|Lead|Dashboard|Portfolio|Challenger|Autopilot|Index|Desktop|Mobile|Pill|Sparkline|DeltaBadge|Eyebrow|Chokepoint|demo|disabled|interval|link|relevance)$/i;

/** Files whose two columns are identical by design. */
const AUDIT_EXEMPT = [/design-system\/page\.tsx$/];

/** 2nd-person-singular forms — `\w` is ASCII-only in JS, so `ž`/`ř` create false
 *  word boundaries; use explicit Unicode-aware guards instead of `\b`. */
const W = "A-Za-zÀ-ž0-9_";
const TYKANI = new RegExp(
  `(?<![${W}])(vyber|klikni|zadej|napiš|zkus|otevři|přidej|nastav|zvol|pošli|smaž|uprav|začni|nech|tvůj|tvoje|tvoji|tvých|tvá|tvému|tvém)(?![${W}])`,
  "i"
);

/** Brace-matched ranges of every locale table in a file.
 *
 *  Identified by CONTENT, not by name: a block qualifies only if it contains
 *  both a `cs: {` and an `en: {` column. Matching on the identifier instead is a
 *  trap — `const LEGAL_TEXT = {` contains a capital T, so a name-based pattern
 *  swallows the whole constant and masks every string inside it. That silently
 *  hid the two largest coverage gaps in the repo (LegalSections, 49 strings;
 *  LocalSeoShowcase, 32) by reporting them as already-localized. */
function tableRanges(src) {
  const out = [];
  const re = /(?:const|export const)\s+[A-Za-z0-9_]+\s*(?::[^=]+)?=\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    const block = src.slice(m.index, i);
    if (/\bcs:\s*\{/.test(block) && /\ben:\s*\{/.test(block)) out.push([m.index, i]);
    re.lastIndex = i;
  }
  return out;
}

function localeColumn(block, locale) {
  const start = block.indexOf(`${locale}: {`);
  if (start < 0) return null;
  let i = block.indexOf("{", start);
  let depth = 0;
  let end = i;
  for (; i < block.length; i++) {
    if (block[i] === "{") depth++;
    else if (block[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const out = {};
  for (const mm of block.slice(start, end).matchAll(
    /^\s*([A-Za-z0-9_]+):\s*(["'`])((?:\\.|(?!\2)[\s\S])*?)\2\s*,?\s*$/gm
  ))
    out[mm[1]] = mm[3];
  return out;
}

/** A `T` table can live in any module (e.g. lib/lead-quality/compute.ts,
 *  components/app/modules/profit/strings.ts), so the pair/leftover/register scan
 *  reads everything. */
const files = execSync(`git -C "${ROOT}" ls-files "src/*.tsx" "src/*.ts"`, { encoding: "utf8" })
  .trim()
  .split("\n");

/** The COVERAGE scan is narrower: only the render layer. Per contract.md,
 *  LLM prompts, fixtures, validators and route internals are Czech on purpose
 *  and must never be externalized — scanning them reports ~2 000 false
 *  findings and buries the ~230 real ones. */
const RENDER_LAYER = /^src\/(app|components)\/.*\.tsx$/;
const NOT_USER_FACING = [
  /^src\/app\/_dev-inspector\//,
  /^src\/app\/design-system\//,
  /opengraph-image\.tsx$/,
];
const isRenderLayer = (rel) =>
  RENDER_LAYER.test(rel) && !NOT_USER_FACING.some((re) => re.test(rel));

const coverage = [];
const leftover = [];
const register = [];
let pairs = 0;
let adopters = 0;

for (const rel of files) {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  const ranges = tableRanges(src);
  if (/\buseT\(|\bgetT\(|getMessages/.test(src)) adopters++;
  const exempt = AUDIT_EXEMPT.some((re) => re.test(rel));

  for (const [s, e] of ranges) {
    const block = src.slice(s, e);
    const cs = localeColumn(block, "cs");
    const en = localeColumn(block, "en");
    if (!cs || !en) continue;
    for (const [k, csv] of Object.entries(cs)) {
      if (en[k] === undefined) continue;
      pairs++;
      if (TYKANI.test(csv) && !/[„"“]/.test(csv)) register.push({ rel, key: k, cs: csv });
      if (
        !exempt &&
        csv === en[k] &&
        !DNT.test(csv.trim()) &&
        csv.replace(/[^A-Za-zÀ-ž]/g, "").length > 3
      )
        leftover.push({ rel, key: k, value: csv });
    }
  }

  // Czech strings living outside every T table — render layer only.
  if (!isRenderLayer(rel)) continue;
  let masked = src;
  for (const [s, e] of ranges) masked = masked.slice(0, s) + " ".repeat(e - s) + masked.slice(e);
  masked = masked
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];/gm, "");
  const hard = new Set();
  for (const m of masked.matchAll(/>\s*([^<>{}\n]{3,}?)\s*</g))
    if (CZ.test(m[1])) hard.add(m[1].trim());
  for (const m of masked.matchAll(/["'`]([^"'`\n]{4,})["'`]/g))
    if (CZ.test(m[1])) hard.add(m[1].trim());
  if (hard.size) coverage.push({ rel, count: hard.size, strings: [...hard] });
}

const report = { pairs, adopters, files: files.length, coverage, leftover, register };

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const n = (x) => String(x).padStart(5);
  console.log(`\ni18n audit — ${files.length} source files, ${adopters} adopters, ${pairs} cs/en pairs\n`);
  console.log(`${n(coverage.reduce((a, r) => a + r.count, 0))}  hardcoded cs strings outside any T table  (${coverage.length} files)`);
  console.log(`${n(leftover.length)}  cs values identical to en, excluding do-not-translate`);
  console.log(`${n(register.length)}  tykání in the cs column (CS-REGISTER)\n`);

  if (coverage.length) {
    console.log("── coverage gap ──");
    for (const r of coverage.sort((a, b) => b.count - a.count).slice(0, 20))
      console.log(`${n(r.count)}  ${r.rel}`);
    if (coverage.length > 20) console.log(`       … and ${coverage.length - 20} more files`);
  }
  if (leftover.length) {
    console.log("\n── leftover source ──");
    for (const r of leftover) console.log(`       ${r.rel} · ${r.key} = ${JSON.stringify(r.value)}`);
  }
  if (register.length) {
    console.log("\n── register breaks ──");
    for (const r of register) console.log(`       ${r.rel} · ${r.key}\n         ${r.cs}`);
  }
  console.log();
}

const failed = leftover.length + register.length;
if (process.argv.includes("--check") && failed > 0) process.exit(1);
