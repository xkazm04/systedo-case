# Core Marketing AI Tools & Skill SDK — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. Repurpose silently bills canned template output as a real generation
- **Severity**: High
- **Lens**: ambiguity
- **Category**: silent-fallback-billing
- **File**: src/lib/ai/tools/repurpose.ts:83
- **Scenario**: The model returns an empty or partial `variants` array (truncated stream, wrong key, skipped channels). `validateRepurpose` only checks over-limit text — an empty/partial set returns `[]` (valid), so the wrapper's single repair re-prompt never fires. `normalize` then backfills every missing channel from the deterministic `repurpose()` templates with `meta.demo` still false.
- **Root cause**: The exact bug that social.ts documents and fixes ("canned content billed as a real generation", Direction 2 — see the long comment at social.ts:97-105 and the `backfill` tracking in generateSocialPosts) was never ported to repurpose, even though repurpose has the identical skip-and-backfill normalizer shape. There is no `modelCount`/backfill tracking here at all.
- **Impact**: A user pays/attributes a "real" LLM run and receives 100% deterministic template copy with no demo/partialDemo flag; the honesty guarantee the sibling tools advertise is inconsistent across the toolset.
- **Fix sketch**: Mirror social.ts: (a) extend `validateRepurpose(channels, parsed)` to flag any requested channel missing a usable variant so the repair pass fires; (b) track how many channels the model actually filled in `normalize` and set `meta.demo` / `meta.partialDemo` in a `.then()` like generateSocialPosts / generateArticleDraft do.

## 2. The Skill SDK contract cannot carry the backfill-honesty logic — a registry-driven run of `socialSkill` regresses to canned-billed-as-real
- **Severity**: High
- **Lens**: ambiguity
- **Category**: contract-gap
- **File**: src/lib/skills/types.ts:19 (contract), src/lib/ai/tools/social.ts:202 (socialSkill)
- **Scenario**: The registry (src/lib/skills/registry.ts) presents skills as self-contained, gate-proven plugins ("a self-contained, testable unit"). But `socialSkill` as registered carries the LENIENT validator (`validateSocial` without the requested-platform check — the 2nd arg is dropped when assigned to `validate?: (parsed) => string[]`) and the silent-backfill `normalizeSocial`. All of the Direction-2 honesty (input-bound validate, backfill tracking, post-hoc `meta.demo`/`partialDemo` adjustment) lives OUTSIDE the skill, in `generateSocialPosts`. Any generic consumer that executes a skill via `skillToGenerateArgs(skill, input)` — the marketplace's whole point — reintroduces the empty/partial-response-billed-as-real bug that social.ts's own comments describe as fixed.
- **Root cause**: `Skill.validate` is `(parsed) => string[]` (not input-aware, unlike `system`/`normalize`), and the contract has no way to express "this result was backfilled from the demo floor". The fix was bolted onto one wrapper function instead of the contract.
- **Impact**: Two invocation paths for the same skill produce different billing/honesty semantics; future SDK-driven callers (the diagnostics route today, a generic "run skill" endpoint tomorrow) silently lose the refund/partial-demo guarantee. Undocumented — nothing warns that `socialSkill.validate` is the weak variant.
- **Fix sketch**: Make `validate` input-aware (`validate?: (parsed: unknown, input: I) => string[]`, bound in `skillToGenerateArgs` like `normalize`), and let `normalize` return an optional backfill signal (e.g. `{ value, backfill? }` or a `meta` callback) that `skillToGenerateArgs` translates into the demo/partialDemo adjustment. At minimum, document on `socialSkill` that direct SDK invocation bypasses the honesty wrapper.

## 3. Demo `healthScore` contradicts the score scale the system prompt itself defines
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: magic-number-scale-mismatch
- **File**: src/lib/ai/tools/campaign-eval.ts:136
- **Scenario**: EVAL_SYSTEM tells the model (and implicitly the user reading the score legend): "~80+ výborné, ~60–79 solidní, ~40–59 průměrné s rezervami, pod 40 podvýkonné". The keyless demo computes `40 + (roas/TARGET_ROAS - 1) * 40`: a campaign hitting the target ROAS exactly scores 40 — the very bottom of "average, with reserves", one point above "underperforming". To score "solid" (60) it must beat the target by 50%; "excellent" (80) needs 2× target.
- **Root cause**: The 40-baseline/40-slope constants are undocumented magic numbers whose anchor point (target = 40) disagrees with the semantic scale published two screens above; nothing explains whether "meets target" is supposed to read as average-poor.
- **Impact**: In keyless/demo mode (the mode every fresh checkout sees), a healthy on-target campaign renders a 40/100 score next to a verdict saying "Efektivní kampaň nad cílem" — a self-contradicting card that undermines trust in the whole score. Demo and model-produced scores are also incomparable across sessions.
- **Fix sketch**: Anchor the formula to the stated scale (e.g. target ROAS ⇒ ~65, linear or eased on both sides), or document why on-target is deliberately mid-scale; add a comment naming the anchor points so the constants stop being magic.

## 4. Article-draft partial backfill ships demo placeholder copy inside a "real" draft
- **Severity**: Medium
- **Lens**: ui
- **Category**: placeholder-leak
- **File**: src/lib/ai/tools/article-draft.ts:287
- **Scenario**: The model returns usable `blocks` but an empty/malformed `faq` (or vice-versa after the one repair pass). `normalize` backfills only the missing half from `demoArticleDraft(req)` and marks the run `partialDemo`. The demo FAQ answer is literally "Doplní AI po nastavení LLM." and the demo body includes the "Ukázkový koncept" callout ("Toto je deterministický náhled…"). `validateArticleDraft` only guards `blocks`, so the FAQ-empty case doesn't even trigger the repair re-prompt.
- **Root cause**: The demo content was written for the fully-keyless preview, but the partial-backfill path splices it verbatim into a provider-generated draft; the validator's coverage (blocks only) doesn't match the backfill surface (blocks + faq).
- **Impact**: A user with a working provider gets a "near-publishable" draft whose FAQ tells readers "the AI will fill this in after you configure the LLM" — nonsensical in context and easy to export/publish unnoticed (the partialDemo flag exists, but the copy itself is wrong for this state).
- **Fix sketch**: Extend `validateArticleDraft` to also flag an empty/invalid `faq` so the repair pass fires; on partial backfill, splice neutral placeholders ("Odpověď doplňte / vygenerujte znovu") instead of the keyless-demo marketing copy, or drop the FAQ section and let the panel render its empty state.

## 5. Article-draft prompt builder: dead ternary and a filter that strips every intended blank separator
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: dead-code-confusing-builder
- **File**: src/lib/ai/tools/article-draft.ts:84
- **Scenario**: Line 84 reads `faqBlock.length ? "" : ""` — both branches are `""`, and the trailing `.filter((line) => line !== "")` removes it anyway. That same filter also removes every deliberate `""` separator in the array (lines 72, 75, 82, 87), so — uniquely among all the tools, whose prompts keep blank lines between sections — this prompt is emitted with zero blank lines, and the code's visual structure (separators carefully placed) lies about the output.
- **Root cause**: The filter was added to drop conditionally-empty lines (audience/contentType/brand) but blankets the intentional separators too; the ternary is leftover from an earlier separator attempt.
- **Impact**: No functional bug today, but the builder actively misleads: a future editor "adding a blank line before the FAQ block" will silently change nothing, and the section-run-together prompt is marginally harder for the model to parse than its siblings'.
- **Fix sketch**: Delete the dead ternary; replace the blanket filter with a sentinel (e.g. build with `null` for skip-lines and filter `line !== null`, keeping `""` separators), matching the pattern the other tools use.
