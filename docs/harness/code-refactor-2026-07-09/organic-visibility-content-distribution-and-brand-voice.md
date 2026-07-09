# Organic Visibility, Content Distribution & Brand Voice

> Context #50 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 3, Low: 0)
> Files read: 28

## 1. Two "pick readable ink for a hex color" formulas disagree on the same accent colors

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/branding/compute.ts:10-27`
- **Scenario**: `branding/compute.ts` computes `luminance()` as a plain weighted RGB average (`(0.299r+0.587g+0.114b)/255`) and calls a color "light" above `0.6`. `src/lib/design-tokens-color.ts:11-35` (not in this context, but the other copy) computes `luminance()` as true gamma-corrected WCAG relative luminance and calls a color "light" above `0.45`. Both exist purely to answer "should the ink on top of this hex be dark or white" (`readableOn` vs `readableInkOn`). For one of `branding/compute.ts`'s own `ACCENT_PALETTE` entries, `#f59e0b` (amber), the two formulas disagree: the simple RGB-average luminance comes out ≈0.66 (>0.6 → `readableOn` picks dark `#111111` ink), while the WCAG-correct luminance comes out ≈0.44 (<0.45 → `readableInkOn` would pick white `#ffffff`). Same color, opposite recommended ink, because one formula is a rough approximation and the other is spec-correct.
- **Root cause**: `design-tokens-color.ts`'s header comment explains it was "deliberately split out from design-tokens.ts" to avoid pulling `node:fs` into a client bundle — but nobody made `branding/compute.ts` (used by `BrandingModule.tsx`'s white-label accent picker) depend on that already-client-safe module; it grew its own, cheaper, non-WCAG approximation instead.
- **Impact**: A future contributor fixing a contrast bug in one helper (e.g. the swatch island) has no reason to know a second, differently-thresholded "readable ink" function exists for brand accents, so the fix silently doesn't apply there — or vice versa. Any code that starts reusing `ACCENT_PALETTE` colors through the other helper (e.g. a future client-report theming feature) will get a different ink decision than the accent picker shows today.
- **Fix sketch**: Delete `luminance`/`isHexColor`/`readableOn` from `branding/compute.ts` and re-export from `design-tokens-color.ts` instead (`isHexColor` doesn't exist there yet — add a small regex guard, or keep `isHexColor` local and just delegate `luminance`/`readableOn` to `luminance`/`readableInkOn`). Update the two `branding/compute.ts` importers (`AccountSecurity.tsx`, `BrandingModule.tsx`) to the shared threshold; visually re-check the accent swatches after the ink flips for amber-band colors.
- **Build risk**: `design-tokens-color.ts` is explicitly the client-safe half already (no `node:fs`), so importing it from `branding/compute.ts` (used by client components) is safe — this is exactly the boundary that file's header comment sets up for reuse.

## 2. `organic-channels/sample.ts` reinvents the exact PRNG already in `project-data/vary.ts`

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/organic-channels/sample.ts:441-459`
- **Scenario**: `seededWobble()` here is a hand-rolled FNV-1a hash (`2166136261` / `16777619`) feeding a Mulberry32-style mixer (`0x6d2b79f5`, the same `Math.imul`/xor-shift steps) mapped to `1 + (r*2-1)*jit`. `src/lib/project-data/vary.ts:36-64` (`projectVary`'s inline `rnd()` plus its `hash32` helper) is the byte-for-byte same hash constants and the same mixer steps, exposed as `wobble(jit)` with the identical `1 + (rnd()*2-1)*jit` shape. The comment in `sample.ts` says it avoids "pulling in the project-data variance toolkit (this module has no Project in the demo path)" — but the reusable piece isn't `projectVary(project, label)` (which does need a `Project`), it's the seed-string-only PRNG buried inside it; `project-data/seed.ts` already ships a sibling primitive (`seedScale(seed: string, base)`) that takes a plain string, proving the toolkit doesn't actually require a `Project` object everywhere.
- **Root cause**: the PRNG in `vary.ts` was never extracted as its own named export, so the next module that needed "a small deterministic ±jit from a string key" without a `Project` had no primitive to reach for and copied the algorithm inline instead.
- **Impact**: two independent copies of a non-trivial PRNG (magic hash constants, mixer steps) now have to be kept in sync by inspection if the algorithm is ever swapped (e.g. for a better distribution) or audited for a seed-collision bug — a fix applied to one silently does not apply to the other.
- **Fix sketch**: extract the `hash32` + Mulberry32 `rnd()` body from `project-data/vary.ts` into a new exported `seededRng(key: string): () => number` (or a `seededWobble(key, jit?)` matching this file's existing shape) in `project-data/seed.ts` (which already only needs a string). Have both `project-data/vary.ts`'s `projectVary` and `organic-channels/sample.ts`'s `baseChannelPlan` call it instead of inlining the algorithm.
- **Gate impact**: none — no `// llm-tool:` tag or `src/lib/llm/` file involved.

## 3. Dead sparkline geometry: `ctrSparkPoints`/`sparkPointsAttr` have no production caller left

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/distribution/learnings.ts:135-169`
- **Scenario**: `DistributionModule.tsx` used to render its own hand-rolled `<svg>` sparkline from these helpers; it now imports the shared `Sparkline` chart primitive instead (`import Sparkline from "@/components/charts/Sparkline"`, used in `CtrSparkline` at `DistributionModule.tsx:674-691`) and the module only imports `rollupLearnings`/`DimensionLeader` from `learnings.ts` — not `ctrSparkPoints` or `sparkPointsAttr`. A repo-wide grep for both names turns up exactly one remaining caller: `test-unit/distribution-learnings.test.mjs`, which still exercises the now-orphaned geometry. `DistributionModule.tsx`'s own comment ("`markPeak` puts the dot on the BEST channel … which is the semantic the hand-rolled version existed for") confirms the migration already happened.
- **Root cause**: the component was migrated to the shared `Sparkline` primitive but the bespoke geometry helpers (and their test) were left behind in `learnings.ts` instead of being deleted alongside the migration.
- **Impact**: ~35 lines of exported, publicly-typed geometry code (plus a dedicated test file) that nothing in the app renders — a maintainer changing sparkline behavior may edit this dead copy and see the test suite stay green while production is unaffected, or waste time reasoning about "why does this exist."
- **Fix sketch**: delete `SparkPoint`, `ctrSparkPoints`, `sparkPointsAttr`, and the local `round()` helper from `learnings.ts:135-169`; remove the corresponding `ctrSparkPoints`/`sparkPointsAttr` tests from `test-unit/distribution-learnings.test.mjs` (outside this context's file list, but required for the removal to be clean).

## 4. Three files carry a "Facebook" distribution-channel entry that can never be reached

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/distribution/handoff.ts:6-18`
- **Scenario**: `channelToPlatform`'s `case "Facebook": return "facebook";` (here), `CHANNEL_UTM_SOURCE`'s `Facebook: "facebook"` entry (`src/lib/distribution/utm.ts:23`), and `CHANNEL_FORMAT`'s `Facebook: "Dlouhý příspěvek"` entry (`src/lib/distribution/learnings.ts:32`) all handle a channel label that never actually flows through the Distribuce module. The only two producers of a distribution `channel` string are `REPURPOSE_CHANNELS` (`generate.ts`: Newsletter/LinkedIn/Instagram/X-Twitter) and `SAMPLE_ATTRIBUTION` (`distribution/sample.ts`, the same four) — a repo-wide grep for the literal `"Facebook"` string finds it only in `handoff.ts` and in `social/types.ts`'s platform-label map (a different, unrelated table for the social scheduler's own platform picker, not a Distribuce channel).
- **Root cause**: looks like a planned-but-never-shipped Facebook repurpose channel — the social hand-off surface was pre-wired for it in three places, but the channel was never added to `CHANNEL_LIMITS`/`REPURPOSE_CHANNELS` (the actual gate on which channels exist), so the branch is permanently unreachable.
- **Impact**: low runtime risk (dead branches, not wrong ones), but three files each carry a plausible-looking "supported channel" that isn't, which will mislead the next person who tries to add real Facebook support (they'll assume the wiring is already half-done and may miss that `generate.ts`'s `CHANNEL_LIMITS` — the actual source of truth for "which channels exist" — was never updated).
- **Fix sketch**: either finish the feature (add `Facebook` to `CHANNEL_LIMITS`/`RepurposeChannel` in `generate.ts` so it's actually reachable end-to-end) or remove the three vestigial entries (`handoff.ts:12-13`, `utm.ts:23`, `learnings.ts:32`) until it is.

## 5. `content/seo-score.ts`'s meta-length ceiling silently duplicates `SEO_LIMITS.metaDescription`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/content/seo-score.ts:188-192`
- **Scenario**: `META_MAX = 155` here is the same number as `SEO_LIMITS.metaDescription = 155` in `src/lib/ai-types.ts:171` (the constant the brief-editor UI checks the live meta description against, per that file's own comment: "checked in the UI like the ad limits"). The `seo-score.ts` comment justifying the inline copy says "Importing the constant would couple the helper to the whole ai-types surface for one number" — but the file already imports from `ai-types` two lines above (`import type { BriefResult } from "@/lib/ai-types";`), so the coupling this comment warns about already exists; adding one more named value import doesn't change that.
- **Root cause**: a deliberate but slightly mistaken decision (documented in the code) to avoid a coupling that was already present.
- **Impact**: if product ever changes `SEO_LIMITS.metaDescription` (e.g. Google's guidance shifts, or the field's UI limit changes), the brief editor's live character-count guard and the AI content brief's E-E-A-T "meta-length" scorecard chip (`scoreBrief`, used in `ContentBriefGenerator.tsx`) will quietly disagree — the chip could say "over limit, Google will clip it" for a meta description the editor's own limit indicator still allows.
- **Fix sketch**: replace the local `META_MAX = 155` with `SEO_LIMITS.metaDescription` imported from `@/lib/ai-types` (change the existing `import type` to also import the value, or add a second import line). Leave `META_MIN = 120` as-is — there is no upstream source for the lower bound, so it isn't a duplicate.
