/** RE-JUDGE a quality report — fill in the cells that were served but never scored.
 *
 *  The matrix run (`run.mjs`) does two phases: generate (via OpenRouter) then judge
 *  (via the Claude Code CLI). If the judge's Claude quota runs out mid-run, the
 *  served outputs are still captured in the report JSON — only their scores are
 *  missing (shown as `—`). Re-generating them would waste OpenRouter tokens and
 *  change the outputs; instead this re-judges the CACHED outputs in place.
 *
 *  Quota-resilient: it only judges cells that are served-but-unjudged, so a partial
 *  pass can be re-run to fill whatever's left. Defaults to a single Sonnet judge
 *  (JUDGE_COUNT=1) to stay within a freshly-reset limit; already-judged cells (e.g.
 *  the median-of-3 ones from the first pass) are preserved untouched.
 *
 *  Run:   npm run llm:quality:rejudge            (latest report)
 *         node test-llm/quality/rejudge.mjs path/to/report.json
 *  Env:   LLM_QUALITY_JUDGES=1   Sonnet judges per cell (median of the valid ones)
 *
 *  The judge logic below is kept identical to run.mjs (the canonical source); if you
 *  change scoring there, mirror it here.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const REPORTS = join(HERE, "reports");

function loadEnv(file) {
  const p = join(ROOT, file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(".env.local");
loadEnv(".env");
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development"; // judge → Claude CLI

const { generateStructured } = await import("../../src/lib/llm/index.ts");
const { LLM_TOOLS } = await import("../registry.mjs");

const JUDGE_COUNT = Math.max(1, Number(process.env.LLM_QUALITY_JUDGES) || 1);
const numOr = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// ── judge (identical to run.mjs) ──────────────────────────────────────────────
const JUDGE_SYSTEM =
  "Jsi přísný senior recenzent, který hodnotí kvalitu výstupu AI marketingového nástroje. " +
  "Hodnotíš POUZE daný výstup vůči zadání. Boduješ 1–10 v každé dimenzi (10 = vynikající, 1 = nepoužitelné). " +
  "Buď kritický a konkrétní. Výstup má být česky, pokud zadání neříká jinak. Vracej pouze validní JSON dle schématu.";

const JUDGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    score: { type: "NUMBER", description: "celková kvalita 1-10" },
    relevance: { type: "NUMBER", description: "relevance k zadání 1-10" },
    correctness: { type: "NUMBER", description: "věcná správnost / dodržení omezení 1-10" },
    adherence: { type: "NUMBER", description: "splnění úkolu a struktury 1-10" },
    tone: { type: "NUMBER", description: "jazyk, tón, on-brand 1-10" },
    verdict: { type: "STRING", description: "jednovětý verdikt" },
    issues: { type: "ARRAY", items: { type: "STRING" }, description: "konkrétní problémy, prázdné pokud žádné" },
  },
  required: ["score", "relevance", "correctness", "adherence", "tone", "verdict", "issues"],
};

function judgePrompt(tool, output) {
  return [
    `Úkol: ${tool.label}`,
    "",
    "Systémový prompt nástroje:",
    tool.system,
    "",
    "Vstup:",
    tool.prompt,
    "",
    "Výstup modelu (JSON):",
    JSON.stringify(output, null, 2),
    "",
    "Ohodnoť kvalitu výstupu vzhledem k úkolu.",
  ].join("\n");
}

const isSonnetJudge = (model) => /claude|sonnet|anthropic/i.test(model || "");
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function judgeOnce(tool, output) {
  const res = await generateStructured({
    id: "quality-judge",
    system: JUDGE_SYSTEM,
    prompt: judgePrompt(tool, output),
    schema: JUDGE_SCHEMA,
    normalize: (x) => x,
    demo: () => ({ score: 0, verdict: "(judge unavailable)", issues: ["judge demo fallback"] }),
  });
  return { model: res.meta.model, demo: res.meta.demo, ...res.result };
}

async function judge(tool, output) {
  const runs = await Promise.all(
    Array.from({ length: JUDGE_COUNT }, () =>
      judgeOnce(tool, output).catch((e) => ({ error: String(e?.message ?? e) }))
    )
  );
  const sonnet = runs.filter((r) => !r.error && r.demo === false && isSonnetJudge(r.model));
  if (!sonnet.length) {
    const offModel = runs.find((r) => r.model)?.model ?? "?";
    return {
      judged: false,
      judgeModel: offModel,
      judges: 0,
      score: 0,
      verdict: "(no Sonnet judge — off-model rejected)",
      issues: [`all ${runs.length} judges fell back off Sonnet (e.g. ${offModel})`],
    };
  }
  const dims = ["score", "relevance", "correctness", "adherence", "tone"];
  const agg = {};
  for (const d of dims) agg[d] = median(sonnet.map((r) => numOr(r[d])));
  const pick = sonnet.reduce(
    (best, r) => (Math.abs(numOr(r.score) - agg.score) < Math.abs(numOr(best.score) - agg.score) ? r : best),
    sonnet[0]
  );
  return { judged: true, judgeModel: "claude-sonnet", judges: sonnet.length, ...agg, verdict: pick.verdict, issues: pick.issues };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

// ── pick the report ───────────────────────────────────────────────────────────
function latestReport() {
  if (!existsSync(REPORTS)) return null;
  const files = readdirSync(REPORTS).filter((f) => f.startsWith("quality-") && f.endsWith(".json")).sort();
  return files.length ? join(REPORTS, files[files.length - 1]) : null;
}
const path = process.argv[2] ? join(ROOT, process.argv[2]) : latestReport();
if (!path || !existsSync(path)) {
  console.error("✗ No report JSON found — run `npm run llm:quality` first (or pass a path).");
  process.exit(1);
}

const report = JSON.parse(readFileSync(path, "utf8"));
const gen = report.results ?? [];
const toolById = new Map(LLM_TOOLS.map((t) => [t.id, t]));

const gaps = gen.filter((r) => r.served && !(r.judge && r.judge.judged) && toolById.has(r.tool));
console.log(`\nRe-judge — ${gaps.length} served-but-unjudged cells (of ${gen.filter((r) => r.served).length} served), ${JUDGE_COUNT} judge(s) each.`);
if (!gaps.length) {
  console.log("✓ nothing to re-judge — every served cell already has a score.");
  process.exit(0);
}

let filled = 0;
await mapLimit(gaps, 2, async (r) => {
  const j = await judge(toolById.get(r.tool), r.output);
  r.judge = j; // mutate the report row in place
  if (j.judged) filled++;
  process.stdout.write(j.judged ? "." : "x");
  return j;
});
process.stdout.write("\n");

// ── write an updated report (new timestamp so bake picks it up) ────────────────
const at = new Date().toISOString();
const stamp = at.replace(/[:.]/g, "-");
const out = { ...report, at, rejudgedFrom: report.at, results: gen };
writeFileSync(join(REPORTS, `quality-${stamp}.json`), JSON.stringify(out, null, 2) + "\n");

const judgedNow = gen.filter((r) => r.served && r.judge?.judged).length;
console.log(`✓ filled ${filled}/${gaps.length} gaps · ${judgedNow}/${gen.filter((r) => r.served).length} served cells now judged`);
console.log(`✓ report: test-llm/quality/reports/quality-${stamp}.json (re-judged from ${report.at})`);
if (filled < gaps.length) console.log(`  ${gaps.length - filled} still unjudged — re-run to fill (likely quota again).`);
