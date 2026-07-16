# Diagnostic, Growth & Twin-Voice AI Tools — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. Wholesale demo fallbacks in normalize() bill as real output in half the tools
- **Severity**: High
- **Lens**: ambiguity
- **Category**: inconsistent-demo-billing
- **File**: src/lib/ai/tools/lp-variant-ideas.ts:168 (also channel-research.ts:220)
- **Scenario**: The model responds but nothing usable survives normalization — e.g. lp-variant-ideas gets only 1 distinct non-banned variant, or channel-research gets 0 named channels — and normalize() silently returns the deterministic demo wholesale.
- **Root cause**: comparison-outline and keyword-clusters explicitly implement "Direction 2": a fully canned answer sets `res.meta.demo = true` so the refund fires (comparison-outline.ts:299-305, keyword-clusters.ts:290-293). lp-variant-ideas and channel-research have the identical wholesale-fallback path inside normalize() but never flag it; cohort-diagnosis / onboarding-scan / twin-style backfill individual fields from the demo with no `partialDemo` either. The wrapper cannot see inside normalize(), so it treats the call as a successful model answer.
- **Impact**: A user is charged (and shown a "live AI" result) for the same canned content the keyless demo produces for free. The billing-honesty policy exists in the codebase but is applied to only 2 of the 7 tools that can go fully canned — future developers can't tell which behavior is intended.
- **Fix sketch**: Extract the comparison-outline `backfill` pattern into a shared helper (or a `normalize` return contract like `{ result, canned: "none"|"partial"|"full" }` consumed by generateStructured) and apply it to lp-variant-ideas' `variants.length >= 2 ? … : demo` branch and channel-research's `channels.length === 0` branch at minimum.

## 2. Demo-disclaimer tail ("connect an LLM…") leaks into real model results
- **Severity**: High
- **Lens**: ui
- **Category**: misleading-fallback-copy
- **File**: src/lib/ai/tools/channel-research.ts:222 (also cohort-diagnosis.ts:183-188, onboarding-scan.ts:157-161)
- **Scenario**: The model returns a good channel list but an empty/whitespace `summary` (validate re-prompts once; the retry can still omit it). normalize() backfills `summary` from `demoChannelResearch(req).summary`, which ends with `demoTail(...)` = " Ukázkový výstup — připojte LLM (Claude v devu, Gemini v produkci) pro plán na míru."
- **Root cause**: The demo objects were designed for the keyless path, where the tail is honest. Reusing them as per-field floors for live responses carries the disclaimer along; nothing strips `demoTail` when only one field is backfilled.
- **Impact**: A paying user with a connected LLM sees a card whose channels are real but whose headline sentence claims it is a sample output and instructs them to "connect an LLM" — plus it leaks internal provider names (Claude/Gemini) into product copy. Same hazard for cohort-diagnosis summary/recommendation and onboarding-scan summary.
- **Fix sketch**: Keep the demo text tail-free and append `demoTail` only at the true demo() entry points (or split `demoX()` into `baseX()` + `demoX() = baseX + tail` and backfill from `baseX`).

## 3. pickCause() hard-codes undocumented CZK/B2B thresholds that can contradict the model
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: magic-number-thresholds
- **File**: src/lib/ai/tools/lead-source-diagnosis.ts:150-159
- **Scenario**: A source with 29 leads is always "volume"; CPL of 201 CZK flips "spam" to "mis-targeting"; CPQL of 2 999 CZK is fine but 3 000 is "pricing". The prompt (lines 35-40) describes the same causes only qualitatively ("levné leady", "vysoké CPQL"), so the model and the deterministic floor/demo can disagree on the same numbers.
- **Root cause**: The classification boundaries (30 leads, 200 CZK CPL, 0.35 qualRate, 0.15 winRate, 3 000 CZK CPQL — and cohort-diagnosis's `cac/ltv >= 0.4`, `m3 < 0.4` at cohort-diagnosis.ts:232-233) are unexplained literals with no named constants, no rationale, and no link to the prompt's wording. They bake in one currency and one business size.
- **Impact**: When the model omits `likelyCause`, the user gets a verdict driven by invisible thresholds no one can audit or tune; a future developer editing the prompt's definitions won't know the TS mirror must move in lockstep (and vice versa). Wrong-currency or enterprise accounts get systematically skewed diagnoses.
- **Fix sketch**: Hoist the numbers into named, commented constants (e.g. `MIN_LEADS_FOR_SIGNAL = 30 // ~±9pp CI at 35% qual rate`), reference them from both `pickCause` and the CAUSE definitions in the system prompt (template them in), and note the CZK assumption where `cpl <= 200` lives.

## 4. twin-style interview loop can never converge and re-asks already-answered canned questions
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: non-converging-feedback-loop
- **File**: src/lib/ai/tools/twin-style.ts:173-186
- **Scenario**: A mature voice: 10 good samples plus answers to every earlier gap question. The system prompt forbids asking anything the samples already reveal, yet validate() rejects any output with zero `gapQuestions` (line 184-186), forcing the model to invent a question every round. Separately, when the model returns none after the retry, normalize() (line 173) substitutes the same 3 hard-coded starter questions ("Tykáte, nebo vykáte…") — even when `req.answers` already contains the user's answers to exactly those questions.
- **Root cause**: The "≥1 gapQuestion" invariant was written for the cold-start case and never reconciled with the sharpening loop's end state; the fallback questions are static and not filtered against `req.answers`.
- **Impact**: The training UI always shows open questions, so the user can never reach "voice fully trained"; in the fallback path they are re-asked questions they answered last round, which reads as the product not listening.
- **Fix sketch**: Allow an empty `gapQuestions` when `req.answers`/samples are substantial (or add an explicit "no remaining gaps" sentinel the UI understands), and filter the canned fallback questions against `req.answers[].question` before substituting.

## 5. Cohort demo copy ignores the eshop register it elsewhere maintains
- **Severity**: Low
- **Lens**: ui
- **Category**: copy-register-drift
- **File**: src/lib/ai/tools/cohort-diagnosis.ts:242-244
- **Scenario**: An e-shop project (req.eshop = true) hits the demo/fallback path. The weak-retention recommendation says "M3 retence jen …" and the CAC recommendation says "(… /registraci)" — but the whole file otherwise carefully switches wording for e-shops ("M3 opakování", "zákazníků" vs "registrací" in cohortLine/system prompt).
- **Root cause**: `demoCohortDiagnosis` builds its strings without the `eshop` flag that `cohortLine`/`cohortDiagnosisSystem` thread through, so the templated Czech uses SaaS vocabulary unconditionally.
- **Impact**: The keyless demo (the first thing a prospect sees) tells an e-shop owner about "registrations" and "retention" — terminology the product just taught the model to avoid for that business type; it reads as generic SaaS boilerplate and undercuts the grounded-in-your-business promise.
- **Fix sketch**: Pass `eshop` into `demoCohortDiagnosis` (it already has `req`) and reuse the existing label pairs ("M3 opakování"/"M3 retence", "zákazníka"/"registraci") in the recommendation templates.
