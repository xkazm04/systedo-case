# Performance Dashboard & Reporting

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Trend chart clips negative `profit` (loss days) below a y-axis floor hard-wired to 0

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/dashboard/TrendChart.tsx:184`
- **Scenario**: `profit` is a selectable trend metric (`TREND_METRICS`, meta.ts:209) and is defined as `revenue − cost` per bucket (`series.ts:84`), so any day/month where ad spend exceeds revenue — precisely the outage / over-spend days the dashboard exists to surface — yields a **negative** profit value. For every non-ratio metric the axis is anchored at zero: `const yMin = isRatio ? Math.max(0, dataMin * 0.85) : 0;` (line 184). `dataMin` (line 180) is computed but only consulted for the *ratio* branch, so a negative profit never widens the domain. `y(v)` (lines 191-194) has no clamp, so `y(-50000)` returns a coordinate **greater than `PAD.t + plotH`** — the point and line are drawn below the plot area, over the x-axis labels / outside the `viewBox`, and the area-fill polygon (`areaPath`, which closes at `H - PAD.b`, the y=0 baseline) degenerates.
- **Root cause**: the assumption that "everything that isn't a ratio metric is non-negative" — true for revenue/cost/visits/conversions but false for the contribution metric `profit`.
- **Impact**: on the Profit ("Zisk") trend view, a loss day/month is rendered off the bottom of the chart instead of below the zero line — the flagship performance chart visibly breaks exactly on the periods that matter most, and a viewer cannot read the magnitude of a loss.
- **Fix sketch**: when `!isRatio`, set `yMin = Math.min(0, dataMin)` (keep 0 as the anchor for all-positive series but let it drop for negatives) and draw the area/zero-reference off the `y(0)` line rather than `H - PAD.b`. Alternatively clamp `y()` and render a dedicated zero baseline. The already-computed `dataMin` is the value to use.

## 2. Report chat reports "failed to send" and swallows the real error when the AI reply has an unexpected shape

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/dashboard/ReportChat.tsx:66`
- **Scenario**: `post()` does `if (!res.ok) { setError(...); return; }` and then `setMessages((m) => [...m, { role: "assistant", content: data.result.reply }])` (line 66). If the endpoint returns HTTP 200 but a payload whose `result` is missing (moderation refusal, degraded/demo fallback with a different envelope, partial JSON), then `data.result.reply` throws a `TypeError`, which is caught by the bare `catch {` at line 67 that sets the generic `"Nepodařilo se odeslat zprávu."` ("failed to send the message"). If `result` exists but `reply` is `undefined`, an **empty assistant bubble** is rendered with no error at all.
- **Root cause**: one broad `try/catch` treats network failure, non-OK responses, and response-shape mismatches as the same "send failed" condition, and the success path trusts `data.result.reply` to always exist.
- **Impact**: the user is told the message failed to send when it actually reached the model and came back — misleading, and `retry()` will re-POST the identical request in a loop that can never succeed; or the user sees a blank reply bubble (success theater). The real cause (bad response shape / server 200-with-error) is discarded.
- **Fix sketch**: guard the success path (`const reply = data?.result?.reply; if (typeof reply !== "string") { setError(...distinct message...); return; }`) and keep the `catch` for genuine transport failures. Distinguish "send failed" from "the assistant returned nothing".

## 3. `Segmented`'s measuring effect re-runs every render because `options` is a fresh array each time

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/dashboard/vykon/Segmented.tsx:30`
- **Scenario**: the pill-measuring effect declares `[value, options]` as its dependencies (line 30). Both call sites pass a freshly-built array literal every render — `PERIODS.map(...)` in `PeriodHeader.tsx:85` and `TREND_METRICS.map(...)` in `TrendCard.tsx:130`. Because `options` is a new reference on each parent render, the dependency comparison never sees it as equal, so the effect fires on **every** re-render of `DashboardClient` (period switch, metric switch, alert focus), each time forcing a synchronous layout read (`el.offsetLeft`/`el.offsetWidth`) and removing + re-adding a `window` `resize` listener.
- **Root cause**: an effect keyed on a prop that is structurally stable but referentially unstable — the dependency array can never do its job.
- **Impact**: needless forced reflow and listener churn on each dashboard interaction. Low user impact, but the effect's dependency guard is silently defeated, which is a foot-gun if the effect ever grows heavier.
- **Fix sketch**: memoize `options` at the call sites (`useMemo`), or depend on a derived stable signal (e.g. `options.length` + `value`) instead of the array reference, or move the resize listener into its own mount-once effect and re-measure via a `useLayoutEffect` keyed on `value` only.

## 4. Czech day/week pluralization is wrong for compound numbers ending in 2–4 (e.g. 22)

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/dashboard/vykon/plural.ts:7`
- **Scenario**: `dayWord` (line 7) and `weekWord` (line 14) implement the Czech few/many split with a bare `n >= 2 && n <= 4` test. Czech's paucal ("dny"/"týdny") form is governed by the *last digit* (2–4, excluding the 12–14 teens), not the absolute range: 22, 23, 24, 32… should read "dny", and 12–14 should read "dní". A truncated series of, say, 22 days renders `PeriodHeader`'s hint as "zkráceno na 22 dní" instead of the correct "22 dny". The code comment ("2–4 dny / 5+ dní") shows the 3-form model was a deliberate simplification, but it is grammatically incorrect above 4.
- **Root cause**: pluralization treats the number's magnitude instead of its final digit; the CLDR Czech `few` category is `n % 10 in 2..4 && n % 100 not in 12..14`.
- **Impact**: incorrect Czech grammar on the truncation hint (`dayWord`, driven by `actualDays` which can be any 1–365) — user-visible in the flagship Czech locale. Weeks-in-a-row insight rarely exceeds 4, so `weekWord` is mostly safe.
- **Fix sketch**: switch to `Intl.PluralRules(intlLocale, ...).select(n)` with a form table, or fix the predicate to `const r10 = n % 10, r100 = n % 100; const few = r10 >= 2 && r10 <= 4 && !(r100 >= 12 && r100 <= 14);`.

## 5. Anomaly "favourable?" + reason-text logic is duplicated between AlertsPanel and TrendChart

- **Severity**: Medium
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/dashboard/vykon/AlertsPanel.tsx:58`
- **Scenario**: `AlertsPanel.anomalyLine` (lines 50-81) computes `devPct = a.expected > 0 ? (a.observed - a.expected) / a.expected : 0`, the favourable rule (`outage`/`goal-breach` → false, `spike` → `good === "up"`, `drop` → `good === "down"`), and a per-kind localized string. `TrendChart.tsx` re-implements the **same three things** independently: `anomalyReason` (lines 323-335, same `devPct` guard and the same spike/drop/outage/goal-breach → string switch) and `anomalyFavourable` (lines 338-341, byte-for-byte the same favourable rule). The two live in the same feature and consume the same `Anomaly`/`goodDirection` inputs. This is distinct from every item in the 2026-07-09 code_refactor report (which covered CSV precision, the delta noise floor, the PNO gauge constant, `weekdayName`'s location, and the gauge-`pct` helper — none touch anomaly presentation).
- **Root cause**: no shared "anomaly → {favourable, reason}" presentation helper; each component that surfaces anomalies grew its own copy.
- **Impact**: the alert list and the chart marker/tooltip must agree on tone and wording for the same flagged day; a change to the favourability rule or a new `Anomaly.kind` has to be edited in two places, and a miss desyncs the green/red tone (and the sentence) between the alert row and its chart diamond.
- **Fix sketch**: extract `anomalyDeviationPct(a)`, `anomalyFavourable(a, good)` and a localized `anomalyReason(a, t, fmt)` into a shared module (e.g. `dashboard/vykon/anomaly-line.ts` next to `plural.ts`) and have both `AlertsPanel` and `TrendChart` import them.
