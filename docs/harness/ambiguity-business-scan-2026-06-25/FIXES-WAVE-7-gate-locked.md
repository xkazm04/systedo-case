# Ambiguity+Business — Gate-locked track + cumulative status

> The final track: findings whose files are in `scripts/llm-gate.mjs` `HASHED_FILES`,
> so committing them runs the **real Claude pre-commit suite**. Attempted at the user's
> request; the `claude` CLI was available and the gate **passed**.

## Gate-locked commit

| Commit | Findings closed | Files | Gate |
|--------|----------------|-------|------|
| `552312a` | llm-provider-wrapper #2, #5, #1 (asymmetry) **+** ai-generation-api #4 | `llm/cost.ts`, `llm/models.ts`, `llm/gemini.ts` | real Claude suite: **14/14 tools pass, ~338s, re-cached** |
| `6cc8b34` | (chore) refresh `.llm-gate-cache.json` | cache only | n/a (cache not hashed) |

### What was fixed
- **Cost honesty (#2):** `estimateCostUsd` now warns instead of silently reporting `$0` for a metered call whose model has no `RATES` entry; `RATES` records its price source + as-of date and a "rename → add a key" note. A model GA/rename can't quietly zero out the cost-tracked story.
- **Gemini default temperature (#5 / ai-generation-api #4):** `1.0 → 0.7` for grounded JSON output, documented (and noted that temperature is Gemini-only — the Claude path ignores it).
- **Gemini retry asymmetry (#1, core):** a malformed Gemini response now throws the retryable wording so it gets one retry like Claude (was a native `SyntaxError` that `isRetryable()` never matched — prod had weaker malformed-output handling than dev).

### Why one bundled commit
Each hashed-file commit triggers a ~5.6-min real-model run, so the three fixes were bundled into one commit (one gate run) rather than three. The real suite exercises the **Claude (dev) path** (`setup.mjs` forces `NODE_ENV=development`), which these edits don't change — so the contract held and the gate re-proved cleanly.

### Deferred gate-locked findings (specified, not done — each needs its own ~5.6-min gate run)
- **llm-provider-wrapper #1 (deeper):** fully de-couple retry control-flow from localized error strings (introduce an `err.retryable` flag / `LlmError`), instead of the minimal string-match used here.
- **llm-provider-wrapper #3:** estimated token/cost telemetry on the Claude/dev path (so the "cost-tracked" demo isn't blank without a Gemini key). Behavior change.
- **llm-provider-wrapper #4:** `claudeAvailable()` caches a *failed* probe forever — add a TTL / cache only the positive result.
- **llm-test-gate #1:** `social.ts` is missing from `HASHED_FILES` (its edits never re-prove). Fixing it (edit the non-hashed `llm-gate.mjs`) changes the hash set → triggers one more gate run.
- **llm-test-gate #2 / #3:** prove the prod Gemini path (needs `GEMINI_API_KEY` in CI) and replace the two hardcoded chokepoint regexes with broader leak detection.

---

## Cumulative status (waves 1–6 + gate-locked)

**34 findings closed in 28 fix/feat/refactor commits across 7 tracks; 0 regressions.**

| Track | Theme | Commits | Findings |
|-------|-------|--------:|---------:|
| 1 | Numbers you can trust (correctness) | 6 | 6 |
| 2 | Stop the code lying about itself (drift/SSOT) | 6 | 6 |
| 3 | Don't crash, don't drain (robustness/security) | 6 | 7 |
| 4 | Czech, all the way down (i18n) | 4 | 4 |
| 5 | Make it convert & shareable (export features) | 2 | 2 |
| 6 | Name the magic numbers (clarity) | 3 | 5 |
| 7 | Gate-locked (LLM wrapper) | 1 (+1 chore) | 4 |
| **Total** | | **28 (+8 docs/chore)** | **34** |

**Baseline preserved end-to-end:** tsc 0 → 0 · eslint 0 → 0 · unit tests 173 → 173 · `next build` ✓ · LLM gate green (re-proved). Branch: `vibeman/ambiguity-business-fixes-2026-06-25` (unmerged). Source diff: +530 / −195 across 28 files.

## Pattern catalogue (14 durable patterns)
See each `FIXES-WAVE-N.md` for the per-wave additions (1–4 correctness, 5–7 drift/validation, 8–11 robustness, 12 i18n, 13 export-seam reuse, 14 threshold-prose-drift).

## What remains (deferred — by reason)
- **Product decisions (need human input):** contact/hire CTA (nav #1, home #4), in-article lead capture (article-reading #1), landing-language positioning (home #2).
- **Bigger builds:** multi-article CMS loader (article-content #1), "grade your own account" lead magnet (campaign-model #4), config-driven demo engine + channel-share drift (dataset-seed #3/#5), dashboard narrative export (dashboard-kpis #2), retention/pruning for reports+snapshots (campaign-sync #3, connector #5).
- **Gate-locked remainder:** see the list above (5 findings).
- **Medium/Low tail:** the per-context reports hold the full 100; ~66 Medium/Low remain (most were outside the High-value 6-wave plan). The 2 Low findings (global page-fade over `/app`, touch-only permalinks) are won't-fix-grade.
</content>
