/** LLM QUALITY MATRIX — an LLM-as-judge benchmark (NOT a pass/fail gate).
 *
 *  Runs every registry operation (the 15 `// llm-tool:` call sites) through the
 *  REAL wrapper (`generateStructured`) once per target model — injected via the
 *  BYOM context, so the app's actual prompt/schema/pipeline is exercised — then
 *  has the Claude Code CLI judge each output's quality. Writes a scorecard matrix.
 *
 *  Every wrapper call (targets AND the judge) flows through `recordLlmCall` →
 *  LightTrack, so setting the LIGHTTRACK_* env mirrors the whole run there.
 *
 *  Run:   npm run llm:quality
 *  Needs: OPENROUTER_API_KEY (loaded from .env.local) + a logged-in Claude CLI.
 *  Env:   LLM_QUALITY_TARGETS=slug,slug   override the default OpenRouter roster
 *         LLM_QUALITY_TOOLS=ads,brief      run a subset of operations
 *         LLM_QUALITY_CONCURRENCY=4        parallel generations (judges use 2)
 *         LLM_QUALITY_REASONING=default    reasoning level for every target call
 *         LLM_QUALITY_JUDGES=3             Sonnet judges per cell (median of them);
 *                                          default 3 — the honest "medián ze 3" the
 *                                          scorecard label claims. Lower it only for
 *                                          a quota-limited pass (the bake then labels
 *                                          the real n — never over-claims a median).
 *
 *  A full run is 15 × <roster> generations + up to that many Claude-CLI judge calls,
 *  ×LLM_QUALITY_JUDGES judge calls per served cell. With the default 9-model roster
 *  and 3 judges that's 135 generations + up to ~405 judge calls — it costs real
 *  tokens on your OpenRouter key (the Claude judge is on your subscription) and takes
 *  a while. Use the subset env vars for a quick smoke run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

/** Load KEY=value lines from an env file into process.env (without overriding
 *  anything already set). A standalone node script doesn't read .env.local the way
 *  Next does, so OPENROUTER_API_KEY has to be pulled in explicitly. */
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
// Dev so the JUDGE (no BYOM context) runs on the Claude Code CLI.
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";

// Dynamic-import the TS wrapper AFTER env is loaded (the resolve hook + react-server
// condition come from `--import ./test-llm/setup.mjs --conditions react-server`).
const { generateStructured } = await import("../../src/lib/llm/index.ts");
const { runWithByomContext } = await import("../../src/lib/llm/byom-context.ts");
const { LLM_TOOLS } = await import("../registry.mjs");

// The benchmark roster (all routed via OpenRouter). Two groups:
//  · comparison field — strong third-party models to rank the app against.
//  · PROD models — the models the app ACTUALLY serves, so the scorecard measures
//    what users really get, not just the field:
//      google/gemini-3-flash-preview(+ -lite-preview)  = production Gemini path
//        (src/lib/llm/models.ts GEMINI_MODEL / GEMINI_MODEL_FAST).
//      anthropic/claude-sonnet-5 / claude-haiku-4-5     = the dev/CLI Claude path
//        AND the BYOM Anthropic defaults (CLAUDE_API_MODEL / _FAST).
//      google/gemini-3.5-flash                          = the BYOM Gemini default.
//  NOTE: claude-sonnet-5 is ALSO the judge family — its cells are self-judged
//  (home-team bias). The report surfaces this; see `selfJudged` below.
const DEFAULT_TARGETS = [
  // comparison field
  "z-ai/glm-5.2",
  "deepseek/deepseek-v4-flash",
  "xiaomi/mimo-v2.5-pro",
  "openai/gpt-5.4-mini",
  // prod: production Gemini serving path
  "google/gemini-3-flash-preview",
  "google/gemini-3-flash-lite-preview",
  // prod: dev/CLI Claude + BYOM Anthropic defaults (sonnet-5 = judge family)
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4-5",
  // prod: BYOM Gemini default
  "google/gemini-3.5-flash",
];

const targets = (process.env.LLM_QUALITY_TARGETS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TARGETS = targets.length ? targets : DEFAULT_TARGETS;

const toolFilter = (process.env.LLM_QUALITY_TOOLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TOOLS = toolFilter.length ? LLM_TOOLS.filter((t) => toolFilter.includes(t.id)) : LLM_TOOLS;

const CONCURRENCY = Number(process.env.LLM_QUALITY_CONCURRENCY) || 4;
const REASONING = process.env.LLM_QUALITY_REASONING || "default";
// How many Sonnet judges to run per cell (median of the valid ones). >1 both guards
// against LLM variance and survives an occasional Sonnet failure without accepting an
// off-model (Gemini) score.
const JUDGE_COUNT = Math.max(1, Number(process.env.LLM_QUALITY_JUDGES) || 3);

/** Parse one target spec. Three forms:
 *    - "vendor:model"  → that BYOM vendor (openrouter | qwen | ollama), e.g.
 *      "qwen:qwen3.8-max", "ollama:lfm2.5:8b" (the tag may itself contain ":").
 *    - "claude-cli:alias" → the app's native Claude CLI path pinned to `alias`
 *      (sonnet | opus | haiku) via CLAUDE_CLI_PIN — no BYOM context.
 *    - bare "org/slug" → OpenRouter (the original roster form, unchanged). */
function parseTarget(spec) {
  const m = spec.match(/^(claude-cli|openrouter|qwen|ollama):(.+)$/);
  if (!m) return { kind: "byom", vendor: "openrouter", model: spec, spec };
  if (m[1] === "claude-cli") return { kind: "claude", alias: m[2], model: `claude-${m[2]}`, spec };
  return { kind: "byom", vendor: m[1], model: m[2], spec };
}
const PARSED = TARGETS.map(parseTarget);

const claudeTargets = PARSED.filter((t) => t.kind === "claude");
if (claudeTargets.length > 1) {
  console.error("✗ At most one claude-cli:<alias> target per run (the CLI pin is process-wide). Run them separately.");
  process.exit(1);
}

/** Per-vendor API keys — each required only when the roster actually uses the
 *  vendor. Ollama is keyless (placeholder satisfies the adapter's Bearer header). */
const VENDOR_KEYS = {
  openrouter: process.env.OPENROUTER_API_KEY,
  qwen: process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY,
  ollama: "local",
};
for (const t of PARSED) {
  if (t.kind === "byom" && !VENDOR_KEYS[t.vendor]) {
    console.error(`✗ Missing ${t.vendor === "qwen" ? "QWEN_API_KEY" : "OPENROUTER_API_KEY"} — set it in .env.local (target ${t.spec}).`);
    process.exit(1);
  }
}
const short = (slug) => (slug.includes("/") ? slug.split("/").pop() : slug);
const numOr = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Self-judging conflict: the judge is Claude (Sonnet), so any Anthropic-family
// target grades its own vendor's outputs — a home-team bias to disclose, not hide.
const isSelfJudged = (slug) => /claude|sonnet|anthropic/i.test(slug || "");
const selfJudged = TARGETS.filter(isSelfJudged);
const selfJudgeNote = selfJudged.length
  ? `⚠ Konflikt hodnocení: rozhodčí je claude-sonnet, takže buňky rodiny Anthropic (${selfJudged
      .map(short)
      .join(", ")}) hodnotí sourozenecký model — čtěte je jako ovlivněné „domácím prostředím" (home-team bias), ne neutrálně.`
  : null;

// ── judge (Claude Code CLI, via the wrapper with no BYOM context) ─────────────
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

// The judge MUST be Sonnet (Claude CLI). `generateStructured` falls back Claude→Gemini
// on failure, so a single judge can be silently scored by Gemini — a *different* judge,
// invalid for cross-model comparison. Run JUDGE_COUNT judges in parallel, KEEP ONLY the
// Sonnet verdicts, and take the median. If none stayed on Sonnet, leave the cell
// unjudged (—) rather than accept an off-model score.
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
  // verdict + issues from the run whose overall score is closest to the median.
  const pick = sonnet.reduce(
    (best, r) => (Math.abs(numOr(r.score) - agg.score) < Math.abs(numOr(best.score) - agg.score) ? r : best),
    sonnet[0]
  );
  return { judged: true, judgeModel: "claude-sonnet", judges: sonnet.length, ...agg, verdict: pick.verdict, issues: pick.issues };
}

// ── one (operation × target) cell ─────────────────────────────────────────────
async function runCell(tool, t) {
  try {
    const generate = () =>
      generateStructured({
        id: tool.id,
        system: tool.system,
        prompt: tool.prompt,
        schema: tool.schema,
        tier: tool.tier,
        normalize: (x) => x,
        demo: () => ({ __demo: true }),
      });
    // A claude-cli target runs the app's native CLI path (no BYOM context); the
    // model comes from CLAUDE_CLI_PIN, set for the generation phase below. BYOM
    // targets inject the vendor key. fastModel = target too: fast-tier tools
    // (repurpose, keyword-clusters, …) otherwise resolve to the vendor's fast
    // DEFAULT instead of the model under test, leaving those ops uncovered.
    const res =
      t.kind === "claude"
        ? await generate()
        : await runWithByomContext(
            { vendor: t.vendor, apiKey: VENDOR_KEYS[t.vendor], model: t.model, fastModel: t.model, reasoning: REASONING },
            generate
          );
    // Did the TARGET serve, or did the wrapper fall back / degrade to demo?
    const served = res.meta.demo === false && res.meta.model === t.model;
    if (!served) {
      return { tool: tool.id, target: t.spec, served: false, error: `served by ${res.meta.model} (fell back)` };
    }
    return {
      tool: tool.id,
      target: t.spec,
      served: true,
      valid: Boolean(tool.validate(res.result)),
      output: res.result,
      tookMs: res.meta.tookMs,
      estCostUsd: res.meta.estCostUsd ?? 0,
    };
  } catch (e) {
    const msg = e?.name === "ByomUserError" ? `${e.code}: ${e.message}` : String(e?.message ?? e);
    return { tool: tool.id, target: t.spec, served: false, error: msg };
  }
}

// ── concurrency-limited map ───────────────────────────────────────────────────
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

// ── run ───────────────────────────────────────────────────────────────────────
const lighttrack = process.env.LIGHTTRACK_PROJECT || process.env.LIGHTTRACK_KEY;
console.log(`\nLLM quality matrix — ${TOOLS.length} operations × ${TARGETS.length} targets`);
console.log(`Targets: ${TARGETS.map(short).join(", ")}`);
console.log(`LightTrack: ${lighttrack ? "ON (mirroring)" : "off (set LIGHTTRACK_* to mirror)"}`);
console.log(`Judge: Claude Code CLI (Sonnet) · ${JUDGE_COUNT} judge(s)/cell (median) · reasoning: ${REASONING}`);
if (selfJudged.length) console.log(`Self-judged (home-team bias): ${selfJudged.map(short).join(", ")}`);
console.log("");

const cells = [];
for (const tool of TOOLS) for (const t of PARSED) cells.push({ tool, t });

console.log(`1/2 · running ${cells.length} generations (concurrency ${CONCURRENCY})…`);
// The CLI pin applies to the GENERATION phase only — cleared before judging so
// the judge always runs the normal Sonnet (claudeModelTag reads it per call).
if (claudeTargets.length === 1) process.env.CLAUDE_CLI_PIN = claudeTargets[0].alias;
const gen = await mapLimit(cells, CONCURRENCY, async ({ tool, t }) => {
  const r = await runCell(tool, t);
  process.stdout.write(r.served ? "." : "x");
  return r;
});
delete process.env.CLAUDE_CLI_PIN;
process.stdout.write("\n");

const servedCells = gen.filter((r) => r.served);
// NOJUDGE captures the served outputs (with their real cost) WITHOUT spawning the
// Claude judge — safe to run alongside `next dev` (the judge's process storm can
// starve Turbopack). Judge the cached outputs afterwards with `llm:quality:rejudge`.
if (process.env.LLM_QUALITY_NOJUDGE === "1") {
  console.log(`2/2 · skipping judging (LLM_QUALITY_NOJUDGE=1) — ${servedCells.length} served outputs captured for a later rejudge.`);
} else {
  console.log(`2/2 · judging ${servedCells.length} served outputs with the Claude CLI (concurrency 2)…`);
  const judged = await mapLimit(servedCells, 2, async (r) => {
    const j = await judge(
      TOOLS.find((t) => t.id === r.tool),
      r.output
    );
    process.stdout.write(j.judged ? "." : "x");
    return { k: `${r.tool}|${r.target}`, j };
  });
  process.stdout.write("\n");
  const byKey = new Map(judged.map((x) => [x.k, x.j]));
  for (const r of gen) if (r.served) r.judge = byKey.get(`${r.tool}|${r.target}`) ?? null;
}

// ── report ────────────────────────────────────────────────────────────────────
const at = new Date().toISOString();
const cell = (r) => (!r.served ? "✗" : !r.judge || !r.judge.judged ? "—" : numOr(r.judge.score).toFixed(1));
const find = (toolId, target) => gen.find((r) => r.tool === toolId && r.target === target);

const header = `| Operace | ${TARGETS.map(short).join(" | ")} |`;
const sep = `|${"---|".repeat(TARGETS.length + 1)}`;
const rows = TOOLS.map((t) => `| ${t.id} | ${TARGETS.map((tg) => cell(find(t.id, tg))).join(" | ")} |`);
const avg = (target) => {
  const scores = TOOLS.map((t) => find(t.id, target)).filter((r) => r?.served && r.judge?.judged).map((r) => numOr(r.judge.score));
  return scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
};
const avgRow = `| **Průměr** | ${TARGETS.map((tg) => { const a = avg(tg); return a === null ? "—" : `**${a.toFixed(2)}**`; }).join(" | ")} |`;

const ranking = TARGETS.map((tg) => {
  const served = TOOLS.filter((t) => find(t.id, tg)?.served).length;
  const cost = TOOLS.reduce((s, t) => s + numOr(find(t.id, tg)?.estCostUsd), 0);
  return { target: tg, avg: avg(tg), served, cost };
})
  .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
  .map((x, i) => `${i + 1}. **${short(x.target)}** — průměr ${x.avg === null ? "—" : x.avg.toFixed(2)}, obslouženo ${x.served}/${TOOLS.length}, ~$${x.cost.toFixed(4)}`);

const details = TOOLS.map((t) => {
  const lines = TARGETS.map((tg) => {
    const r = find(t.id, tg);
    if (!r.served) return `- **${short(tg)}** — ✗ ${r.error}`;
    if (!r.judge?.judged) return `- **${short(tg)}** — výstup OK, ale hodnocení selhalo`;
    const j = r.judge;
    const issues = Array.isArray(j.issues) && j.issues.length ? ` Problémy: ${j.issues.join("; ")}` : "";
    return `- **${short(tg)}** — skóre ${numOr(j.score).toFixed(1)} (rel ${numOr(j.relevance)}, spr ${numOr(j.correctness)}, spl ${numOr(j.adherence)}, tón ${numOr(j.tone)})${r.valid ? "" : " ⚠ schéma nevalidní"} · ${r.tookMs}ms · "${j.verdict}".${issues}`;
  });
  return `### ${t.id} — ${t.label}\n${lines.join("\n")}`;
}).join("\n\n");

const md = [
  `# LLM quality matrix — ${at}`,
  "",
  `${TOOLS.length} operací × ${TARGETS.length} modelů. Rozhodčí: Claude Code CLI. LightTrack: ${lighttrack ? "zapnut" : "vypnut"}.`,
  "",
  "## Skóre (celkové hodnocení rozhodčího, 1–10)",
  "",
  header,
  sep,
  ...rows,
  avgRow,
  "",
  "Legenda: číslo = skóre rozhodčího · `✗` = model neobsloužil (selhal/fallback) · `—` = hodnocení nedostupné · ⚠ = výstup nesplnil schéma.",
  ...(selfJudgeNote ? ["", selfJudgeNote] : []),
  "",
  "## Pořadí",
  "",
  ...ranking,
  "",
  "## Detaily",
  "",
  details,
  "",
].join("\n");

const outDir = join(HERE, "reports");
mkdirSync(outDir, { recursive: true });
const stamp = at.replace(/[:.]/g, "-");
writeFileSync(join(outDir, `quality-${stamp}.md`), md);
// judgeConfig lets the bake label the judge count honestly ("medián ze N" only when
// the run truly ran N judges); mirror what rejudge.mjs stamps.
writeFileSync(
  join(outDir, `quality-${stamp}.json`),
  JSON.stringify({ at, targets: TARGETS, judgeConfig: JUDGE_COUNT, results: gen }, null, 2) + "\n"
);

// stdout summary
console.log("\n" + header);
console.log(sep);
for (const r of rows) console.log(r);
console.log(avgRow);
console.log("\nPořadí:");
for (const r of ranking) console.log("  " + r.replace(/\*\*/g, ""));
if (selfJudgeNote) console.log("\n" + selfJudgeNote);
console.log(`\n✓ report: test-llm/quality/reports/quality-${stamp}.md`);
