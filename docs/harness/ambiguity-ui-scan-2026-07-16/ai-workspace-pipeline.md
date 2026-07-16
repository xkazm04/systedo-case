# AI Workspace Contracts, Pipeline & Ad Experiments — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. Repurpose handoff links every channel variant to a non-existent `/blog/` URL
- **Severity**: High
- **Lens**: ambiguity
- **Category**: broken-derived-url
- **File**: src/lib/ai/pipeline.ts:139
- **Scenario**: A user finishes the content wizard (keywords → brief → draft) and runs step 4, distribution. `draftToRepurposeRequest` builds the article back-link as `${origin}/blog/${slug}` with `origin = window.location.origin`. The generated LinkedIn/Instagram variants embed this URL (UTM-stamped client-side) and the user copies them out to real channels.
- **Root cause**: The `/blog/` path segment is invented in the mapper. The app's article renderer lives under `src/app/clanek/` (ai-types.ts even documents that drafts "render through the same ArticleBody as /clanek"); there is no `/blog` route anywhere in `src/app`. The comment "the variants link back to where the article will live" is an undocumented assumption that was never reconciled with the actual route.
- **Impact**: Every distributed variant ships with a link that 404s on the site that generated it — the worst kind of failure because it surfaces only after the copy is already published on external channels.
- **Fix sketch**: Take the article base path as an explicit argument (like `origin` already is) or export a single `ARTICLE_BASE_PATH` constant shared with the `/clanek` routing, and add a unit assertion that the built URL resolves to a real route pattern.

## 2. A/B winner is declared on raw ROAS with no sample-size or significance floor
- **Severity**: High
- **Lens**: ambiguity
- **Category**: unstated-statistical-assumption
- **File**: src/lib/ai/experiment-types.ts:62-77
- **Scenario**: An experiment has two variants; the user enters day-one metrics: variant A with 3 clicks, 1 conversion, 50 CZK spend (ROAS 20), variant B with 2 000 clicks, 80 conversions (ROAS 6). `hasPerformanceBasis` flips to "real performance" the moment every variant has `cost > 0`, and `pickWinner` crowns A.
- **Root cause**: The model equates "every variant has any spend" with "performance is a valid basis". There is no minimum impressions/clicks/conversions threshold and no significance test, and the trade-off is not even mentioned in the docstrings — `winnerVariantId` is persisted by `persist()` on every mutation as if authoritative.
- **Impact**: The persisted, UI-surfaced "winner" is noise-driven early in a test; a marketer acting on it kills the actually-better ad. The whole point of the experiments module (decide by real performance) silently degrades into coin-flipping on tiny samples.
- **Fix sketch**: Add a documented floor to `hasPerformanceBasis` (e.g. every variant ≥ N clicks or ≥ M conversions, exported as a named constant), and expose a `basis: "performance" | "predicted" | "insufficient-data"` value so the UI can label an immature verdict instead of presenting it as settled.

## 3. Handoff/pipeline seeds guarantee server MAX caps but not server MIN lengths
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: contract-half-enforced
- **File**: src/lib/ai/handoff.ts:9-44 (also src/lib/ai/pipeline.ts:51-72)
- **Scenario**: `briefToAdSeed` promises "the seed must respect them so a handed-off form submits without edits", and `AD_SEED_LIMITS` mirrors `validateAdRequest`'s 200/600/300 maxima. But the validator also enforces minima of 2 characters on product/benefits/audience: a brief whose outline has no points and a 1-item keyword list (or a 1-character topic/audience in `clusterToBriefRequest`) produces a seed the server rejects with "Vyplňte hlavní výhody (2–600 znaků)". Same for the wizard's `clusterToBriefRequest`, which trims/slices `audience` but never checks the 2-char floor `validateBriefRequest` requires.
- **Root cause**: Only half of the validation contract (the caps) was mirrored into the mappers; the floors live solely in validation.ts, and nothing ties the two files together (the `AD_SEED_LIMITS` constant encodes maxima only).
- **Impact**: The advertised "submits without edits" handoff intermittently fails at the NEXT step with a validation error the user can't connect to the step where the bad value originated — a confusing dead end mid-pipeline.
- **Fix sketch**: Export min+max pairs from one shared module consumed by both validators and mappers; have the mappers either pad/omit fields below the floor (so the form opens with an honest empty field) and add a unit test that every mapper output passes its target validator.

## 4. `persist()` docstring claims it strips `undefined` for Firestore — it strips nothing
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: comment-behavior-mismatch
- **File**: src/lib/ai/experiments.ts:18-23
- **Scenario**: A future developer adds an optional field to `AdVariant` or `Experiment` (e.g. `notes?: string`), sees "Strip undefined so Firestore (which rejects it) always gets a clean doc" above `persist()`, and trusts it. First save with the field absent throws `Error: Cannot use "undefined" as a Firestore value` in production, inside a transaction.
- **Root cause**: `persist()` only drops `id` and recomputes `winnerVariantId`; no undefined-stripping exists. The code is safe today purely because every current field happens to be required or `null`-typed — the comment documents an intention, not the implementation.
- **Impact**: A load-bearing false promise: the exact failure the comment says is handled will surface at runtime on the write path (upsert + metrics update both funnel through it), and the transaction retry loop will re-throw it repeatedly.
- **Fix sketch**: Either implement it (`JSON.parse(JSON.stringify(rest))` or a small deep `stripUndefined`) or rewrite the comment to state what it actually does and that all fields must stay required/nullable.

## 5. Lead-source rate "recompute" still lets qualified > leads produce rates over 100 %
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: incomplete-input-clamp
- **File**: src/lib/ai/validation.ts:670-684
- **Scenario**: `validateLeadSourceDiagnosisRequest` recomputes `qualRate = qualified / leads` "so the model can't be fed a qualRate / winRate that contradicts the counts" — but nothing clamps `qualified ≤ leads` or `won ≤ qualified`. A body with `leads: 10, qualified: 500` yields `qualRate: 50` (5 000 %), while peer rates ten lines later ARE clamped to 0–1.
- **Root cause**: The tamper-proofing closed the rate/count contradiction but not the count/count one; the subject source and its peers are held to different standards.
- **Impact**: Mostly defused by the newer server-side intent rebuild (the wire numbers are ignored on the live path), but this validator is explicitly kept as "the pure body-coercion contract the rebuilt request must satisfy" — so any future caller trusting it can hand the model absurd figures and get a confidently wrong diagnosis.
- **Fix sketch**: Clamp `qualified = Math.min(qualified, leads)` and `won = Math.min(won, qualified)` before deriving rates (matching the 0–1 clamp already applied to peers), with a one-line comment noting the invariant.
