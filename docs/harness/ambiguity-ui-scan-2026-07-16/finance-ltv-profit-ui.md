# Finance: LTV, Profit, Spend & Client Reporting — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Cost-model currency unit flips Kč↔USD with UI locale while the stored number and all displays stay CZK
- **Severity**: High
- **Lens**: ambiguity
- **Category**: currency-unit-locale-mismatch
- **File**: src/components/app/modules/CostModelEditor.tsx:35 (cs `currencyUnit: "Kč"`) vs :53 (en `currencyUnit: "USD"`), consumed at :73, :181–182
- **Scenario**: A user with the English UI opens the cost-model form. The "Monthly overhead (USD)" / "Cost per order (USD)" labels tell them to enter dollars. They enter 500 (USD). The value is stored as a bare number and rendered everywhere with `fmtCZK` (:120 active strip, plus the report's Zisk tile downstream) — so their $500 overhead becomes 500 Kč, silently ~22× off.
- **Root cause**: The i18n string table treats the *currency of the data* as a *translation*, but the underlying model has no currency dimension — every consumer (`fmtCZK`) assumes CZK. Contrast with SpendModule.tsx:42–58, which correctly documents that LLM spend is genuinely metered in USD and formats it as USD in both locales.
- **Impact**: Wrong profit-after-costs and break-even ROAS/PNO for any EN-locale user; and even a CS user who toggles locale sees the same saved number relabelled as a different currency.
- **Fix sketch**: The cost model is CZK, full stop — make the EN label say "Monthly overhead (CZK)" (or reuse the same `Kč` unit string in both locales), matching how `fmtCZK` renders it. If USD entry is ever wanted, it needs a stored currency field, not a label swap.

## 2. Resting "Monthly churn" readout is a fabricated band-position back-projection, not the actual observed churn
- **Severity**: High
- **Lens**: ambiguity
- **Category**: misleading-derived-metric
- **File**: src/components/app/modules/LtvProjectionPanel.tsx:100–106
- **Scenario**: The projection panel loads in "Auto" mode. Next to the churn slider the user reads e.g. "Měsíční odliv 14 %" and takes it as their cohorts' measured post-observation churn — a number they may quote to a client or compare against their retention dashboard.
- **Root cause**: `autoImpliedRatio` is not derived from any cohort's actual decay. It linearly maps the expected LTV's *position inside the low…high band* (`(expected − low)/(high − low)`) onto the `[TAIL_RATIO_MIN, TAIL_RATIO_MAX]` interval. That fraction has no churn semantics — with an asymmetric band the readout can be far from every cohort's real tail ratio, yet it renders in the same `tnum` slot as the real override value (:207), with nothing distinguishing "implied slider position" from "your churn is X%".
- **Impact**: Users anchor on a wrong churn number; worse, nudging the slider by one step from rest can visibly change LTV even though the displayed churn barely moved (the rest value never fed the math), which reads as a glitch and undermines trust in the whole projection.
- **Fix sketch**: At rest, either show a real blended observed tail ratio (e.g. signup-weighted clamped decay across cohorts — the value the "auto" expected line actually uses) or show "Auto" in the readout slot instead of a percentage, and only display a number once the user engages the slider.

## 3. Competitor cap: hint promises "max 8" but the editor accepts and submits 9
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-limit-mismatch
- **File**: src/components/app/modules/CompetitorEditor.tsx:66 (`trimmed.slice(0, 9)`) vs :23/:35 (hint "max 8")
- **Scenario**: A user adds competitors one by one. The list grows to 8 names + 1 trailing blank = 9 inputs (the slice cap). They type into the trailing blank — now all 9 inputs hold names, no new blank appears (sliced off), and Save posts 9 competitors while the UI text says the limit is 8.
- **Root cause**: The magic `9` encodes "8 names + 1 trailing blank", but once the last slot is *filled* the invariant breaks: the cap counts inputs, not names, and nothing on the client enforces or surfaces the advertised 8-name limit. Whether the server rejects, truncates, or accepts 9 is invisible from here — three different behaviors, all surprising.
- **Impact**: Either a confusing save error, a silently dropped 9th competitor, or an over-cap set that contradicts the product copy grounding the AI narrative.
- **Fix sketch**: Extract `const MAX_COMPETITORS = 8`, slice names (not slots) to it, stop adding a trailing blank at 8 names, and derive both the hint text and `slice(MAX_COMPETITORS + 1)` from the constant.

## 4. Destructive "Zrušit model" / "Zrušit" (competitors) fire immediately with no confirmation and swallow failures
- **Severity**: Medium
- **Lens**: ui
- **Category**: destructive-action-inconsistency
- **File**: src/components/app/modules/CostModelEditor.tsx:109–117; src/components/app/modules/CompetitorEditor.tsx:95–103
- **Scenario**: In the same MonthlyReport surface, "Disconnect live data" gets a full confirm Modal with an explanation and error surfacing (MonthlyReport.tsx:457–484), but "Remove model" and "Remove competitors" — which also destroy saved configuration — delete on a single click. Both `remove()`/`clear()` also ignore the response entirely: on a failed DELETE they just `router.refresh()`, the strip re-renders unchanged, and the user's click appears to do nothing, with no message.
- **Root cause**: The two editors' delete paths have no `res.ok` check and no `setErr`, unlike their own `save()` paths; and the report's destructive-action pattern (confirm + error) wasn't applied consistently across sibling controls.
- **Impact**: Accidental one-click loss of the cost model (which changes the report's profit line) and of the competitor set; on API failure, a silent no-op that reads as a broken button.
- **Fix sketch**: Check `res.ok` and reuse the existing `t("failed")` error slot in both delete handlers; add a lightweight confirm (the shared Modal, or at minimum a two-step "Sure?" state on the button) to match the unlink flow's care level.

## 5. Cohort trend percentages hard-code `rows[0]` as the delta base — a hidden ordering contract with `cohortTrend`
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: implicit-ordering-coupling
- **File**: src/components/app/modules/LtvModule.tsx:349–350
- **Scenario**: The trend subtitle renders "{from} → {to}: CAC +12 %…" by dividing `trend.cacDelta` / `trend.ltvDelta` (absolute deltas computed inside `cohortTrend(rows)`) by `rows[0]!.cac` / `rows[0]!.ltv`. This is only correct if `rows[0]` is exactly the cohort `cohortTrend` used as its "from" endpoint — an ordering assumption stated nowhere at the call site or in the props (`rows: CohortMetrics[]` carries no sort contract).
- **Root cause**: The relative-percent computation was split across two modules: the compute layer returns absolute deltas plus month labels, and the view re-derives the base by positional indexing with a non-null assertion. Any future caller passing rows newest-first (or `cohortTrend` changing its endpoint choice, e.g. skipping a partial first cohort) silently produces wrong percentages while the `{from} → {to}` labels still look right.
- **Impact**: A subtle wrong-number class of bug in a client-facing headline metric, undetectable visually because labels and values come from different sources.
- **Fix sketch**: Have `cohortTrend` return the relative percentages (or the base values) itself — it already knows both endpoints — and drop the `rows[0]!` indexing from the view.
