# PPC/Ads Creative Tools, Winning-Pattern Mining & Profitability Targets — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Short keywords are silently dropped, so Ad Strength can claim "no headline contains a keyword" when they all do
- **Severity**: High
- **Lens**: ambiguity
- **Category**: false-negative-keyword-coverage
- **File**: src/lib/ad-strength.ts:74 (tokenize), src/lib/ad-strength.ts:103-108, 181/186 (the "Žádný nadpis neobsahuje klíčové slovo" copy)
- **Scenario**: A user generates ads for keywords like "čaj", "mix", "bio", "med" (common Czech e-commerce heads ≤3 chars after diacritic-stripping). `tokenize` filters every token `< 4` chars, so `keywordTokens` is empty, `coverage` is 0, and the 20-weight factor renders a hard fail: "No headline contains a keyword. Include keywords in at least half of them." — even when every headline literally contains the keyword.
- **Root cause**: The ≥4-char stopword heuristic (documented as dropping "stray units like 'g'") is applied to the *keywords* themselves, not just headline noise. When all keyword tokens are filtered, the code cannot distinguish "keywords absent from headlines" from "keywords unmeasurable", and reports the former.
- **Impact**: Score is unfairly dragged down (up to −20 points, potentially a rating band) and the user is told to do something they already did — a credibility hit for the whole meter, the exact contradiction the over-limit gate elsewhere in this file was built to avoid.
- **Fix sketch**: If `keywordTokens.length === 0` after filtering, either fall back to whole-normalized-keyword substring matching against normalized headlines, or exclude the factor (redistribute weight) with a neutral detail ("keywords too short to measure"). Do not render the "no headline contains a keyword" fail copy when nothing was measured.

## 2. "Fresh data" contradiction check judges channel pins against demo SAMPLE_ATTRIBUTION, never live data
- **Severity**: High
- **Lens**: ambiguity
- **Category**: contradiction-check-sample-data
- **File**: src/lib/patterns/extract.ts:370 (`const context: MiningContext = { campaigns, channels: SAMPLE_ATTRIBUTION, pnoGoal }`), consumed at extract.ts:451-455
- **Scenario**: A live tenant pins "Nadvýkonný kanál: X". Direction 2's docs promise a pin is re-checked against "fresh mined data" and excluded from prompts when contradicted. But `extractPatternsWithContext` hard-codes `channels: SAMPLE_ATTRIBUTION`, so the branch at extract.ts:451 compares the pin to *demo* CTRs for every tenant, forever.
- **Root cause**: The `MiningContext` interface (extract.ts:354-358) documents `channels` as "the tenant's own … channel-performance rows", but the only construction site passes the sample constant — a silent contract violation, presumably a placeholder that shipped.
- **Impact**: Two failure modes: a live tenant's channel pin can be flagged/prompt-excluded because the *demo* channel mix drifted (false contradiction of a true lesson), or a genuinely cratered channel pin stays in prompts because demo data still says it wins. Either way the "pins stop being immortal" guarantee is fictional for the targeting category, while campaign/type pins (branches 1-2) really are fresh — an inconsistency nobody can see from the UI.
- **Fix sketch**: Either thread real per-tenant channel performance into `MiningContext` (mirroring `listCampaigns`), or explicitly exempt `targeting` pins from contradiction like the other EXEMPT branches and delete the demo-fed branch — with a comment saying why. The current half-measure is worse than either.

## 3. Display titles are load-bearing identifiers: rewording copy silently breaks sample-lesson quarantine and contradiction detection
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: string-parsing-of-display-copy
- **File**: src/lib/patterns/extract.ts:28-30 (`patternId` = sha1(title)), extract.ts:389-391 (SCALING_PREFIX / BEST_TYPE_SUFFIX / OVER_CHANNEL_PREFIX), extract.ts:269 (`promptSafePatterns` matches by title-derived id)
- **Scenario**: A future developer polishes Czech copy ("Vzor pro škálování:" → "Šablona pro škálování:"), localizes titles to English, or changes the „…" quote style. Nothing fails: patterns still mine and render. But `promptSafePatterns` stops recognizing previously-known sample-lesson ids, and every `patternContradicted` branch stops matching its prefix — both safety nets go dark with zero signal.
- **Root cause**: The human-readable title doubles as (a) the stable id (sha1) and (b) a parseable schema (prefix + quoted subject). No structured fields (`subjectCampaignName`, `subjectType`, `subjectChannel`, `origin: "sample-lesson"`) exist on `Pattern`, so semantics are recovered by string surgery on copy.
- **Impact**: The two truth-in-labeling guarantees this module is built around (live prompts never carry demo lessons; stale pins never keep grounding prompts) degrade silently on a copy edit — the kind of change no reviewer connects to prompt integrity. Also `unquote`/prefix parsing already needs a Unicode zoo of quote characters (extract.ts:396) just to keep working.
- **Fix sketch**: Add structured fields to `Pattern` at mint time (extract.ts `mk` already knows category + subject): e.g. `subject?: { kind: "campaign" | "type" | "channel"; key: string }` and mark sample lessons with `origin: "sample"` in `sampleLessonPatterns`. Judge contradiction and quarantine on those fields; keep title purely presentational. At minimum, add a unit test that pins each prefix constant to the mined title format so a reword fails CI.

## 4. BYOM pricing card sells "unlimited, no daily limit" while the plan silently degrades to a 25/day cap
- **Severity**: Medium
- **Lens**: ui
- **Category**: pricing-copy-vs-behavior
- **File**: src/lib/plans.ts:29 (`byom: { aiEval: 25, … }`), plans.ts:81-87 (features: "Neomezená AI generování…", "Bez denního limitu na AI nástroje")
- **Scenario**: A BYOM subscriber's provider key expires or errors, or they haven't added one yet. Per the (well-written) internal comment, generation falls back to the app-funded path capped at Free's 25/day. The user who paid for "Bez denního limitu" hits a quota wall mid-day with no prior disclosure — the /cena card and the plan behavior contradict each other exactly when the user is already annoyed (their key just failed).
- **Root cause**: The fallback-cap trade-off is documented only in a code comment; `PLAN_INFO` (the marketing surface, same file) carries the unqualified "unlimited" claims, and nothing in the features list mentions the app-funded fallback bound.
- **Impact**: Perceived bait-and-switch on the paid tier; support burden ("I paid, why am I limited?"); and the quota-exceeded message presumably points at UPGRADE_PATH — a nonsensical CTA for someone already on BYOM.
- **Fix sketch**: Add one honest feature/footnote line to the byom card, e.g. "Záložní generování přes náš klíč: 25/den" — and ensure the quota-exceeded message on the byom plan says "přidejte/obnovte vlastní klíč" instead of the generic upgrade CTA. Keep the headline "unlimited via your key" claim; qualify only the fallback.

## 5. Embedding batch is all-or-nothing: one empty vector discards every paid sibling call, uncached and untelemetered
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: partial-failure-waste
- **File**: src/lib/patterns/embeddings.ts:102-104 (`if (!fresh.every((v) => v.length > 0)) return null;`), store.ts:157-158 (unbounded corpus batch)
- **Scenario**: `searchPatterns`/`getPatternLines` embeds `[query, ...texts]` — one parallel request per text with no concurrency cap. A library of 50 patterns fires 51 simultaneous Gemini calls; if exactly one times out (3s budget) or returns an empty `values`, the guard returns `null` *before* the cache-write loop, so the 50 successful vectors are thrown away, nothing is cached, and `recordLlmCall` never runs.
- **Root cause**: The success/cache/telemetry block only executes when *every* miss succeeds; partial success is treated identically to total failure, and `Promise.all` amplifies the odds of at least one failure as the corpus grows.
- **Impact**: Paid API spend that leaves no trace in the eval dashboard (the telemetry gap this code was explicitly adding), and repeated re-embedding of the whole corpus on every retry until a run happens to be 100% clean — the larger the library, the less likely semantic search ever activates, degrading to substring fallback with no operator signal beyond a console line.
- **Fix sketch**: Use `Promise.allSettled`; cache and telemeter every fulfilled non-empty vector, then return `null` only if any input still lacks a vector. Optionally chunk misses (e.g. 8 at a time) so one search can't open 50 sockets. Behavior toward callers is unchanged (still null on incomplete batch) but retries become incremental and spend becomes visible.
