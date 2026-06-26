# Czech Formatting Helpers — Ambiguity + Business scan
> Context: Centralised cs-CZ locale formatting layer (currency/percent/deltas/dates/ranges/relative + a11y compact pairs) shared by every page and AI prompt.
> Files analyzed: 1
> Total findings: 5

## 1. `fmtSignedPct` can emit "−0,0 %" / "+0,0 %" — sign decided before rounding
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/lib/format.ts:124
- **Problem/Opportunity**: The sign is chosen from the *raw* fraction (`fraction > 0 ? "+" : fraction < 0 ? "−"`), but the magnitude is rounded by `fmtPct` to `digits` (default 1). A tiny delta like `-0.0004` keeps the `−` sign yet rounds to `0,0 %`, rendering `−0,0 %`. Note the sibling `fmtSignedInt` (line 130) deliberately rounds *first* (`const r = Math.round(n)`) and derives the sign from `r` — so the two signed helpers disagree on how to treat near-zero, and only the percent one is wrong.
- **Why it matters**: A delta chip reading "−0,0 %" next to a client-facing KPI looks like a rendering bug and erodes trust in every number on the page; these deltas also flow verbatim into AI prompt text (e.g. triage.ts:176).
- **Fix sketch**: Mirror `fmtSignedInt`: round the *displayed* value to `digits` first, then derive the sign from the rounded number (or treat `|rounded| < 0.5·10^-digits` as zero → no sign). One-line change inside `fmtSignedPct`.

## 2. The "switch one config for another market" promise is broken — `fmtRange`/month helpers hardcode Czech word order
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/lib/format.ts:207
- **Problem/Opportunity**: The header (lines 1–5) and `LOCALES` (with a ready `en`/USD entry, line 20) sell a clean multi-locale scaling story. But `fmtRange` (207–222) manually composes `"{day}. {month} {year}"` — Czech day-first order with a genitive month name. Under `en` this yields strings like `"1.–31. May 2026"` / `"28. April – 4. May 2026"`, which are not valid English (`May 1–31, 2026`). `fmtMonthLong` (168) and the genitive/nominative reasoning baked into the comments are likewise cs-only. So the `en` instance silently produces broken dates while currency/number paths work.
- **Why it matters**: i18n-readiness is the headline product-scaling pitch; a prospective expansion to an `en` market would ship grammatically broken date ranges in exactly the period headings clients read first.
- **Fix sketch**: Make range composition locale-driven: keep the cs hand-composition behind `if (locale === "cs")`, and for other locales fall back to `Intl.DateTimeFormat.formatRange(da, db)` (accepting Intl's numeric-month output) or a per-locale template. Add a one-line note that custom composition exists only because cs `formatRange` drops the month name (already explained at 196–198).

## 3. `fmtPct`'s "fraction" input contract is implicit and collides with `*Pct` field names — 100× error risk
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: M
- **File**: src/lib/format.ts:113
- **Problem/Opportunity**: `fmtPct(fraction)` expects `0.165 → "16,5 %"`, documented only in a JSDoc line. Yet call sites pass fields whose names imply they are already percentages — e.g. `p.trafficChangePct` (aggregate.ts:212) and `qualRate`/`confidence`. These happen to be fractions today (confirmed: `trafficChangePct` is compared to `-0.3` at aggregate.ts:207), but the `Pct`-named-field-into-`fmtPct(fraction)` pattern is a latent footgun: any future field that stores `12` for "12 %" would render `"1 200 %"`.
- **Why it matters**: A silent 100× error in a client KPI (and in the AI prompt text that quotes it) is the highest-trust-damage failure this layer can produce, and the type system gives zero protection.
- **Fix sketch**: Introduce a `Fraction` branded type (`type Fraction = number & { __fraction: true }`) for the percent params, or rename the parameter `ratio` and add an explicit "input is 0–1, not 0–100" line to the JSDoc plus a dev-only `console.warn` when `Math.abs(fraction) > sane bound`. Cheapest first step: the doc + naming clarification.

## 4. Number formatters are re-instantiated on every call while date formatters are memoised — inconsistent and costly at scale
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/format.ts:73
- **Problem/Opportunity**: `RANGE_PARTS` (190) and `RELATIVE` (224) are built once per factory, but `fmtInt`, `fmtDecimal`, `fmtCZK`, `fmtCZKCompact`, `fmtCompact`, `fmtPct` each call `new Intl.NumberFormat(...)` on *every* invocation. `Intl.NumberFormat` construction is the expensive part. Report/prompt builders loop these over whole campaign portfolios (report-input.ts) and ~199 call sites render tables, so the cost compounds.
- **Why it matters**: Wasted allocation on every cell render and on server-side prompt assembly; the inconsistency also signals the perf trade-off was never decided deliberately.
- **Fix sketch**: Hoist the formatters to `const NF_INT = new Intl.NumberFormat(...)` etc. inside `createFormatters` (same pattern already used for `RANGE_PARTS`/`RELATIVE`) and reference them in the closures. No API change, no call-site change.

## 5. `parseDate` silently assumes *local* midnight; relative-time divisor `4.34524` is an unexplained magic number
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/lib/format.ts:141
- **Problem/Opportunity**: For a date-only string, `parseDate` appends `T00:00:00` (141), which the runtime interprets in its *local* timezone — unlike a bare `"2026-06-25"` which JS parses as UTC. This decision is undocumented. In a Next.js 16 app the server (likely UTC) and the browser (Europe/Prague) then anchor the same date to different instants, so `fmtRelative` ("před 3 dny") and `fmtDateTime` can disagree server-vs-client → hydration drift. Separately, `RELATIVE_DIVISIONS` uses `4.34524` weeks/month (line 60) with no note that it is `365.2425/12/7`, and the final fallthrough to `"year"` is an approximation.
- **Why it matters**: Time-relative copy is shown to clients and embedded in prompts; a server/client mismatch produces React hydration warnings and inconsistent "freshness" claims, and the bare magic number invites accidental edits.
- **Fix sketch**: Add a comment recording the local-midnight choice (and confirm it is intended, e.g. pin a TZ or treat date-only as UTC consistently); annotate `4.34524` as `// avg weeks/month = 365.2425 / 12 / 7` and note the year bucket is approximate. Optionally accept an explicit `timeZone` in `LocaleConfig` to remove the SSR ambiguity entirely.
