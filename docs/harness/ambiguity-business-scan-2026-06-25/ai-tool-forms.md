# AI Tool Forms (Ads, Brief, Analysis) — Ambiguity + Business scan
> Context: Three client-side AI tool forms — PPC ad generator (limit checks + Ad Strength meter + RSA preview), SEO content-brief builder (SERP preview + scorecard), and a dashboard-grounded performance analyst.
> Files analyzed: 4
> Total findings: 5

## 1. Czech (default) locale shows English UI strings across the Content Brief tool
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/components/ai/ContentBriefGenerator.tsx:62
- **Problem/Opportunity**: In the `cs` translation block, ~15 keys still hold English values: `serpTruncatedBoth`/`serpTruncatedTitle`/`serpTruncatedMeta` (62–64), `serpMetaFallback` (65), `seoReadability` "Readability" (67), `seoKeywordCoverage` "Keyword coverage" (68), `seoEeat` "Authority (E-E-A-T)" (69), `groupOutline` "Outline" (71), `groupOutlineSections` "{n} sections" (72), `groupFaqQuestions` "{n} questions" (74), `groupKeywords` "Keywords" (75), `groupInternalLinks` (76), `rationaleTitle` "Why this approach" (77). The `cs` and `en` blocks are byte-identical for these keys, so the strings were simply never translated. AdGenerator's `cs` block is fully Czech, so this is isolated to the brief tool.
- **Why it matters**: This is a cs-CZ-first marketing case study; the default-locale user sees half the SERP/scorecard/section UI in English, which directly undercuts the "polished agency demo" impression.
- **Fix sketch**: Translate the listed `T.cs` values (e.g. `seoReadability` → "Čitelnost", `groupOutline` → "Osnova", `groupOutlineSections` → "{n} sekcí", `rationaleTitle` → "Proč právě takhle"). Pure client UI, not gate-triggering. Keep JSX quotes as „…" where any value ends up inline.

## 2. Ad Strength can rate a set "Výborná / Excellent" while headlines exceed the character limits the tool advertises
- **Lens**: 🌀 Ambiguity (happy-path ignores the over-limit edge case)
- **Value**: High
- **Effort**: S
- **File**: src/lib/ad-strength.ts:82
- **Problem/Opportunity**: `computeAdStrength` weighs count, distinctness, length spread, keyword coverage, descriptions and callouts — but never compares any asset's `.length` against `AD_LIMITS` (it doesn't even import them). So an over-limit headline (>30) or description (>90) is flagged red by the per-row `TextRow` (AdGenerator.tsx:567/575) yet the composite meter can still show "Výborná 90/100". The file's own header (ad-strength.ts:6) promises the score lets the user "see at a glance whether the set is launch-ready" — but a set with launch-blocking over-limit assets is exactly what it fails to catch.
- **Why it matters**: Character-limit checking is the headline selling point of the ad tool (emptyBody, AdGenerator.tsx:62); a top-line "Excellent" that hides unusable assets is a credibility-damaging contradiction.
- **Fix sketch**: In `computeAdStrength`, import `AD_LIMITS` and add a "within limits" factor (or a hard cap that prevents `good`/`excellent` when any asset is over limit), with a Czech/EN detail line naming the offending count. `src/lib/ad-strength.ts` is NOT in the commit-gate hash list — not gate-triggering.

## 3. Performance Analysis has no export — the most client-presentable output can only be copied as plain text
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: src/components/ai/PerformanceAnalyst.tsx:157
- **Problem/Opportunity**: AdGenerator exports CSV (`exportAdsCsv`, AdGenerator.tsx:350) and ContentBrief exports Markdown (`exportBriefMarkdown`, ContentBriefGenerator.tsx:342), but PerformanceAnalyst offers only the generic copy-all via `ResultMeta` (line 157). The performance summary (headline + wins + risks + numbered actions) is precisely the artifact an agency hands a client, yet there is no "Download report".
- **Why it matters**: A one-click client-ready deliverable (Markdown/PDF) is the natural "wow" of an analysis tool and the clearest demonstrable value in the demo — agencies live on monthly performance reports.
- **Fix sketch**: Add an `exportAnalysisMarkdown` mirroring `exportBriefMarkdown` — period label + headline + summary + Wins/Risks/Actions sections via `downloadText(..., "text/markdown")`, plus a Download button next to `ResultMeta`. Pure client UI, not gate-triggering.

## 4. Ad Strength weights, goals and rating cutoffs are magic numbers with no recorded reasoning
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/ad-strength.ts:220
- **Problem/Opportunity**: The rating thresholds `score >= 85 / 65 / 40` (line 220–221), the per-factor weights `22/20/15/20/13/10` (lines 119–203), the goals `HEADLINE_GOAL=8`, `HEADLINE_MIN=5`, `DESC_GOAL=4`, `CALLOUT_GOAL=4`, `KEYWORD_COVERAGE_GOAL=0.5` (lines 46–52), and the length buckets `≤15 / ≤24` (line 77) all appear without a source or rationale. The header explains the *philosophy* ("weights the same things Google's signal does") but not why these specific numbers, nor that they're a deliberate approximation rather than Google's real (undocumented) formula.
- **Why it matters**: A reviewer can't tell whether "85 = excellent" is grounded or arbitrary, and a future edit could silently shift every rating; the implicit "this is a heuristic, not Google's actual algorithm" assumption should be explicit so nobody over-trusts the number.
- **Fix sketch**: Add a short comment block above the weights/thresholds stating they are a hand-tuned heuristic (weights sum to 100; cutoffs chosen so a 5-headline minimum set lands ~"average"), citing Google's published RSA recommendations as the source for the *goals*. Comment-only change in `src/lib/ad-strength.ts`; not gate-triggering.

## 5. Close the loop — make the analyst's "Recommended actions" launch the Ad/Brief generators pre-filled
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: src/components/ai/PerformanceAnalyst.tsx:204
- **Problem/Opportunity**: The analyst renders actions as static text (`a.title` / `a.detail`, lines 213–214) that the user must read and then manually retype into the ad or brief tool. The brief tool already proves cross-tool hand-off works (it accepts a `seed` and prefills via lazy init, ContentBriefGenerator.tsx:298–307), so the plumbing exists — the analysis just dead-ends instead of feeding it.
- **Why it matters**: Turning an insight ("expand the kešu campaign") into a one-click pre-filled ad/brief generation is the differentiating "assistant that acts, not just reports" story and a strong retention/engagement loop for the demo.
- **Fix sketch**: For action items whose `detail`/`title` map to ads or content, render a secondary "Vytvořit inzerát / brief" link that deep-links to the tools page with query params (e.g. `?tool=ads&product=…`) consumed as the existing `seed`/`EXAMPLE`-style prefill. Pure client UI/routing; not gate-triggering.
