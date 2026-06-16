# Opportunity Fix Run — Cumulative Summary (waves 1–6)

> Scan: Business Visionary + Feature Scout, 100 findings across 20 contexts (see INDEX.md).
> Fixes landed on branch `vibeman/opportunity-fixes`. Both **Critical** findings shipped.
> Baseline preserved throughout: 0 TypeScript errors / 0 ESLint errors in every committed state.

## ⚠️ Run context — concurrent editing

This run executed **while the project owner was actively developing a per-user
Firestore / multi-tenant auth refactor in the same working tree** (campaigns store,
connector, routes, a new usage/observability API, a campaign share/export endpoint).
The tree's error count fluctuated live and the index was mutated by parallel
`git add`/`commit`. Consequences for this run:

- **Wave 2 was swept into the owner's commit** `9e66ed9` (per-user Firestore) — the
  deterministic-grounding changes are there, not in a standalone commit.
- All other waves used **path-scoped commits** (`git commit -- <my files>`) so only
  my files landed and the owner's staged WIP stayed untouched.
- **Hot-zone items were deliberately deferred** to avoid duplicating/colliding with
  the owner's in-flight work (AI caching/observability, campaign export/filters,
  i18n threading into AI prompts, LLM test-gate golden snapshots).

## What shipped, by wave

### Wave 1 — Surface what's already computed (3 commits)
`35ee8fb` channel-table significance + plottable ROAS/AOV/CR trend lines + Kč anomaly impact ·
`8c60865` hero data-freshness stamp · `02e33e0` eval-cache visibility.
2 of 7 findings were already implemented (per-call AI cost telemetry in `ResultMeta`;
4th eval tool already served by `/api/campaigns/analyze`) — caught, not rebuilt.

### Wave 2 — Ground the AI in deterministic helpers (in `9e66ed9`) — **Critical #1**
`report-input.ts` injects rule-based **triage** + the **deterministic budget-reallocation
moves** (with simulated ROAS/PNO lift) into both eval prompts, with explicit instructions
that the model's score/verdict must agree — the LLM can no longer contradict the on-screen
badges/budget-move card. Added `validate` to the analysis + campaign-eval tools (were 2 of 4
unvalidated). Added two sync-over-sync triage rules (`roas_crater`, `spend_spike`) wired
per-row through the table.

### Wave 3 — Export / share / deliverables (`dddb0c7`) — **Critical #2**
`opengraph-image.tsx` data-driven OG share card (was a blank text-only link preview) ·
shared `lib/export.ts` (CSV + download, cs-CZ BOM) + Download icon · dashboard channel CSV ·
ad-generator assets CSV · content-brief Markdown export.

### Wave 4 — Persistence (`4cfba95` + lint-fix `3dd8301`)
`useAiTool` now persists each tool's last result to localStorage and restores on mount, so a
refresh no longer throws away a paid generation.

### Wave 5 — Robustness (`bd3e5c7`)
`format.ts` numeric formatters return an em-dash for non-finite input; date formatters parse
once and em-dash an unparseable value — no more "NaN Kč" / "Invalid Date" leaking into the UI
or the AI prompt builders that reuse them.

### Wave 6 — Conversion (`f974089`)
`TaskPager` renders a closing recap + CTA on the last page instead of dead-ending an empty slot.

## Deferred (with reason)

**Overlaps the owner's active work (hot zone) — left to them:**
- AI response caching + the aggregate cost/usage observability surface (owner is building `lib/usage.ts` + `/api/usage`).
- Campaign portfolio export + persistent table filters (owner is building `/api/campaigns/share` + campaigns features).
- Threading `locale` into the AI prompt builders (owner's LLM/prompt zone).
- LLM test-gate golden snapshots / latency report / Gemini-path test (owner's LLM zone).

**Cold but not reached this run (good next-run candidates):**
- i18n `LocaleProvider` + `useFormatters` hook + header cs/en switch (the locale factory already exists in `format.ts`).
- Design-system de-dup: a real `Button` primitive (hand-copied across 8+ files) + a shared SVG line-chart core (Sparkline/TrendChart/ScoreTimeline) + showcase rows.
- Article: AI/derived TLDR-takeaways box, post-read lead capture, auto-derived read time, multi-article hub + related-content rail.
- QE credibility: e2e in CI, README↔code honesty pass, env-var validation, Lighthouse/a11y gate.

## Patterns established (catalogue items 1–8)

1. **"Computed-but-discarded" is the cheapest value lever** — grep whether the value already exists before building (caught 2 Wave-1 items as already-shipped).
2. **Constant-scaling invariant** — a derived series = base × constant shares the base's relative delta and significance; reuse, don't recompute.
3. **Metadata gates hide finished features** — a `plottable:false` flag, not missing math, kept ROAS/AOV/CR off the chart.
4. **Ground the LLM in the deterministic layer** — inject the same `triage()`/`recommendBudgetMoves()` the UI shows into the prompt so the model can't contradict the screen; the single highest-trust lever for an AI-evaluation product.
5. **`validate` re-prompts beat silent clamps** — flag out-of-range/empty model output for one re-prompt instead of normalizing it away invisibly.
6. **Sync-over-sync rules need the diff threaded to the call site** — a snapshot-only `triage(c)` can't see a ROAS crater; pass the prior-sync `CampaignChange`.
7. **Path-scoped commits survive a contested index** — `git commit -- <paths>` lands only your files even when a collaborator has staged their WIP into the same index; only commit when the full tree compiles (the hook's `tsc` is project-wide).
8. **Format at the boundary, guard at the source** — non-finite/invalid inputs should degrade to an em-dash in the formatter, not leak "NaN"/"Invalid Date" into UI and prompts downstream.
