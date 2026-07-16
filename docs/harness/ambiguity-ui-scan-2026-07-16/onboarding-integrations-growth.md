# Onboarding, Integrations & Growth Funnel — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 3 medium / 1 low)

## 1. Rate card mixes subscriber bases — opens (and sponsor prices) are computed from inconsistent populations
- **Severity**: High
- **Lens**: ambiguity
- **Category**: inconsistent-denominator
- **File**: src/lib/audience/compute.ts:190-198
- **Scenario**: `rateCard()` prices a sponsorship slot as `activeReach × blendedOpenRate × CPM`. `activeReach` is `funnel.activeSubscribers` (12 400 in the sample), but `blendedOpenRate` is weighted over ALL segment subscribers — including the explicitly "Neaktivní" segment (2 000 subs at 8 % opens), and segment totals are pinned to `funnel.subscribers` (18 600) by `audienceForProject`.
- **Root cause**: Two different populations are silently treated as one: the open-rate blend is per *total* subscriber while the reach multiplier is per *active* subscriber. Nothing in the code or comments acknowledges the mismatch.
- **Impact**: `opensPerSend`, `priceFloor/Ceil/Mid` are systematically understated (inactive low-openers drag the blend down, then the already-discounted active count is applied on top — the inactive segment is effectively double-counted against the seller). This is a money-facing calculator; the user under-prices sponsorship slots.
- **Fix sketch**: Pick one basis. Either weight the blend by each segment's *active/reachable* subscribers, or exclude segments below an activity floor (e.g. the "Neaktivní" segment) from the blend, or compute `opensPerSend = Σ(segment.subscribers × openRate)` directly and drop `activeReach` from the formula. Document the chosen population in the `RateCard` doc comment.

## 2. A store hiccup silently un-dismisses the onboarding card and regresses progress
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: error-swallowed-as-state
- **File**: src/lib/onboarding/progress.ts:42-58, 96
- **Scenario**: Any transient failure of `getOnboarding` (Firestore blip, sqlite lock) is caught as `null`, so `dismissed` and `scanApplied` both read `false`. A user who dismissed the onboarding card sees it pop back on the overview; a project with an applied scan shows the "scan" step un-done and progress dropping (e.g. 5/5 → 3/5) for one render.
- **Root cause**: The best-effort `.catch(() => null)` policy is right for the *derived* connector steps (not-done is a safe default), but it is applied uniformly to the one read that carries *persisted user intent* (`dismissed`, `scanApplied`), where "unknown" and "false" have very different UX meanings.
- **Impact**: Flaky reads manifest as UI state flapping — the dismissed card reappearing is exactly the kind of "the app forgot my choice" bug users report and developers can't reproduce.
- **Fix sketch**: Distinguish read-failure from fresh-project for the state read: let `getOnboarding` failure surface (or return a sentinel) and have the caller keep the previous rendering / hide the card on unknown, instead of defaulting `dismissed` to `false`. The other five probes can keep the catch-to-null policy.

## 3. `scaleSourcesToLeads` can break the funnel invariant its own sample guarantees
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: invariant-not-preserved
- **File**: src/lib/lead-signals/summary.ts:19-44
- **Scenario**: The R02 reconciliation scales every count by `targetLeads / rawLeads` with independent `Math.round` per field, then patches the rounding residual onto the largest source's `leads` only. With a small `targetLeads` (a quiet period: tile shows e.g. 12 leads against a 1 275-lead sample, f ≈ 0.009), per-field rounding no longer preserves ratios — `qualified` can round above `leads`, `won` above `opportunities`, and a source's `qualRate` can cross `JUNK_QUAL_RATE` so the junk flag flips versus the unscaled data. The docstring claims "all RATIOS (CPL, CPQL, qualification rate, junk flag, velocity) untouched", which is only true for large targets.
- **Root cause**: Independent rounding of interdependent counts plus a leads-only residual patch; the comment documents intent, not the small-factor edge case.
- **Impact**: The AI-grounding narrative can state impossible funnels ("Leadů: 1, kvalifikovaných: 2") or flag/unflag junk sources differently from the on-screen table it is supposed to reconcile with — precisely the divergence R02 set out to kill.
- **Fix sketch**: After scaling, clamp per source: `qualified = min(qualified, leads)`, `opportunities = min(opportunities, qualified)`, `won = min(won, opportunities ?? qualified)` (same for `prior`); alternatively skip scaling (return the sample unscaled) when `f` is small enough that any count rounds to 0.

## 4. `roi: Infinity` sentinel for unpaid sources leaks a non-JSON, non-formattable value
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: sentinel-value-hazard
- **File**: src/lib/lead-quality/compute.ts:39
- **Scenario**: `withMetrics` sets `roi = Infinity` when `spend === 0` ("Organic & doporučení" in the sample always hits this). Any consumer that `JSON.stringify`s a `SourceMetrics` row (API route, cache, prompt grounding) gets `null` silently; `Intl.NumberFormat` renders "∞"; a naive `.toFixed()` throws no error but produces "Infinity". Sorting by ROI also always pins unpaid sources on top regardless of performance.
- **Root cause**: A mathematical sentinel is used where the domain meaning is "ROI undefined for unpaid sources" — the codebase's own convention elsewhere (`relDelta`, `Velocity`) is `null` for "no meaningful value".
- **Impact**: Every consumer must know the secret Infinity contract; the one-line doc comment is the only guard. A future serialization path turns it into `null` and the row reads "ROI: 0" or blank with no error.
- **Fix sketch**: Type it `roi: number | null` and return `null` when `spend === 0`, matching `relDelta`/`Velocity` semantics; callers already handle null-means-hide for velocity, so the pattern is established.

## 5. `decodeEntities` double-decodes and mangles astral/hex entities
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: encoding-edge-cases
- **File**: src/lib/onboarding/site-fetch.ts:27-39
- **Scenario**: The replace chain runs `&amp;` → `&` *before* `&lt;`/`&gt;`, so the correctly-escaped literal `&amp;lt;` in page HTML double-decodes to `<`. Separately, numeric entities go through `String.fromCharCode`, which yields garbage for astral codepoints (`&#128512;` — emoji common on marketing homepages), and hex entities (`&#x2013;` — the form many CMSes emit for dashes) are not decoded at all.
- **Root cause**: Order-sensitive sequential regex replaces instead of a single-pass decode; `fromCharCode` instead of `fromCodePoint`; the hex form was simply missed while the decimal form was handled.
- **Impact**: Contained — the output only feeds the onboarding-scan AI prompt, so the result is slightly corrupted prose (stray `<`, mojibake surrogates, literal `&#x2013;` runs) that can mildly degrade the scanned business profile on entity-heavy Czech sites. No security surface (nothing is re-rendered as HTML).
- **Fix sketch**: Decode in one pass with a single regex over `&(#x?[0-9a-f]+|nbsp|amp|lt|gt|quot|apos);` using `String.fromCodePoint` for numeric forms (both decimal and hex), keeping `&amp;` handled by the same single pass so ordering can't double-decode.
