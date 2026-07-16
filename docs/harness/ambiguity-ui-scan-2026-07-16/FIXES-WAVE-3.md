# Fixes — Wave 3 (billing honesty)

Theme: the app charged the user's paid quota (or miscounted token usage) for
canned/demo/template output that was not a real model generation. Every fix
mirrors the codebase's established honest pattern — a tool that goes fully canned
sets `meta.demo` so the refund fires, a partly-canned one sets `meta.partialDemo`,
and demo-only disclaimer copy never leaks into a live answer — rather than
inventing a new mechanism.

Branch: `vibeman/ambiguity-ui-2026-07-16`

## Commits

| # | Commit | Finding | Scope |
|---|--------|---------|-------|
| 1 | `fix(patterns): refund the daily quota on free or failed pattern search` | campaign-ops-api #3 | `api/patterns/search/route.ts` |
| 2 | `fix(images): don't crown an arbitrary winner when vision scoring is unavailable` | creative-studio-images #1 | `lib/images/studio.ts` + test |
| 3 | `fix(llm): accumulate token usage across a repaired generation's two calls` | llm-wrapper-telemetry-quality #2 | `lib/llm/cost.ts`, `lib/llm/index.ts` + test (+ gate artifacts) |
| 4 | `fix(repurpose): stop billing canned template output as a real generation` | core-ai-tools-skill-sdk #1 | `lib/ai/tools/repurpose.ts` + test |
| 5 | `fix(skills): let the Skill contract carry the backfill-honesty signal` | core-ai-tools-skill-sdk #2 | `lib/skills/types.ts`, `lib/ai/tools/social.ts` + test |
| 6 | `fix(ai-tools): flag wholesale demo fallbacks so they bill as demo, not real` | diagnostic-growth-twin-tools #1 | `lib/ai/tools/lp-variant-ideas.ts`, `channel-research.ts` + test |
| 7 | `fix(ai-tools): keep the demo disclaimer tail out of real model results` | diagnostic-growth-twin-tools #2 | `lib/ai/tools/cohort-diagnosis.ts`, `onboarding-scan.ts` + test |

(Commit order was 1=patterns, 2=studio, 3=llm, 4=repurpose, 5=skills, 6=wholesale, 7=tail — grouped for gate economy, see below.)

## Narratives

**#1 repurpose (core-ai-tools-skill-sdk #1)** — Identical bug to the one social.ts
documents as fixed. `validateRepurpose` only checked over-limit text, so an empty
or partial `variants` array passed, the wrapper's single repair re-prompt never
fired, and `normalize` backfilled every missing channel from the deterministic
templates with `meta.demo` still false. Fix: `validateRepurpose` now flags any
requested channel missing a usable variant (repair fires), and a new
`normalizeRepurposeTracked` reports `modelCount` so a fully/partly canned answer
bills as `meta.demo` (refund) / `meta.partialDemo` — the exact shape of
`normalizeSocialTracked` + `generateSocialPosts`.

**#2 Skill SDK contract (core-ai-tools-skill-sdk #2)** — socialSkill's Direction-2
honesty lived entirely OUTSIDE the skill in `generateSocialPosts`, so a
registry-driven run via `skillToGenerateArgs` carried the lenient over-limit-only
validator and the silent-backfill normalizer — regressing to canned-billed-as-real.
Extended the contract minimally: `validate` is now input-aware (bound to the input
in `skillToGenerateArgs`, like `normalize`) and a first-class `backfill(parsed,
input)` field expresses "none | partial | full". socialSkill now carries both;
`generateSocialPosts` reads them at its own gate-tagged call site. (A generic
`runSkill` chokepoint was prototyped and rejected — it would call
`generateStructured` untagged and break the gate's per-tool coverage invariant, so
the honest signal is applied at each tool's tagged call site instead.)

**#3 wholesale demo billing (diagnostic-growth-twin-tools #1)** — lp-variant-ideas
(<2 distinct challengers) and channel-research (0 named channels) returned the demo
WHOLESALE from `normalize()`; the wrapper can't see inside, so the free canned plan
was billed as live. Added tracked normalizers (`canned: boolean`) and set
`meta.demo` in the generate wrappers — mirroring comparison-outline / keyword-clusters.

**#4 demo-tail leak (diagnostic-growth-twin-tools #2)** — the keyless demos end with
`demoTail()` (" Ukazkovy vystup — pripojte LLM …" + provider names). When a single
field was empty after the model's answer, `normalize` backfilled it from that demo
object, splicing the disclaimer into a real result. Split each demo into a tail-free
`baseX()` (the per-field backfill floor) plus `demoX() = base + tail` at the true
keyless entry point. channel-research's split landed in commit #6 (shared file);
cohort-diagnosis + onboarding-scan here.

**#5 patterns quota (campaign-ops-api #3)** — the route consumed a paid `aiEval`
unit up front and never refunded when the search degraded to the free substring
path (`semantic:false`) or threw. Refund on `!semantic` and in the catch — mirroring
the sync route's refund-on-degrade.

**#6 repair usage undercount (llm-wrapper-telemetry-quality #2)** — a repaired
generation makes two real metered calls, but `usage = second.usage ?? usage` kept
only the second's, undercounting telemetry + on-screen cost by a whole paid call.
Added a pure `addUsage()` (sums counters; sums `costUsd` only when both calls report
one, else undefined so the estimate stands) and used it in the repair branch.

**#7 arbitrary image winner (creative-studio-images #1)** — with vision scoring
unavailable on the live path every candidate has `score: null`, the sort is a no-op
tie, and `images[0]` was crowned as if quality-ranked, then fed into revenue
attribution / `deriveStylePrior`. Extracted `crownWinner()`: still picks one so the
flow has a winner, but when nothing was scored it flags `scored: false` + a "bez
vision skore" defect (mirroring the demo's honest self-label) so the surface can tell
an arbitrary pick from a real rank.

## Verification

- `npx tsc --noEmit`: **0 errors**.
- `npm run test:unit`: **1583 / 1583 pass** (baseline 1557 + **26 new tests** across 6 new files), 0 fail, 0 regressions.
- `npm run llm:gate:check`: **PASS** — coverage clean (20 tagged call sites), all 20 tool contract goldens match (no `system`+`schema` fingerprint drifted), and the committed cache proves the current code.

### LLM gate note

None of these fixes changed a tool's prompt/schema fingerprint (all touch
validate/normalize/demo/wrapper logic only), so all 20 goldens matched unchanged.
But `src/lib/llm/index.ts` (fix #6) is an untagged HASHED file, which the gate
conservatively treats as shared LLM code → a **full 20-tool real-Claude re-prove**
was required to refresh the hash cache. That run was completed (`node
scripts/llm-gate.mjs`, all 20 tools green, ~7 min); the refreshed
`.llm-gate-cache.json` and the captured `test-llm/samples/*.json` corpus ship in
commit #3. No `--no-verify` was used; every commit's pre-commit gate skipped
cleanly against the fresh proof.

## New tests

| File | Covers |
|------|--------|
| `test-unit/repurpose-backfill.test.mjs` | #1 — validateRepurpose missing-channel + normalizeRepurposeTracked modelCount |
| `test-unit/social-skill-honesty.test.mjs` | #2 — socialSkill.validate (input-aware) + backfill signal + skillToGenerateArgs binding |
| `test-unit/wholesale-demo-billing.test.mjs` | #3 — lp-variant / channel-research tracked `canned` flag |
| `test-unit/demo-tail-leak.test.mjs` | #4 — base summaries tail-free vs demo carries the tail; live backfill tail-free |
| `test-unit/llm-usage-accumulate.test.mjs` | #6 — addUsage sums counters; costUsd only when both present |
| `test-unit/studio-winner.test.mjs` | #7 — crownWinner marks scored vs arbitrary |

## Patterns / notes

- The honest-sibling reference set (grep `meta.demo` / `partialDemo` / `backfill` in
  `src/lib/ai/tools/`): social, article-draft, comparison-outline, keyword-clusters,
  status-core. Every fix here conforms to one of their shapes.
- **`tracked` normalizer pattern**: to surface a "was this canned?" signal the wrapper
  can't see, split `normalizeX` into `normalizeXTracked(parsed, …) → { result, canned|modelCount }`
  and keep `normalizeX = tracked().result`. Export the tracked fn so it's unit-testable
  without a model call.
- **base/demo split** for the tail leak: `baseX()` (tail-free) is the live per-field
  floor; `demoX() = { ...base, summary: base.summary + demoTail(...) }` is the keyless
  entry point. Only the summary carried the tail, so only it needed splitting.
- **Gate coupling**: a change to the untagged `src/lib/llm/index.ts` forces a full
  20-tool real re-prove even when no fingerprint moved — budget for one real-Claude run
  when touching shared LLM wrapper code.
- One shared file (`channel-research.ts`) serves findings #1 and #2; its combined diff
  landed in the wholesale-billing commit with the tail-split cross-referenced, since the
  billing path's summary backfill depends on the tail-free base.
