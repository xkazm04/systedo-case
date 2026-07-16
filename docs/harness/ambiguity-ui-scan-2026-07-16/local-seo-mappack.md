# Local SEO & Map Pack — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

## 1. Coverage import silently no-ops on diacritics despite a docstring that claims otherwise
- **Severity**: High
- **Lens**: ambiguity
- **Category**: silent-mismatch-diacritics
- **File**: src/lib/local-signals/import.ts:473 (coverageKey), src/lib/local-signals/resolve.ts:148-153
- **Scenario**: A Czech user imports a coverage CSV typed without diacritics (`Plzen`, `Usti`) or with a slightly different service wording. `coverageKey` only trims + lowercases, so the row never matches the catalog-seeded target whose `area` is `Plzeň`. `resolveCoverage` looks up seeds by key and drops every unmatched imported row on the floor — no append, no count, no warning (unlike `mergeGbp`, which appends unmatched rows, or `parseReviews`, which counts rejected rows).
- **Root cause**: The `coverageKey` docstring explicitly promises the overlay works "without diacritic or whitespace drift", but there is no `normalize("NFD")` fold (the codebase already has one in `locations/compute.ts:nameKey`). Combined with resolve's match-or-ignore policy, mismatches are invisible.
- **Impact**: The user imports real page-presence data, the matrix doesn't change, and there is no signal why. In a Czech-language product, locality names with diacritics are the norm, so this is the common path, not the edge.
- **Fix sketch**: Make `coverageKey` fold diacritics like `nameKey` (and do the same for the seeded side in `resolveCoverage`). Additionally have `resolveCoverage`/the import route report how many imported rows matched vs. didn't (mirroring the reviews parser's `ambiguous` counter), so a service-name mismatch is surfaced instead of swallowed.

## 2. A "live"-labelled coverage matrix still shows hash-seeded fictional ranks
- **Severity**: High
- **Lens**: ambiguity
- **Category**: live-sample-blending
- **File**: src/lib/local-signals/resolve.ts:152; src/lib/local/catalog.ts:19
- **Scenario**: A project imports coverage. `resolveCoverage` returns `live: true` with the coverage section's provenance, and for every combo where `hasPage` is true it keeps `t.rank` — which is `targetsFromCatalog`'s deterministic hash seed (`seed01(k+":rank") * 18`), pure fiction. The matrix, `localSummary.coveredButWeak`, and any downstream surface now present fabricated SERP positions under a "live data" label.
- **Root cause**: The coverage import only carries `hasPage`; the resolver clears rank on `hasPage: false` ("no page → no rank") but leaves the seeded rank when the page exists, and the single `live` flag has no way to say "presence is live, rank is sample". This module's own stated principle (types.ts header: sample data must be "honestly marked") is violated for the rank column.
- **Impact**: A client-facing matrix/summary mixes real page-presence with invented rankings while claiming live provenance — exactly the silent live/sample blend the per-source tags in summary.ts were built to prevent. `coveredButWeak` ("covered but ranking >10") becomes a fabricated KPI.
- **Fix sketch**: When coverage is live, either null the rank for combos the ladder doesn't actually track (rank truth lives in the imported ladder — resolve it there by keyword×area), or extend `ResolvedCoverage` with a per-field provenance (`rankSource: "sample"`) so UI/summary can label or suppress the rank column.

## 3. Recap counts `untracked` (stale) keywords as if their ranks were current
- **Severity**: High
- **Lens**: ambiguity
- **Category**: retention-flag-ignored
- **File**: src/lib/local-signals/summary.ts:37-44
- **Scenario**: A user's second import covers a subset of keywords (the documented D2 retention case). Omitted keywords are kept with `untracked: true` and a frozen `current` from months ago. `localSignalsPromptText` then computes `tracked = ladder.length`, `inPack`, `top1`, `avgRank` over the whole ladder — stale ranks included — and the monthly recap tells the client "sledováno N kombinací, v top 3 M" using positions that may be long gone.
- **Root cause**: The D2 design added `untracked` precisely so consumers can tell retained history from current observations (mappack/sample.ts:69-72 documents this), but the recap grounding — the one consumer that turns these numbers into client-facing prose — never reads the flag.
- **Impact**: The recap overstates (or misstates) current map-pack coverage after any partial import; the "improved/declined since last import" trend also mixes keywords whose "last import" was a different date.
- **Fix sketch**: In summary.ts, compute the coverage stats over `ladder.filter(k => !k.untracked)` and, when untracked keywords exist, add one honest line ("X dalších klíčových slov nebylo v posledním importu") instead of folding them into the current numbers.

## 4. Same-day re-import appends duplicate points and the 12-point cap silently corrupts "best"
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: history-merge-edge-cases
- **File**: src/lib/local-signals/import.ts:129-136 (mergeLadder), :91 (HISTORY_CAP)
- **Scenario**: (a) A user re-imports the same day to fix a typo'd CSV: `mergeLadder` appends a second point with the identical `at` date instead of replacing today's observation — `changeSinceLast` then reports a same-day "trend", `observedSpanDays` sees 0-day gaps, and a few repeated imports flush real history out of the 12-point window. (b) Once any point slides past `HISTORY_CAP = 12`, `best = Math.min(...history)` is recomputed over the window only, so a keyword's all-time best position quietly worsens — while the field is documented and rendered as "best".
- **Root cause**: The merge has no dedup-by-date rule, and the retention cap is applied before recomputing a field whose name promises an all-time property; neither trade-off is stated at the definition of `HISTORY_CAP` (a bare magic number).
- **Impact**: Trend/best figures shown to clients drift from the truth in ways no one can reproduce from the current blob; "best" is actually "best of the last 12 observations".
- **Fix sketch**: In `mergeLadder`, replace (not append) a fresh point whose `at` day equals the last history point's day; carry `best` forward as `Math.min(prev.best, ...newPoints)` so the cap can't erase it; document the 12-point window where HISTORY_CAP is defined.

## 5. Unrecognised GBP status defaults to "connected", hiding problems from the attention queue
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: optimistic-default-health
- **File**: src/lib/local-signals/import.ts:388-398 (parseGbpStatus)
- **Scenario**: A GBP export contains a status wording the two regexes don't cover — "suspended", "pozastaveno", "pending verification", "ověřování". The parser maps it to `connected`, the healthiest state.
- **Root cause**: `parseGbpStatus` explicitly "defaults to connected when the value is present but unrecognised". For a health field feeding `needsAttention` (`r.gbp !== "connected"`) and `attentionScore`, the fail-open default inverts the field's purpose; the trade-off is noted in a docstring but the roster UI has no way to show "status unknown".
- **Impact**: The worst-off locations (suspended profiles are the classic GBP emergency) can rank as healthy, drop out of the needs-attention count, and sort to the bottom of the urgency list — the exact opposite of what the roster exists for.
- **Fix sketch**: Default unrecognised non-empty statuses to `attention` (fail-attention, not fail-healthy), keeping `connected` only for explicit affirmatives (connected/aktivní/ok/verified); optionally count unrecognised cells during import so the user sees "N statuses not understood".
