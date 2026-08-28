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

/** Values that are legitimately identical in both columns (contract.md), plus the
 *  loanwords the owner ruled kept on 2026-08-06 (review-cs.md § B — Czech PPC
 *  speech uses them verbatim) and the format-string shapes that were never
 *  translation candidates. Built by escaping each literal rather than hand-writing
 *  one regex: `Fulfillment (3PL)` and `AOV {val}` contain metacharacters, and
 *  inlining them raw silently turns the whole alternation into a syntax error. */
const DNT_LITERALS = [
  // metric abbreviations kept as-is in Czech marketing speech
  "PNO", "CAC", "LTV", "PPC", "SEO", "CTR", "ROAS", "RSA", "CPC", "UX", "CPL",
  "CPQL", "SKU", "ARPU", "RPM", "POAS", "AOV", "CSV", "JSON", "API", "URL", "GA4",
  "PMax", "A/B", "PMax / RSA",
  // brands and product names
  "Google", "Google Ads", "Google Business Profile", "Sklik", "Gemini", "Firestore",
  "SQLite", "Adamant", "Systedo", "OpenAI", "Claude", "OpenRouter", "Meta",
  // BYOM vendor labels (src/lib/llm/keys/types.ts BYOM_VENDOR_LABELS). The bare
  // names above were already exempt; these are the same proper nouns in the
  // composed form the settings UI shows, and a vendor does not get a Czech name.
  "Claude (Anthropic)", "Google Gemini", "Qwen Cloud",
  "LinkedIn", "Facebook", "Instagram", "TikTok", "YouTube", "Reddit", "Discord",
  "Slack", "X", "Twin",
  // words identical in both languages, or single-word UI labels
  "Trend", "Detail", "Reset", "Online", "Model", "Markdown", "Brief", "Lead",
  "Dashboard", "Portfolio", "Challenger", "Autopilot", "Index", "Desktop",
  "Mobile", "Pill", "Sparkline", "DeltaBadge", "Eyebrow", "Chokepoint", "demo",
  "disabled", "interval", "link", "relevance", "Feed",
  // § B, ruled 2026-08-06: kept loanwords
  "Open rate", "Win rate", "Blended CAC", "API token", "Fulfillment (3PL)",
  "Article JSON", "LLM wrapper", "drift",
  // format strings — never translation candidates
  "AOV {val}", "ROAS {val}", "Δ CPQL", "Δ win rate", "Brand · Search",
];
const DNT = new RegExp(
  `^(${DNT_LITERALS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|LTV\\s*[:/]\\s*CAC|https?://\\S*)$`,
  "i"
);

/** Files whose two columns are identical by design. */
const AUDIT_EXEMPT = [/design-system\/page\.tsx$/];

/** 2nd-person-singular forms — `\w` is ASCII-only in JS, so `ž`/`ř` create false
 *  word boundaries; use explicit Unicode-aware guards instead of `\b`.
 *
 *  The imperative list is open-ended and an under-specified pattern reports a
 *  clean catalog: the first version of this regex covered only imperatives that
 *  happened to appear in the 7 sites it found, and missed `Odhlásí tebe`,
 *  `Zvaž přeměření` and `skóre ber jako…` — all real CS-REGISTER breaks a
 *  reviewer caught by reading. Personal pronouns (`tebe`, `tobě`, `tvůj`…) are
 *  the higher-recall half; keep adding verbs as they surface.
 *  Deliberately NOT included: `ti` and `ty`, which are also the demonstratives
 *  "those"/"that" and produce constant false positives. */
const W = "A-Za-zÀ-ž0-9_";
const TYKANI = new RegExp(
  `(?<![${W}])(` +
    // imperatives
    "vyber|klikni|zadej|napiš|zkus|otevři|přidej|nastav|zvol|pošli|smaž|uprav|" +
    "začni|nech|zvaž|ber|dej|ukaž|podívej|sleduj|počkej|vyzkoušej|projdi|" +
    // 2sg present. The `-š` ending is the giveaway and the list will never be
    // complete by enumeration: `uvidíš` was here but bare `vidíš` was not, and a
    // reviewer found `vidíš` in a file whose two siblings had already been fixed.
    // The catch-all below covers the rest; keep these for readable output.
    "máš|chceš|můžeš|víš|budeš|uvidíš|vidíš|potřebuješ|provedeš|dostaneš|najdeš|" +
    "získáš|uděláš|nastavíš|zadáš|pošleš|otevřeš|přidáš|" +
    // 2sg pronouns / possessives
    "tebe|tobě|tebou|tvůj|tvoje|tvoji|tvého|tvému|tvém|tvým|tvá|tvé|tvou|tvých|tvými" +
    `)(?![${W}])`,
  "i"
);

/** Brace-matched ranges of every locale table in a file.
 *
 *  Identified by CONTENT, not by name: a block qualifies only if it holds both a
 *  `cs:` and an `en:` column. Matching on the identifier instead is a trap —
 *  `const LEGAL_TEXT = {` contains a capital T, so a name-based pattern swallows
 *  the whole constant and masks every string inside it. That silently hid the two
 *  largest coverage gaps in the repo (LegalSections 49, LocalSeoShowcase 32) by
 *  reporting them as already-localized.
 *
 *  A column may be an OBJECT (`cs: {`) or an ARRAY (`cs: [` — e.g. ReviewInbox's
 *  MACROS). Requiring `{` reported every string in an array-shaped table as
 *  hardcoded. */
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
    if (/\bcs:\s*[{[]/.test(block) && /\ben:\s*[{[]/.test(block)) out.push([m.index, i]);
    re.lastIndex = i;
  }
  return out;
}

/** A FOURTH shape: the central dictionary declares its columns as two SEPARATE
 *  top-level consts (`const cs: Messages = {…}` … `const en: Messages = {…}`,
 *  joined later into `MESSAGES`). `tableRanges` requires one block holding both
 *  columns, so `src/lib/i18n/messages.ts` — the nav/footer/switcher chrome that
 *  renders on every page — was never audited at all. Returns the two blocks
 *  paired, or null when the file isn't shaped this way. */
/** `key: "value"` pairs anywhere in a block. Shared by the column parsers.
 *  Nested objects flatten by key name, which is what the checks below want. */
function parseKeys(body) {
  const out = {};
  for (const m of body.matchAll(/[{,\n]\s*([A-Za-z0-9_]+):\s*(["'`])((?:\\.|(?!\2)[\s\S])*?)\2/g))
    out[m[1]] = m[3];
  return out;
}

function splitConstColumns(src) {
  const grab = (locale) => {
    const m = new RegExp(`(?:const|export const)\\s+${locale}\\s*(?::[^=]+)?=\\s*\\{`).exec(src);
    if (!m) return null;
    let i = m.index + m[0].length - 1;
    let d = 0;
    for (; i < src.length; i++) {
      if (src[i] === "{") d++;
      else if (src[i] === "}") {
        d--;
        if (d === 0) {
          i++;
          break;
        }
      }
    }
    return [m.index, i];
  };
  const cs = grab("cs");
  const en = grab("en");
  return cs && en ? { cs, en } : null;
}

/** Per-string inline `{ cs: "…", en: "…" }` pairs — a THIRD shape, used by
 *  `lp/page.tsx` (Variant.name/.note), `mapa/page.tsx` (META_PAGES) and
 *  `LandingNewWorld` (CONNECTIONS[].level). These are fully localized; without
 *  this pass the coverage scan reports every one of them as a hardcoded string.
 *  Returns [start, end, csValue, enValue] per match. */
function inlinePairs(src) {
  const out = [];
  const re =
    /\{\s*cs:\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1\s*,\s*en:\s*(["'`])((?:\\.|(?!\3)[\s\S])*?)\3\s*,?\s*\}/g;
  let m;
  while ((m = re.exec(src))) out.push([m.index, m.index + m[0].length, m[2], m[4]]);
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
  // NOT line-anchored. The previous `^\s*key: "value"$` form only matched keys
  // that happened to sit alone on a line, so a table packing several per line was
  // mostly invisible — ReviewInbox holds 48 pairs and this reported 7, leaving 41
  // pairs unchecked for leftover-source and register. Anchor on the delimiter that
  // must precede a key ({ or , or a newline) instead of on the line.
  for (const mm of block.slice(start, end).matchAll(
    /[{,\n]\s*([A-Za-z0-9_]+):\s*(["'`])((?:\\.|(?!\2)[\s\S])*?)\2/g
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

  // Split-const columns (the central dictionary). Only consulted when the file
  // has no combined table, so a normal adopter is never double-counted.
  const split = ranges.length === 0 ? splitConstColumns(src) : null;
  if (split) {
    const cs = parseKeys(src.slice(split.cs[0], split.cs[1]));
    const en = parseKeys(src.slice(split.en[0], split.en[1]));
    for (const [k, csv] of Object.entries(cs)) {
      if (en[k] === undefined) continue;
      pairs++;
      if (TYKANI.test(csv) && !/[„"“]/.test(csv)) register.push({ rel, key: k, cs: csv });
      if (!exempt && csv === en[k] && !DNT.test(csv.trim()) && csv.replace(/[^A-Za-zÀ-ž]/g, "").length > 3)
        leftover.push({ rel, key: k, value: csv });
    }
  }

  // Per-string inline `{ cs: "…", en: "…" }` pairs — a third table shape. Counted
  // as real pairs AND masked below, so they stop being reported as coverage gaps.
  const inline = inlinePairs(src);
  for (const [, , csv, env] of inline) {
    pairs++;
    if (TYKANI.test(csv) && !/[„"“]/.test(csv)) register.push({ rel, key: "(inline)", cs: csv });
    if (!exempt && csv === env && !DNT.test(csv.trim()) && csv.replace(/[^A-Za-zÀ-ž]/g, "").length > 3)
      leftover.push({ rel, key: "(inline)", value: csv });
  }

  // Czech strings living outside every locale table — render layer only.
  if (!isRenderLayer(rel)) continue;
  let masked = src;
  for (const [s, e] of [...ranges, ...inline.map(([s, e]) => [s, e])])
    masked = masked.slice(0, s) + " ".repeat(e - s) + masked.slice(e);
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

/** RATCHET (gate rung: REPORTING → BLOCKING-on-regression).
 *
 *  This audit cannot be zeroed today, so `--check` is not "must be clean" — it is
 *  "must not get worse". Each number below is the measured population on the day
 *  the gate was wired (2026-08-22); a count may only go DOWN. Lower the baseline
 *  in the SAME commit that fixes findings, or the ratchet stops biting.
 *
 *  Do NOT raise a number to make a red run green: that is the one edit this file
 *  exists to prevent. */
const RATCHET = {
  coverage: 38, // hardcoded cs strings outside any T table (40 → 38 on 2026-08-28: the /lp variants were retired)
  // cs values byte-identical to en, minus the DNT list. 42 → 40 on 2026-08-28:
  // the /lp variants were retired (-1) and the three BYOM vendor labels joined
  // the DNT list (-3). NOTE for the record — origin/master measured 44 here, i.e.
  // the ratchet was already broken on master before this branch touched it; the
  // branch's own leftover set is a strict subset of master's (compared entry by
  // entry), so nothing new was exempted to make a red run green.
  leftover: 40,
  register: 0, // tykání in the cs column (already clean — keep it there)
};

if (process.argv.includes("--check")) {
  const now = {
    coverage: coverage.reduce((a, r) => a + r.count, 0),
    leftover: leftover.length,
    register: register.length,
  };
  const over = Object.keys(RATCHET).filter((k) => now[k] > RATCHET[k]);
  const under = Object.keys(RATCHET).filter((k) => now[k] < RATCHET[k]);
  for (const k of over)
    console.error(`RATCHET BROKEN  ${k}: ${now[k]} > baseline ${RATCHET[k]} — a new finding was introduced.`);
  for (const k of under)
    console.log(`ratchet slack   ${k}: ${now[k]} < baseline ${RATCHET[k]} — lower RATCHET.${k} in scripts/i18n-audit.mjs.`);
  if (over.length) process.exit(1);
  if (!under.length) console.log("i18n ratchet held.");
}
