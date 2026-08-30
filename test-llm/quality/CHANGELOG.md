# Quality baseline ledger

Every accepted move of the LLM quality baseline — the per-operation score the
serving models are held to — is recorded here, with the score it moved from and
to, and the reason it was accepted.

**Why a baseline and not just the floor.** `scripts/quality-gate.mjs` has held a
floor of 6.5 since it was written: no operation the app serves may score below
it. That catches a collapse. It cannot catch the thing that actually happens —
`brief` going 8.5 → 7.0 after a prompt edit, or every operation losing most of a
point after a model swap, with the whole scorecard still comfortably above the
floor and nothing red. A floor says "not terrible". A baseline says "not worse
than it was", which is the claim a user would make.

**Why a reason.** Re-recording a baseline is exactly how a regression gets
absorbed: the numbers move, the build goes green, and the fact that output got
worse appears nowhere on the page. So acceptance carries a sentence, and the
sentence lives next to the numbers forever. This is the same discipline the
prompt contracts already run under (`test-llm/golden/CHANGELOG.md`).

**How it is enforced.** `scripts/quality-gate.mjs` runs blocking inside
`npm run check:ci` — so on every CI run and before every push to master — and
fails when:

- a serving-model cell in `src/lib/llm/quality-scores.ts` is more than `maxDrop`
  below its baseline score;
- the mean across all baselined serving cells is more than `maxMeanDrop` below
  the recorded mean (the uniform-drift case the per-cell rule cannot see);
- the model the app **declares** it serves with is no longer the model the
  baseline was measured on — read out of `src/lib/llm/models.ts`, so a model swap
  goes red on the swap rather than on the next bake.

Moving it is deliberate and needs a reason:

```bash
npm run llm:quality:baseline -- --reason "gemini 3.5 → 4 flash: brief and social lose ~0.5 on tone, everything else up"
```

The command refuses to run without `--reason`, rejects the words people type to
get past a prompt (`update`, `fix`, `wip`, …), rewrites
`test-llm/quality/baseline.json` from the freshly baked scorecard, and appends
the entry below.

**Format.** Append-only, oldest first. The last row mentioning an operation is
its current claim.

---

## 2026-08-30 — ledger seeded

Baseline introduced. This first entry records the scores as measured by the
2026-07-07 matrix run and baked into `src/lib/llm/quality-scores.ts`; it makes no
claim about *why* an operation scores what it does. Every move from here forward
carries its reason.

Serving models at the time of seeding: `anthropic/claude-sonnet-5` (declared by
`CLAUDE_API_MODEL`) and `google/gemini-3.5-flash` (declared by
`BYOM_DEFAULT_MODELS.gemini.quality`), both in `src/lib/llm/models.ts`. Mean
across the 30 baselined cells: 7.7.

| operation | model | from | to |
|---|---|---|---|
| ads | anthropic/claude-sonnet-5 | — | 7 |
| ads | google/gemini-3.5-flash | — | 7 |
| analysis | anthropic/claude-sonnet-5 | — | 7 |
| analysis | google/gemini-3.5-flash | — | 7 |
| article-draft | anthropic/claude-sonnet-5 | — | 8 |
| article-draft | google/gemini-3.5-flash | — | 8.5 |
| brief | anthropic/claude-sonnet-5 | — | 8.5 |
| brief | google/gemini-3.5-flash | — | 7.5 |
| campaign-eval | anthropic/claude-sonnet-5 | — | 8 |
| campaign-eval | google/gemini-3.5-flash | — | 8 |
| chat | anthropic/claude-sonnet-5 | — | 7 |
| chat | google/gemini-3.5-flash | — | 7.5 |
| cohort-diagnosis | anthropic/claude-sonnet-5 | — | 7.5 |
| cohort-diagnosis | google/gemini-3.5-flash | — | 7.5 |
| comparison-outline | anthropic/claude-sonnet-5 | — | 8 |
| comparison-outline | google/gemini-3.5-flash | — | 7 |
| keyword-clusters | anthropic/claude-sonnet-5 | — | 8 |
| keyword-clusters | google/gemini-3.5-flash | — | 8.5 |
| lead-reply | anthropic/claude-sonnet-5 | — | 7 |
| lead-reply | google/gemini-3.5-flash | — | 7 |
| lead-source-diagnosis | anthropic/claude-sonnet-5 | — | 8 |
| lead-source-diagnosis | google/gemini-3.5-flash | — | 8.5 |
| local-review-reply | anthropic/claude-sonnet-5 | — | 8 |
| local-review-reply | google/gemini-3.5-flash | — | 8 |
| lp-variant-ideas | anthropic/claude-sonnet-5 | — | 8.5 |
| lp-variant-ideas | google/gemini-3.5-flash | — | 8.5 |
| repurpose | anthropic/claude-sonnet-5 | — | 8 |
| repurpose | google/gemini-3.5-flash | — | 8 |
| social | anthropic/claude-sonnet-5 | — | 7 |
| social | google/gemini-3.5-flash | — | 7 |

`lead-reply` is baselined because it is still on the scorecard, and it is still
on the scorecard because the tool was retired when the twin absorbed it — the
gate reports that as a retired-operation finding. When the next bake drops it,
its rows here stay as history.
