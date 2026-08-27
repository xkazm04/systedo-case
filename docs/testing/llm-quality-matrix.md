# LLM quality matrix — model-comparison benchmark

`npm run llm:quality` runs **every LLM operation in the app** through a set of
**target models** and has an **LLM judge (the Claude Code CLI)** score each
output for quality. It answers a question the pass/fail gate cannot: *not "does
this tool still work" but "which model writes the best output for each of our
tasks".*

The **run** is a benchmark, not a test — it costs real tokens, takes ~30 minutes
and has no assertions, so it stays on demand. The **number it bakes** is a
different thing: `src/lib/llm/quality-scores.ts` is committed data and is the
public surface at `/kvalita-modelu`, and it is gated. See
[Thresholds](#thresholds--what-can-actually-stop-a-change) below.

> Status: in active use. Full runs exist since 2026-07-06 (~33 reports under
> `test-llm/quality/reports/`, gitignored) and a baked scorecard shipped in
> `src/lib/llm/quality-scores.ts` (2026-07-07, single-judge). Since 2026-08-05 the
> runner also takes **vendor-prefixed targets** — `claude-cli:sonnet|opus`
> (native CLI path via `CLAUDE_CLI_PIN`, generation phase only), `qwen:<slug>`
> (Qwen Cloud, `QWEN_API_KEY`), `ollama:<tag>` (local, keyless) — alongside the
> original bare OpenRouter slugs; the latest measured table is in
> [Measured results — BYOM candidates](#measured-results--byom-candidates-2026-08-05)
> at the end of this document.

---

## Where it sits among the LLM test layers

| Layer | Command | Question | Blocking? |
|---|---|---|---|
| Coverage + chokepoint | part of the gate | is every wrapper call site tagged + registered, providers confined to the wrapper? | ✅ pre-commit |
| Contract goldens | `npm run llm:eval` | did a tool's (system + schema) fingerprint drift? | ✅ pre-commit |
| Contract provenance | part of the gate | is every golden's current fingerprint recorded, with a reason, in `test-llm/golden/CHANGELOG.md`? | ✅ pre-commit |
| Real-model suite | `npm run test:llm` | does each tool produce schema-valid output on real Claude? | ❌ on-demand (the pre-commit re-prove was retired 2026-08-05) |
| Offline sample validators | `npm run test:unit` | do committed sample outputs still pass each tool's validator? | ✅ CI |
| **Quality matrix** | **`npm run llm:quality`** | **which model writes the best output per operation?** | ❌ on-demand |
| **Quality floor** | **`npm run llm:quality:check`** | **does the baked scorecard still clear the floor on the models we serve?** | ✅ CI (`check:ci`) |

The first four keep the app *correct*. The quality matrix is about *taste* — it's
the input to choosing BYOM defaults, or deciding which model to recommend per
operation in the `ByomMatrix` settings module
(`src/components/app/modules/ByomMatrix.tsx`).

---

## Thresholds — what can actually stop a change

A harness that informs is worth having; a harness with a threshold is what lets
an agent land a change without a human reading the output. Three thresholds
exist, and each one is cheap enough to run on every pull request because none of
them calls a model.

**1. A golden may not change without a stated reason.**
`node scripts/llm-eval.mjs --update` refuses to run without `--reason "..."`,
rejects filler (`update`, `fix`, `wip`, …), and appends `tool | from | to` plus
the reason to `test-llm/golden/CHANGELOG.md`. The check side verifies that the
newest ledger row for each tool matches the fingerprint actually committed — so a
golden edited by hand, which passes the drift check by construction, fails here.
This is the answer to *"when goldens are regenerated, what distinguishes an
intended behaviour change from a regression being absorbed into the baseline?"*:
nothing did, and now the reason is a required field.

**2. A serving model may not fall below the floor.**
`scripts/quality-gate.mjs` reads the baked scorecard and fails when any operation
scores below **6.5** on a model the app actually serves with
(`anthropic/claude-sonnet-5`, `google/gemini-3.5-flash`), or when a serving-model
cell is marked `valid: false` — meaning the judged output failed that tool's own
validator, i.e. production would have clamped or dropped it. Both serving columns
sit at 7.0 or above on every baked operation today, so the floor leaves half a
point for run-to-run variance and still catches a real drop. The comparison-field
columns are deliberately **not** gated: their job is to inform BYOM
recommendations, and a bad score there is information, not a defect.

**3. Coverage of the scorecard is ratcheted.**
The same gate reports two counts against a baseline (reporting rung, per
[ADR-0007](../adr/0007-gate-rung-discipline.md)): registry tools with no baked
score at all — six today: `channel-research`, `local-diagnosis`, `monthly-recap`,
`onboarding-scan`, `twin-reply`, `twin-style` — and baked operations that no
longer exist in the registry — one today: `lead-reply`, retired when the twin
absorbed it and still displayed on the public scorecard. `--check` fails if
either count rises. Fix and lower in the same commit; never raise.

What is deliberately **not** gated is the judged run itself. It is ~90 OpenRouter
generations plus up to 405 judge spawns; wiring that into a pull request would be
both slow and a bill. The split is: measure on demand, gate the measurement.

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
# Full matrix: 15 operations × 9 models = 135 generations, ×3 Sonnet judges/cell =
# up to ~405 judge calls. Real OpenRouter tokens (the Claude judge is on your
# subscription). Don't run this casually. Drop LLM_QUALITY_JUDGES=1 for a cheaper
# single-judge pass (baked honestly as plain `claude-sonnet`, not a median).
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
| `LLM_QUALITY_TARGETS` | the 9 below | comma-separated OpenRouter model slugs |
| `LLM_QUALITY_TOOLS` | all 15 | comma-separated operation ids (subset) |
| `LLM_QUALITY_CONCURRENCY` | `4` | parallel target generations (judges fixed at 2) |
| `LLM_QUALITY_REASONING` | `default` | reasoning level applied to every target call |
| `LLM_QUALITY_JUDGES` | `3` | Sonnet judges per cell; the median is the score. This is the honest **"medián ze 3"** the scorecard label claims. Only cells that truly realise ≥2 judges get a median label — a quota-limited pass at `1` is baked as plain `claude-sonnet`, never over-claimed. |

**Default targets** (all via the OpenRouter key) — the comparison field **plus the
models the app actually serves**, so the scorecard measures what users really get:

- comparison field: `z-ai/glm-5.2`, `deepseek/deepseek-v4-flash`,
  `xiaomi/mimo-v2.5-pro`, `openai/gpt-5.4-mini`
- **prod** Gemini serving path: `google/gemini-3-flash-preview`,
  `google/gemini-3-flash-lite-preview` (`GEMINI_MODEL` / `GEMINI_MODEL_FAST`)
- **prod** Claude (dev/CLI + BYOM Anthropic defaults): `anthropic/claude-sonnet-5`,
  `anthropic/claude-haiku-4-5` — note `claude-sonnet-5` is the **judge family** (self-judged)
- **prod** BYOM Gemini default: `google/gemini-3.5-flash`

No paid run has been done against this expanded roster yet. To score it, run
`npm run llm:quality` (a full run costs real tokens — see the cost note below).

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
   `anthropic/claude-sonnet-5` (and any `claude-*` target) is judged by a sibling
   model — the report now flags this conflict explicitly (a ⚠ caveat under the
   scores matrix, and the BYOM UI marks the affected columns with a `°`). Treat a
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

---

## Measured results — BYOM candidates (2026-08-05)

Moved here from the README (where it lived in Czech until 2026-08-25). LLM-judge
scores (1–10, Claude CLI Sonnet, 1 judge per cell) across all 20 production AI
operations, run through the real wrapper (`npm run llm:quality` with
vendor-prefixed targets). `claude-cli` = the native CLI path (subscription);
`qwen:*` = Qwen Cloud API; `ollama` = local LFM2.5-8B-A1B. `✗` = the model did
not serve the operation. The same scores are the public surface at
`/kvalita-modelu`.

| operation | sonnet | opus | qwen3.8-max | glm-5.2 | deepseek-v4 | lfm2.5:8b |
|---|--:|--:|--:|--:|--:|--:|
| ads | 7.0 | 7.0 | 6.0 | 7.0 | 6.5 | 1.0 |
| brief | 8.5 | 9.0 | 8.0 | 7.5 | 7.0 | 1.0 |
| analysis | 7.5 | 6.0 | 7.0 | 6.5 | 6.0 | 3.0 |
| campaign-eval | 8.0 | 8.5 | 7.0 | 7.0 | 7.0 | 3.5 |
| social | 8.0 | 8.0 | 6.5 | 5.5 | 6.0 | 1.5 |
| twin-reply | 6.0 | 7.0 | 6.0 | 5.0 | 7.0 | 1.0 |
| twin-style | 8.0 | 8.0 | 7.5 | 5.0 | 6.0 | 2.0 |
| repurpose | 7.5 | 7.0 | 7.0 | 7.0 | 7.0 | 1.0 |
| local-review-reply | 8.5 | 8.7 | 6.5 | 6.0 | 6.0 | 1.0 |
| article-draft | 7.3 | 7.5 | 8.0 | 6.5 | 8.0 | 1.0 |
| cohort-diagnosis | 8.0 | 8.0 | 6.0 | 6.5 | 7.0 | 1.0 |
| keyword-clusters | 10.0 | 7.0 | 8.0 | 8.0 | 8.0 | 1.0 |
| comparison-outline | 7.8 | 7.0 | 6.5 | 7.0 | 6.0 | 1.0 |
| lp-variant-ideas | 8.0 | 9.0 | 8.5 | 5.0 | 7.0 | 1.0 |
| lead-source-diagnosis | 8.0 | 8.0 | 8.0 | 7.5 | 8.0 | 2.0 |
| local-diagnosis | 8.0 | 7.5 | 8.5 | 4.0 | 5.0 | 2.0 |
| chat | 7.5 | 7.0 | 7.0 | 5.0 | 5.0 | 1.0 |
| monthly-recap | 7.0 | 6.5 | 6.0 | 6.0 | 6.0 | 1.5 |
| channel-research | 8.0 | 7.0 | ✗ | ✗ | 7.0 | 2.0 |
| onboarding-scan | 9.0 | 8.0 | 9.0 | 8.0 | 8.0 | 3.0 |
| **average** | **7.88** | **7.58** | **7.21** | **6.32** | **6.67** | **1.57** |

Reading: Sonnet remains the quality ceiling; Opus does not beat it (and the judge
is its sibling — home-team bias on both CLI columns). **qwen3.8-max is the
strongest BYOM candidate** (7.21, ~$0.21 for a full pass); deepseek-v4-flash is
the price outlier (6.67 at ~$0.012). The local 8B model is **unusable** for a
Czech-first product — the judge documents pseudo-Czech, CJK character leakage and
English fallbacks; the same model reached ~4.9/10 on the English tasks of a
sister project. Full reports: `test-llm/quality/reports/` (gitignored).
