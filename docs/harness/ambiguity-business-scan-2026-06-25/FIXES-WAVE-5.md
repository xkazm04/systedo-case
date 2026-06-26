# Ambiguity+Business Fix Wave 5 — "Make it convert & shareable"

> 2 feature commits. Theme: turn on-screen-only outputs into deliverables agencies can hand
> to clients. Baseline preserved: tsc 0 → 0 · unit 173 → 173 · 0 regressions.

## Commits

| # | Commit | Finding | Files |
|---|--------|---------|-------|
| 1 | `f0e1e4b` | ai-tool-forms #3 — Performance Analysis had no export | `components/ai/PerformanceAnalyst.tsx` |
| 2 | `93cb0df` | campaign-console #2 — campaign view not exportable | `components/campaigns/CampaignTable.tsx` |

## What was built
1. **Performance Analysis → Markdown.** `exportAnalysisMarkdown` (mirrors the brief tool's exporter) emits period + headline + summary + Wins/Risks/Actions; a Download button appears in the form panel once a result exists.
2. **Campaign console → CSV.** An Export CSV button by the count serializes the *currently filtered + sorted* view — name, type, status, cost, conversions, conv. value, ROAS, PNO %, triage severity, top finding, and any loaded AI score — through the cs-CZ `toCsv`/`downloadText` helpers (semicolon delimiter + UTF-8 BOM for Czech Excel).

## Scope decisions (deferred — product calls, not bugs)
The other three "convert & shareable" findings need a human/product decision, so they were **surfaced, not fabricated:**
- **nav-header-footer #1 (end-of-journey contact/hire CTA)** and **home-app-shell #4 ("Start free" dead-ends)** — need a real contact destination (email / calendar / contact page). Inventing a `mailto:` would be a guess.
- **article-reading #1 (in-article lead capture)** — needs a lead backend + a decision on where leads go (the app *has* a leads layer, but wiring it from the public article is a product choice).
- **dashboard-kpis #2 (export the headline narrative)** — lower priority: the dashboard already exports the channel breakdown (`exportChannelsCsv`), so this is the smallest export gap; a KPI/pacing/insights report export is a clean follow-up.

These are logged for the team in the run report's follow-ups.

## Verification
tsc 0 · unit 173/173 · LLM gate green (cached).

## Pattern established (catalogue 13)
13. **Reuse the proven export seam, don't reinvent** — the repo already had `toCsv`/`downloadText` (cs-CZ semicolon + BOM) and `exportBriefMarkdown`; new exports mirror them so format, locale, and download behavior stay consistent across tools.

## What remains
Wave 6 + gate-locked track. Next: Wave 6 "Name the magic numbers" (+ the Ad Strength over-limit correctness fix).
</content>
