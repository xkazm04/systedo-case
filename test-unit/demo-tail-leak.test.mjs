/** The demo disclaimer must never reach billed output.
 *
 *  The keyless demos end with demoTail() — " Ukázkový výstup — připojte LLM (…) pro …" —
 *  which is honest on the keyless path but nonsensical (and a provider-name leak) when
 *  spliced as a per-field floor into a live, metered answer. The wrapper only calls a
 *  tool's `demo:` callback on its real demo return path (src/lib/llm/index.ts), so the
 *  invariant is structural: the tail lives ONLY in a `demo*()` builder that is reachable
 *  ONLY through the `demo:` key. Everything a `normalize()` can reach must be the
 *  TAIL-FREE `base*()`.
 *
 *  The structural half of this file is programmatic — it scans src/lib/ai/tools for
 *  EVERY file that uses demoTail, so a 22nd tool cannot reintroduce the bug class
 *  without tripping it. The behavioural half spot-checks the migrated base/demo pairs.
 *  Pure — no model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const TAIL = /Ukázkový výstup — připojte LLM/;

// ── structural guard (programmatic — covers every tool, present and future) ─────

const TOOLS_DIR = fileURLToPath(new URL("../src/lib/ai/tools/", import.meta.url));
/** demoTail is DEFINED here; the guard is about its call sites. */
const EXCLUDED = new Set(["_fragments.ts"]);

/** The ONE documented exception, per file: a normalizer that returns the WHOLE demo
 *  and tells the caller so (`canned: true`), which then stamps the response as demo —
 *  no quota is charged, so the disclaimer is honest. Anything else that reaches a
 *  demo builder from a normalize path is the bug this file exists to prevent. To add
 *  an entry you must also make the guard below (`canned: true` must appear in the
 *  function) true — i.e. prove the output is not billed. */
const CANNED_DEMO_EXCEPTIONS = new Map([
  [
    "channel-research.ts",
    { fn: "normalizeChannelResearchTracked", why: "returns canned:true → the caller bills it as demo" },
  ],
]);

/** Normalize line endings (CRLF checkouts) and strip comments, so prose about "the
 *  demo" is never mistaken for a code reference. */
function readTool(file) {
  return fs
    .readFileSync(path.join(TOOLS_DIR, file), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Split a module into top-level `function` segments plus the module-scope text
 *  between them. A body ends at the first column-0 `}` line (this repo is
 *  prettier-formatted), so string literals and `${}` can never desync the scan —
 *  no brace counting. */
function segments(src) {
  const re = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm;
  const starts = [];
  for (let m; (m = re.exec(src)); ) starts.push({ name: m[1], at: m.index });
  const out = [];
  let cursor = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i].at > cursor) out.push({ name: "(module scope)", start: cursor, end: starts[i].at });
    const limit = i + 1 < starts.length ? starts[i + 1].at : src.length;
    const close = src.indexOf("\n}\n", starts[i].at);
    const end = close !== -1 && close + 3 <= limit ? close + 3 : limit;
    out.push({ name: starts[i].name, start: starts[i].at, end });
    cursor = end;
  }
  out.push({ name: "(module scope)", start: cursor, end: src.length });
  return out;
}

/** The nearest object-property key preceding `idx` — how we prove a reference sits
 *  under `demo:` (the only key the wrapper calls outside the normalize path). */
function enclosingKey(src, idx) {
  const before = src.slice(0, idx);
  const re = /^[ \t]*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gm;
  let key = null;
  for (let m; (m = re.exec(before)); ) key = m[1];
  return key;
}

const toolFiles = fs
  .readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith(".ts") && !EXCLUDED.has(f))
  .filter((f) => readTool(f).includes("demoTail("));

test("the scan actually finds the demoTail tools (guard against a silent no-op)", () => {
  assert.ok(toolFiles.length >= 8, `expected the tools dir to yield demoTail users, got ${toolFiles.length}`);
});

for (const file of toolFiles) {
  const src = readTool(file);
  const segs = segments(src);

  test(`${file}: demoTail() is only called inside a demo*() builder`, () => {
    for (const seg of segs) {
      if (!src.slice(seg.start, seg.end).includes("demoTail(")) continue;
      assert.match(
        seg.name,
        /^demo[A-Z]/,
        `${file}: demoTail() is called in ${seg.name}() — it must live only in a demo*() builder, ` +
          `never in a value normalize() can reach. Split the builder into a tail-free base*() + a demo*().`
      );
    }
  });

  const builders = segs.filter((s) => /^demo[A-Z]/.test(s.name)).map((s) => s.name);
  const exception = CANNED_DEMO_EXCEPTIONS.get(file);
  const exempt = segs.filter((s) => s.name === exception?.fn);
  const inExempt = (idx) => exempt.some((s) => idx >= s.start && idx < s.end);

  if (exception) {
    test(`${file}: the documented ${exception.fn}() exception still marks its output as demo`, () => {
      assert.equal(exempt.length, 1, `${file}: ${exception.fn}() not found — retire the exception`);
      assert.match(
        src.slice(exempt[0].start, exempt[0].end),
        /canned:\s*true/,
        `${file}: ${exception.fn}() no longer flags the wholesale demo (${exception.why}) — the tail would be billed.`
      );
    });
  }

  test(`${file}: every demo*() builder is reachable ONLY through the demo: key`, () => {
    assert.ok(builders.length > 0, `${file} uses demoTail but declares no demo*() builder`);
    for (const name of builders) {
      const own = segs.find((s) => s.name === name);
      const re = new RegExp(`\\b${name}\\b`, "g");
      let sawDemoKey = false;
      for (let m; (m = re.exec(src)); ) {
        if (m.index >= own.start && m.index < own.end) continue; // its own definition
        if (inExempt(m.index)) continue; // the documented, unbilled wholesale-demo path
        const key = enclosingKey(src, m.index);
        assert.equal(
          key,
          "demo",
          `${file}: ${name} is referenced under "${key}:" — the demo builder may only be wired to ` +
            `generateStructured's demo: callback. A normalize()/validate() floor must use the tail-free base*().`
        );
        sawDemoKey = true;
      }
      assert.ok(sawDemoKey, `${file}: ${name} is never wired to a demo: callback`);
    }
  });

  test(`${file}: normalize()/validate() never mention a demo builder`, () => {
    for (const seg of segs) {
      if (!/^(normalize|validate)/.test(seg.name)) continue;
      if (seg.name === exception?.fn) continue;
      const body = src.slice(seg.start, seg.end);
      for (const name of builders) {
        assert.ok(
          !new RegExp(`\\b${name}\\b`).test(body),
          `${file}: ${seg.name}() reaches ${name}() — the demo disclaimer would ship stamped meta.demo:false.`
        );
      }
    }
  });
}

// ── behavioural spot-checks on the migrated base/demo pairs ────────────────────

const { baseChannelResearch, demoChannelResearch, normalizeChannelResearchTracked } = await import(
  "@/lib/ai/tools/channel-research"
);
const { baseCohortDiagnosis, demoCohortDiagnosis } = await import("@/lib/ai/tools/cohort-diagnosis");
const { baseOnboardingScan, demoOnboardingScan } = await import("@/lib/ai/tools/onboarding-scan");
const { baseLocalDiagnosis, demoLocalDiagnosis, normalizeLocalDiagnosis } = await import(
  "@/lib/ai/tools/local-diagnosis"
);
const { baseLeadSourceDiagnosis, demoLeadSourceDiagnosis } = await import(
  "@/lib/ai/tools/lead-source-diagnosis"
);

// ── channel-research ────────────────────────────────────────────────────────────

test("channel-research: base summary is tail-free, demo summary carries the tail", () => {
  const req = { projectType: "eshop", brand: "Ořechárna" };
  assert.doesNotMatch(baseChannelResearch(req).summary, TAIL);
  assert.match(demoChannelResearch(req).summary, TAIL);
});

test("channel-research: a live answer with an empty summary backfills tail-free", () => {
  const req = { projectType: "eshop", brand: "Ořechárna" };
  const channel = {
    name: "SEO", category: "content", fit: 80, effort: "low",
    rationale: "Sedí.", payoff: "Viditelnost.", firstActions: ["Založit."],
  };
  // model returned channels but no summary → summary is backfilled; must be tail-free.
  const out = normalizeChannelResearchTracked({ channels: [channel] }, req);
  assert.equal(out.canned, false);
  assert.doesNotMatch(out.result.summary, TAIL);
});

// ── cohort-diagnosis ──────────────────────────────────────────────────────────

test("cohort-diagnosis: base summary is tail-free, demo summary carries the tail", () => {
  const req = {
    cohorts: [{ month: "2026-01", cac: 800, ltv: 1200, ltvCac: 1.5, paybackMonth: 6, m3: 0.3, signups: 100 }],
    blendedCac: 800, avgLtvCac: 1.5,
  };
  assert.doesNotMatch(baseCohortDiagnosis(req).summary, TAIL);
  assert.match(demoCohortDiagnosis(req).summary, TAIL);
});

test("cohort-diagnosis: the no-cohorts branch is also tail-free in the base", () => {
  const req = { cohorts: [], blendedCac: 0, avgLtvCac: 0 };
  assert.doesNotMatch(baseCohortDiagnosis(req).summary, TAIL);
  assert.match(demoCohortDiagnosis(req).summary, TAIL);
});

// ── onboarding-scan ───────────────────────────────────────────────────────────

test("onboarding-scan: base summary is tail-free, demo summary carries the tail", () => {
  const req = { url: "https://orecharna.cz", brand: "Ořechárna", projectType: "eshop" };
  assert.doesNotMatch(baseOnboardingScan(req).summary, TAIL);
  assert.match(demoOnboardingScan(req).summary, TAIL);
});

// ── local-diagnosis ───────────────────────────────────────────────────────────

const localReq = {
  coveragePct: 1 / 3,
  withPage: 1,
  trackedCombos: 3,
  gapVolume: 2300,
  gaps: [
    { label: "Bělení zubů — Praha", monthlyVolume: 1400 },
    { label: "Dentální hygiena — Brno", monthlyVolume: 900 },
  ],
};

test("local-diagnosis: base summary is tail-free, demo summary carries the tail", () => {
  assert.doesNotMatch(baseLocalDiagnosis(localReq).summary, TAIL);
  assert.match(demoLocalDiagnosis(localReq).summary, TAIL);
});

test("local-diagnosis: the no-gaps branch is also tail-free in the base", () => {
  const req = { ...localReq, gaps: [], gapVolume: 0, withPage: 3, coveragePct: 1 };
  assert.doesNotMatch(baseLocalDiagnosis(req).summary, TAIL);
  assert.match(demoLocalDiagnosis(req).summary, TAIL);
});

test("local-diagnosis: an empty live summary backfills tail-free (billed output stays clean)", () => {
  const out = normalizeLocalDiagnosis({ summary: "", worstGap: "", recommendation: "" }, localReq);
  assert.ok(out.summary.length > 0);
  assert.doesNotMatch(out.summary, TAIL);
  assert.doesNotMatch(out.recommendation, TAIL);
});

// ── lead-source-diagnosis ─────────────────────────────────────────────────────

const leadReq = {
  source: "Sklik",
  leads: 120,
  qualified: 20,
  won: 2,
  qualRate: 0.17,
  winRate: 0.1,
  spend: 18000,
  cpl: 150,
  costPerQualified: 900,
};

test("lead-source-diagnosis: base summary is tail-free, demo summary carries the tail", () => {
  assert.doesNotMatch(baseLeadSourceDiagnosis(leadReq).summary, TAIL);
  assert.match(demoLeadSourceDiagnosis(leadReq).summary, TAIL);
});

test("lead-source-diagnosis: the low-volume branch is also tail-free in the base", () => {
  const req = { ...leadReq, leads: 5, qualified: 1, won: 0 };
  assert.doesNotMatch(baseLeadSourceDiagnosis(req).summary, TAIL);
  assert.match(demoLeadSourceDiagnosis(req).summary, TAIL);
});
