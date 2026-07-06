# LLM quality matrix — model-comparison benchmark

`npm run llm:quality` runs **every LLM operation in the app** through a set of
**target models** and has an **LLM judge (the Claude Code CLI)** score each
output for quality. It answers a question the pass/fail gate cannot: *not "does
this tool still work" but "which model writes the best output for each of our
tasks".*

It is a **benchmark, not a test** — it never blocks a commit and has no
assertions. You run it on demand, read the scorecard, and decide.

> Status: framework built + smoke-tested; **no full run has been done yet.** This
> doc is the guide for when we pick it up.

---

## Where it sits among the LLM test layers

| Layer | Command | Question | Blocking? |
|---|---|---|---|
| Coverage + chokepoint | part of the gate | is every wrapper call site tagged + registered, providers confined to the wrapper? | ✅ pre-commit |
| Contract goldens | `npm run llm:eval` | did a tool's (system + schema) fingerprint drift? | ✅ pre-commit |
| Real-model gate | `npm run llm:gate` | does each tool produce schema-valid output on real Claude? | ✅ pre-commit (hash-cached) |
| Offline sample validators | `npm run test:unit` | do committed sample outputs still pass each tool's validator? | ✅ CI |
| **Quality matrix** | **`npm run llm:quality`** | **which model writes the best output per operation?** | ❌ on-demand |

The first four keep the app *correct*. The quality matrix is about *taste* — it's
the input to choosing BYOM defaults, or deciding which model to recommend per
operation in the `ByomMatrix` settings module
(`src/components/app/modules/ByomMatrix.tsx`).

---

## How it works

```
test-llm/registry.mjs   →  the 15 operation fixtures (system + prompt + schema)
                            = "the same requests", one per // llm-tool: call site
        │
        ▼  for each (operation × target model)
runWithByomContext(key)  →  generateStructured(fixture)   ← the REAL wrapper
        │                    (BYOM context injects vendor=openrouter, model=<slug>)
        ▼
   target output           →  meta.model === target?  no → cell FAILED (fell back)
        │                                              yes ↓
        ▼
generateStructured(judge)  →  Claude Code CLI scores it (1–10 × 4 dims + issues)
        │  (no BYOM context → dev provider = Claude CLI)
        ▼
  test-llm/quality/reports/quality-<ts>.md  +  .json    (gitignored)
```

Everything routes through the app's own `recordLlmCall`, so **every call — targets
and the judge — mirrors to LightTrack** when `LIGHTTRACK_*` is set (configured in
`.env.example`; seam in `src/lib/llm/lighttrack.ts`). The report is the summary;
LightTrack is the full per-call trace (latency, tokens, cost).

Key files: `test-llm/quality/run.mjs` (the harness), `test-llm/registry.mjs` (the
fixtures — kept in 1:1 sync with the real call sites by the gate's coverage check).

### Why fallback is detected

The wrapper falls back to the app's own provider on a *recoverable* failure. If a
target model errors and Claude serves the retry, judging that output would tell
you the *wrong model's* quality. So the harness checks `meta.model === target`;
if not, the cell is `✗ served by <X> (fell back)` — an honest failure, never a
mislabeled score. A hard *user* fault (bad slug → 404, bad key → 401) throws and
lands as `model: …` / `auth: …` in the cell.

---

## Prerequisites

- **`OPENROUTER_API_KEY`** in `.env.local` — all six default targets route through
  OpenRouter with one key. The script loads `.env.local` itself (a plain node
  script doesn't get Next's env loading).
- **A logged-in Claude CLI** (`claude`) — it is the judge (uses your subscription,
  so judging is effectively free).
- Optional **`LIGHTTRACK_*`** — to mirror the run into LightTrack.

---

## Running it

```bash
# Full matrix: 15 operations × 6 models = 90 generations + up to 90 judge calls.
# ~30 min, real OpenRouter tokens. Don't run this casually.
npm run llm:quality

# Smoke: one operation, one model — validate slugs/keys before a full run.
LLM_QUALITY_TOOLS=chat LLM_QUALITY_TARGETS=deepseek/deepseek-v4-flash npm run llm:quality

# One operation across all six models (cheap, catches bad slugs early).
LLM_QUALITY_TOOLS=ads npm run llm:quality

# Compare reasoning depth on a subset.
LLM_QUALITY_TOOLS=analysis,campaign-eval LLM_QUALITY_REASONING=high npm run llm:quality
```

### Env knobs

| Var | Default | Effect |
|---|---|---|
| `LLM_QUALITY_TARGETS` | the 6 below | comma-separated OpenRouter model slugs |
| `LLM_QUALITY_TOOLS` | all 15 | comma-separated operation ids (subset) |
| `LLM_QUALITY_CONCURRENCY` | `4` | parallel target generations (judges fixed at 2) |
| `LLM_QUALITY_REASONING` | `default` | reasoning level applied to every target call |

**Default targets** (all via the OpenRouter key):
`z-ai/glm-5.2`, `deepseek/deepseek-v4-flash`, `xiaomi/mimo-v2.5-pro`,
`openai/gpt-5.4-mini`, `anthropic/claude-sonnet-5`, `google/gemini-3.5-flash`.

Operation ids: `ads, brief, analysis, chat, campaign-eval, social, lead-reply,
repurpose, local-review-reply, article-draft, cohort-diagnosis, keyword-clusters,
comparison-outline, lp-variant-ideas, lead-source-diagnosis`.

---

## Reading the report

`test-llm/quality/reports/quality-<timestamp>.md` has three parts:

- **Scores matrix** — rows = operations, columns = models, cell = the judge's
  overall score. Legend: number = score · `✗` = model didn't serve
  (failed/fell back) · `—` = judged unavailable · `⚠` = output failed the tool's
  own schema validator (well-formed enough to judge, but production would clamp/drop it).
- **Ranking** — models by average score, with `served N/15` and rough cost.
- **Details** — per operation, per model: the four dimension scores
  (relevance / correctness / adherence / tone), latency, the one-line verdict, and
  the specific issues. **This is the part that matters** — read it, not just the
  numbers.

The `.json` sibling has the full structured results for scripting.

---

## How I'd approach a run + evaluation

A playbook, cheapest-first:

1. **Validate the target slugs before spending on a full matrix.** The model slugs
   are hand-picked and some are post-cutoff — a wrong slug is a 404, not a bad
   model. Run one cheap operation across all six:
   `LLM_QUALITY_TOOLS=chat npm run llm:quality`. Any `✗ model: …` cell means fix
   that slug (check OpenRouter's model list) before going wide.

2. **Pick a reasoning baseline.** Decide the run's `LLM_QUALITY_REASONING` up
   front — comparing models at *different* reasoning depths is apples-to-oranges.
   Start at `default` (each model's own default) for a fair first pass; then do a
   second run at `low` and `high` on a small subset if you want the
   depth-vs-quality curve. Remember `claude-haiku`-class models have no reasoning
   knob (it's a no-op there — see the reasoning mapping in `byom/reasoning.ts`).

3. **Run the full matrix once**, off-peak — it's ~30 min and burns real tokens.
   Watch the progress dots (`.` served, `x` failed). If a whole column is `x`,
   stop and fix that target rather than paying for 15 failures.

4. **Read details before the matrix.** A `7` that "invents unsupported figures"
   (violating a tool's "only from provided data" rule) is *worse* than a `6` that
   honestly says the data is insufficient — the number alone hides that. The
   smoke run already showed the judge catching exactly this on `chat`. Weight
   **correctness** and **adherence** over **tone**; a fluent lie is the worst
   outcome for these tools.

5. **Discount the home-team bias.** The judge is Claude, so
   `anthropic/claude-sonnet-5` outputs are judged by a sibling model — treat a
   narrow Claude win as noise, a wide one as signal. If a decision hinges on it,
   re-judge that column with a different judge (swap the judge to an OpenRouter
   model — a small change to `run.mjs`) and compare.

6. **Account for LLM variance.** One run is one sample. For a close call between
   two models on an operation, re-run just that pair a few times
   (`LLM_QUALITY_TOOLS=<op> LLM_QUALITY_TARGETS=<a>,<b>`) and look at the spread,
   not a single cell. Don't over-fit to a 0.5-point difference from one run.

7. **Cross-reference LightTrack** for the axes the report summarizes: real latency,
   token counts, and per-provider cost. Quality is one axis; a model that scores
   0.3 higher but is 4× slower and 3× the cost may still lose for a bulk operation
   like `article-draft`.

8. **Decide per operation, not globally.** The whole point of the matrix
   (`ByomMatrix`) is that different operations want different models — a cheap fast
   model may win `lead-reply`/`local-review-reply` while a stronger model wins
   `analysis`/`cohort-diagnosis`. Turn the winners into the recommended defaults
   for those operations.

---

## Caveats

- **It costs real tokens.** 90 OpenRouter generations per full run. Use the subset
  envs; don't wire it into any automated loop.
- **The judge is an LLM, not ground truth.** It's a strong, consistent reviewer —
  good for *relative* ranking across models on the same task — but it can be wrong.
  Spot-check a few cells by hand for any decision that matters.
- **Model slugs are yours to keep current.** Several are post-cutoff/hypothetical;
  the harness reports a bad slug as an error cell rather than guessing.
- **Determinism.** LLM output varies run to run; treat single-run numbers as
  estimates. Average a few runs for anything close.
- **Judge cost/time dominates.** Judging is 90 Claude-CLI spawns at concurrency 2 —
  the slow part. A subset run is much faster.

---

## Extending it

- **Add / change targets** — edit `DEFAULT_TARGETS` in `test-llm/quality/run.mjs`,
  or just pass `LLM_QUALITY_TARGETS`. Any OpenRouter slug works; to test a
  provider directly (not via OpenRouter) the harness would need that vendor's
  adapter + key wired into `runCell` (currently every target is `vendor:
  "openrouter"`).
- **Add an operation** — add its fixture to `test-llm/registry.mjs` (the gate's
  coverage check keeps the registry in sync with real call sites, so a new
  `// llm-tool:` gets a fixture anyway). The matrix picks it up automatically.
- **Harden the evaluation** (future): multiple judges + majority vote; N-run
  averaging per cell with variance; per-dimension weights; a human spot-check
  column; a second non-Claude judge to quantify home-team bias.
