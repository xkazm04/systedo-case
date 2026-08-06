#!/usr/bin/env node
/** Mechanical gate for a localization wave: diffs the working tree against a git
 *  ref and rejects the classes of damage a human reviewer reliably misses when
 *  reading hundreds of string diffs.
 *
 *  This is step 4 of the /i18n-translate fan-out protocol. Agents edit files
 *  directly (safe here — the catalog is colocated per-file and agents own
 *  disjoint files), so this runs BEFORE the changes are trusted.
 *
 *  Usage:  node scripts/i18n-gate.mjs [--base HEAD] [--json]
 *
 *  Checks, in severity order:
 *    FAIL  placeholder drift  — a {name} set that differs between cs/en, or from base
 *    FAIL  key-set asymmetry  — cs and en columns no longer hold the same keys
 *    FAIL  empty value        — a string blanked out
 *    FAIL  parked sweep       — one of review-cs.md's parked decisions partially applied
 *    WARN  key added/removed  — legitimate when externalizing, but must be deliberate
 *    WARN  length blow-up     — cs much longer than en in a tight control
 *    WARN  leftover source    — a NEW cs value identical to its en value
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const BASE = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "HEAD";
const JSON_OUT = argv.includes("--json");

/** Parked decisions from docs/i18n/review-cs.md § A. A wave must not apply these
 *  at all — a partial application is the "half-sweep" failure. We compare total
 *  occurrence counts in the cs column; any movement is a violation. */
const PARKED = [
  // A1 (em dash) was REMOVED on 2026-08-06 — the owner decided it, so reducing
  // the count is now the goal rather than a half-sweep violation. The em dash is
  // guarded in the opposite direction by EM_DASH_CEILING below.
  { id: "A2", name: "prosím", re: /prosím/gi },
  { id: "A3", name: "klikněte na", re: /[Kk]likn[ěe]te\s+na/g },
  {
    id: "A4",
    name: "brand-first noun order",
    re: /(Google Ads|Google|Sklik)\s+(účet|účtu|účtů|účty)/g,
  },
];

function tableRanges(src) {
  const out = [];
  const re = /(?:const|export const)\s+[A-Za-z0-9_]+\s*(?::[^=]+)?=\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
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
    const b = src.slice(m.index, i);
    if (/\bcs:\s*\{/.test(b) && /\ben:\s*\{/.test(b)) out.push(b);
    re.lastIndex = i;
  }
  return out;
}

function column(block, locale) {
  const s = block.indexOf(`${locale}: {`);
  if (s < 0) return null;
  let i = block.indexOf("{", s);
  let d = 0;
  let e = i;
  for (; i < block.length; i++) {
    if (block[i] === "{") d++;
    else if (block[i] === "}") {
      d--;
      if (d === 0) {
        e = i;
        break;
      }
    }
  }
  const out = {};
  for (const mm of block.slice(s, e).matchAll(
    /^\s*([A-Za-z0-9_]+):\s*(["'`])((?:\\.|(?!\2)[\s\S])*?)\2\s*,?\s*$/gm
  ))
    out[mm[1]] = mm[3];
  return out;
}

/** Parse a whole file into { "tableIdx.key": {cs, en} }. */
function parse(src) {
  const out = {};
  tableRanges(src).forEach((block, ti) => {
    const cs = column(block, "cs");
    const en = column(block, "en");
    if (!cs || !en) return;
    for (const k of new Set([...Object.keys(cs), ...Object.keys(en)]))
      out[`${ti}.${k}`] = { cs: cs[k], en: en[k] };
  });
  return out;
}

const ph = (s) => (s ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",") : "");

const changed = execSync(`git -C "${ROOT}" diff --name-only ${BASE} -- "src/*.ts" "src/*.tsx"`, {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);

const fails = [];
const warns = [];
let compared = 0;

for (const rel of changed) {
  let baseSrc = "";
  try {
    baseSrc = execSync(`git -C "${ROOT}" show ${BASE}:${rel}`, { encoding: "utf8", maxBuffer: 1 << 26 });
  } catch {
    continue; // new file — nothing to compare against
  }
  const nowSrc = readFileSync(path.join(ROOT, rel), "utf8");
  const before = parse(baseSrc);
  const after = parse(nowSrc);
  if (!Object.keys(after).length) continue;

  for (const [id, val] of Object.entries(after)) {
    const key = id.split(".").slice(1).join(".");
    const old = before[id];
    compared++;

    if (val.cs === undefined || val.en === undefined) {
      fails.push({ check: "key-set asymmetry", rel, key, detail: `missing ${val.cs === undefined ? "cs" : "en"} column entry` });
      continue;
    }
    if (!val.cs.trim() || !val.en.trim())
      fails.push({ check: "empty value", rel, key, detail: `cs=${JSON.stringify(val.cs)} en=${JSON.stringify(val.en)}` });

    if (ph(val.cs) !== ph(val.en))
      fails.push({ check: "placeholder drift", rel, key, detail: `cs{${ph(val.cs)}} vs en{${ph(val.en)}}` });

    if (old) {
      if (ph(val.en) !== ph(old.en))
        fails.push({ check: "placeholder drift vs base", rel, key, detail: `en was {${ph(old.en)}} now {${ph(val.en)}}` });
      if (ph(val.cs) !== ph(old.cs))
        fails.push({ check: "placeholder drift vs base", rel, key, detail: `cs was {${ph(old.cs)}} now {${ph(val.cs)}}` });
      // A cs value newly equal to its en value is a regression, not a fix.
      if (val.cs === val.en && old.cs !== old.en && val.cs.replace(/[^A-Za-zÀ-ž]/g, "").length > 3)
        warns.push({ check: "new leftover source", rel, key, detail: JSON.stringify(val.cs) });
    } else {
      warns.push({ check: "key added", rel, key, detail: "new key — intended only when externalizing" });
    }

    // Advisory checks apply only to pairs this wave actually TOUCHED. Running
    // them over every pair in a changed file buries the signal under warnings
    // about strings nobody edited.
    const touched = !old || old.cs !== val.cs || old.en !== val.en;
    const budget = Math.max(24, val.en.length * 1.6);
    if (touched && val.en.length <= 40 && val.cs.length > budget)
      warns.push({ check: "length blow-up", rel, key, detail: `en ${val.en.length} -> cs ${val.cs.length} chars` });
  }

  for (const id of Object.keys(before))
    if (!(id in after))
      warns.push({ check: "key removed", rel, key: id.split(".").slice(1).join("."), detail: "removed vs base" });
}

// Parked decisions: compare whole-repo cs-column counts, base vs now.
const csText = (src) =>
  tableRanges(src)
    .map((b) => Object.values(column(b, "cs") ?? {}).join("\n"))
    .join("\n");
let baseCs = "";
let nowCs = "";
for (const rel of changed) {
  try {
    baseCs += csText(execSync(`git -C "${ROOT}" show ${BASE}:${rel}`, { encoding: "utf8", maxBuffer: 1 << 26 })) + "\n";
  } catch {
    /* new file */
  }
  nowCs += csText(readFileSync(path.join(ROOT, rel), "utf8")) + "\n";
}
// Every parked decision is a "reduce this count" change, so a DROP means the
// wave started applying it — that is the half-sweep. A RISE is not the same
// defect: a CS-REGISTER fix legitimately rewrites `klikni na` to `klikněte na`
// and grows the A3 population by one. Warn so the eventual sweep covers it.
for (const p of PARKED) {
  const b = (baseCs.match(p.re) ?? []).length;
  const n = (nowCs.match(p.re) ?? []).length;
  if (n < b)
    fails.push({
      check: "parked decision partially swept",
      rel: "(whole wave)",
      key: p.id,
      detail: `${p.name}: ${b} -> ${n} occurrences. review-cs.md §A says decide once, sweep once — a partial application is worse than none. Revert these, or get the owner's ruling and sweep all of them.`,
    });
  else if (n > b)
    warns.push({
      check: "parked population grew",
      rel: "(whole wave)",
      key: p.id,
      detail: `${p.name}: ${b} -> ${n}. Not a half-sweep (usually a register fix), but the pending ${p.id} sweep now has more sites to cover.`,
    });
}

// CS-DASH ratchet. The em dash is being removed from the catalog (decided
// 2026-08-06), so its count must only ever go DOWN. A rise means someone
// re-introduced the character the sweep exists to remove — including via a
// well-meaning "recast" that swapped one dash for another.
{
  const emBase = (baseCs.match(/—/g) ?? []).length;
  const emNow = (nowCs.match(/—/g) ?? []).length;
  if (emNow > emBase)
    fails.push({
      check: "em dash re-introduced",
      rel: "(whole wave)",
      key: "CS-DASH",
      detail: `em dash in cs: ${emBase} -> ${emNow}. The house rule is no dash at all; a surviving beat of contrast takes a spaced en dash (U+2013). See style-cs.md § Typography.`,
    });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ compared, files: changed.length, fails, warns }, null, 2));
} else {
  console.log(`\ni18n gate — ${changed.length} changed files, ${compared} pairs compared against ${BASE}\n`);
  const group = (list, label) => {
    if (!list.length) return;
    console.log(`${label} (${list.length})`);
    const by = {};
    for (const f of list) (by[f.check] ??= []).push(f);
    for (const [check, items] of Object.entries(by)) {
      console.log(`  ${check} — ${items.length}`);
      for (const i of items.slice(0, 12)) console.log(`     ${i.rel} · ${i.key}\n       ${i.detail}`);
      if (items.length > 12) console.log(`     … and ${items.length - 12} more`);
    }
    console.log();
  };
  group(fails, "FAIL");
  group(warns, "WARN");
  if (!fails.length) console.log(warns.length ? "No blocking failures.\n" : "Clean.\n");
}

if (fails.length) process.exit(1);
