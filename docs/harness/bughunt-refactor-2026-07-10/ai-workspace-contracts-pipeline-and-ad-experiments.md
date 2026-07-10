# AI Workspace Contracts, Pipeline & Ad Experiments

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

Note: prior code-refactor finding #1 (experiment-types reimplementing `metrics/ratios`) is already fixed — `experiment-types.ts:7` now imports `{ ctr, cr, cpa, roas }` and the four `variantXxx` fns delegate. Prior #2 (lp-variant inline dedupe) is still open but not restated here. No genuinely-new refactor cluster survived the dedupe check, so this pass is all bug-hunter.

## 1. Ad-experiment save is a non-atomic read-modify-write — concurrent saves silently lose a variant or fork the experiment

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/ai/experiments.ts:54`
- **Scenario**: `upsertExperimentVariant` does `findByName` → read `existing.variants` → `[...existing.variants, makeVariant(...)]` → `expCol.doc(id).set(persist(updated), { merge: true })` with no transaction. Two POSTs to `/api/experiments` for the same `name` (two browser tabs, a double-click, or a client retry) both read the same 1-variant snapshot, each build a 2-variant array, and the second `.set` overwrites the first. `merge: true` does **not** array-merge — Firestore replaces the whole `variants` array — so one just-saved variant vanishes on the next `listExperiments`. The create branch (`experiments.ts:61-70`) has the twin defect: two concurrent first-saves of a new name both get `findByName === null` and both `.add()`, forking one A/B test into two docs with the same name; later variants then scatter across whichever duplicate `findByName` returns first.
- **Root cause**: Assumes the read-modify-write is effectively serial per experiment; there is no `firestore.runTransaction`/`FieldValue.arrayUnion` and no idempotency key, so the last writer wins on the full array.
- **Impact**: Silent data loss of a saved ad variant (the POST returns 200 with the experiment echoed, so the UI shows success) plus duplicate experiments that permanently split a test's variants.
- **Fix sketch**: Wrap both mutators in `firestore.runTransaction` (re-read the doc inside the txn, then write), and for the append use `FieldValue.arrayUnion(makeVariant(...))` so concurrent adds compose instead of clobber. For the create-by-name fork, key the doc id on a normalized name (`doc(slug(name))`) so a concurrent create collapses to one doc instead of two `.add()`s.

## 2. `updateVariantMetrics` reports success for an unknown variantId without recording anything

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/ai/experiments.ts:84`
- **Scenario**: `updateVariantMetrics` maps `exp.variants.map(v => v.id === variantId ? { ...v, metrics } : v)`. If `variantId` matches no variant (a stale id from a variant that lived on a now-duplicated experiment per finding #1, a client bug, or an experiment edited in another tab), the map changes nothing, `.set(persist(updated), { merge: true })` writes the unchanged variants (only `updatedAt` bumps), and the function returns the experiment as if the write applied. The route (`api/experiments/route.ts:107-109`) only 404s when the whole experiment is missing, so the caller gets 200 + the experiment back and believes the entered performance numbers were saved — they were silently dropped.
- **Root cause**: The function assumes `variantId` always resolves; it never asserts that at least one variant matched before treating the write as a success.
- **Impact**: Success theater — a user enters real spend/conversion metrics, sees a 200 and the returned experiment, but the metrics are never persisted; the winner is then decided on stale/absent data.
- **Fix sketch**: After the `.map`, check `if (!exp.variants.some(v => v.id === variantId)) return null;` (or a distinct "variant not found" result) so the route can 404, matching the existing missing-experiment path.

## 3. Adding an unmeasured variant silently demotes the real ROAS winner to a predicted-strength guess

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/ai/experiment-types.ts:62`
- **Scenario**: `hasPerformanceBasis` requires **every** variant to have `metrics != null && cost > 0`; `pickWinner` (`experiment-types.ts:71-77`) only scores by real ROAS when that holds, otherwise it ranks by predicted `strength`. Take a live test with two variants that both have real metrics — the winner badge reflects actual ROAS. The user adds a third creative to test; its `metrics` is `null`, so `hasPerformanceBasis` flips to `false` and, because `persist()` (`experiments.ts:22`) recomputes `winnerVariantId` on that mutation, the stored winner jumps from the proven ROAS leader to whichever variant merely has the highest **predicted** strength. The performance data of the two measured arms is discarded the moment an unmeasured challenger is added.
- **Root cause**: The all-or-nothing gate assumes a test is either fully-measured or fully-unmeasured; it has no notion of "decide among the variants that do have spend."
- **Impact**: User-visibly wrong winner — the badge/recommendation flips to an unproven variant exactly when the user is expanding a test, encouraging budget moved to a creative with zero measured performance.
- **Fix sketch**: Decide the winner over the subset of variants that have `metrics && cost > 0` when at least two qualify (rank those by ROAS), and fall back to strength only when fewer than two measured variants exist; keep unmeasured variants out of the ROAS race rather than collapsing the whole experiment to strength.

## 4. `pickWinner` ranks pure ROAS with no minimum-spend/sample floor — a one-click fluke beats a proven variant

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/ai/experiment-types.ts:71`
- **Scenario**: Once `hasPerformanceBasis` is true (every variant merely has `cost > 0` — `cost` is coerced with `Math.max(0, …)` at `api/experiments/route.ts:20`, so `cost = 0.01` passes), `pickWinner` takes the single highest `variantRoas = convValue / cost` with no threshold on impressions, clicks, conversions, or spend magnitude. A variant with 2 impressions, 1 click, 1 conversion, `cost = 1`, `convValue = 1200` scores ROAS 1200 and beats a variant with thousands of conversions at a stable ROAS of 4. The "winner" is statistical noise.
- **Root cause**: Assumes any nonzero spend makes ROAS comparable; there is no minimum-sample or minimum-spend guard, and no tie/near-tie band, so a tiny-denominator ratio dominates.
- **Impact**: Wrong business recommendation — the declared A/B winner (surfaced in the experiments UI and activity feed) can be a noise variant, steering the user to reallocate budget to an unvalidated creative.
- **Fix sketch**: Gate a variant into the ROAS race only when it clears a floor (e.g. `metrics.conversions >= N` and/or `cost >= minSpend`), and treat ROAS within a small relative band as a tie broken by predicted `strength` or by conversion volume; document the floor next to `hasPerformanceBasis`.

## 5. History restore: the legacy-shape branch skips the payload-type guard the entries branch enforces

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/ai/history.ts:34`
- **Scenario**: `parseStoredHistory` migrates the legacy single-slot shape with `if (stored.payload) { return [{ savedAt: …, payload: stored.payload as AiResponse<T> }] }` — a bare truthiness check. The current-shape branch, by contrast, validates each entry with `if (!e.payload || typeof e.payload !== "object") continue;` (`history.ts:48`). So a corrupted/tampered legacy slot like `{"v":1,"savedAt":1,"payload":"boom"}` (or `payload: true`) is accepted and handed back as an `AiResponse<T>`; `useAiTool` then renders a string/boolean where a result object is expected, blanking or crashing the tool panel on load.
- **Root cause**: The two shapes were guarded inconsistently — the type check added to the entries branch was never back-applied to the legacy migration path, which trusts `payload` is a well-formed object.
- **Impact**: Rare (needs a malformed legacy localStorage slot) but a latent restore-time crash/blank rather than the intended graceful `[]` fallback the function documents ("anything malformed … yields `[]`").
- **Fix sketch**: Mirror the entries guard in the legacy branch: `if (!stored.payload || typeof stored.payload !== "object") return [];` before constructing the single-entry array, so a bad payload falls through to `[]` like every other malformed case.
