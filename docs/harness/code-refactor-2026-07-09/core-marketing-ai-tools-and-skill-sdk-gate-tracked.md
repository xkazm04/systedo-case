# Core Marketing AI Tools & Skill SDK (gate-tracked)

> Context #18 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 2, Medium: 1, Low: 1)
> Files read: 20

## 1. `chat.ts` inherits `analysis.ts`'s system prompt, but the gate attributes edits to "analysis" only

- **Severity**: Critical
- **Category**: structure
- **File**: `src/lib/ai/tools/chat.ts:11,13-20`
- **Scenario**: `chat.ts` builds its system prompt as `` const CHAT_SYSTEM = `${ANALYSIS_SYSTEM}\n\n...` `` (lines 13-20), importing `ANALYSIS_SYSTEM` directly from `./analysis` (line 11). `scripts/llm-gate.mjs`'s incremental attribution builds `fileTools` purely from `// llm-tool: <id>` tags found *per file* (`test-llm/callsites.mjs:48-49`, consumed at `scripts/llm-gate.mjs:162-163`). `analysis.ts` contains exactly one tag — `// llm-tool: analysis` at `analysis.ts:161` — so `fileTools["src/lib/ai/tools/analysis.ts"] = ["analysis"]`. When `analysis.ts` changes, `scripts/lib/gate-plan.mjs:45-56` re-proves only `"analysis"`. But `chat.ts` itself is untouched, so it never appears in `changedFiles`, and `"chat"` is never re-proven — even though editing `ANALYSIS_SYSTEM`'s wording silently changes the live `CHAT_SYSTEM` too.
- **Root cause**: `chat.ts` reused a sibling tool's exported constant instead of factoring the shared "analyst persona" text into a neutral, untagged shared module (the pattern `_shared.ts`/`voice.ts` already use, which the gate correctly treats as multi-tool/full-rerun). The gate's single-tool file→id attribution is correct for every genuinely single-tool file; `analysis.ts` isn't one, because `chat.ts` silently depends on it too.
- **Impact**: A real behavior change to the chat tool's system prompt can ship without ever being re-verified against a live model — precisely the failure mode the gate exists to prevent (`scripts/lib/gate-plan.mjs`'s own header: "a shared file changed... falls back to the full [run]"). This is a live, user-facing chat feature; the drift is silent and would only surface via luck or an unrelated full-suite run.
- **Fix sketch**: Move the shared "analyst persona" text out of `analysis.ts` into a new export in a file the gate already treats as shared (e.g. add `ANALYST_PERSONA` to `_shared.ts`, or give it its own untagged file next to `refine.ts`/`voice.ts`). Import that constant from both `analysis.ts` (to build `ANALYSIS_SYSTEM`) and `chat.ts` (to build `CHAT_SYSTEM`), so `analysis.ts` no longer exports anything `chat.ts` needs.
- **Gate impact**: Editing `analysis.ts` (a `// llm-tool: analysis` file, in `HASHED_FILES`) forces a re-prove of the `"analysis"` tool. If the persona text moves into `_shared.ts` instead, that edit alone forces a FULL 19-tool real-model gate re-run once (per `scripts/lib/gate-plan.mjs`: `_shared.ts` carries no tag, so it is unattributable → `mode: "full"`) — after which this whole class of misattribution is closed for good.

## 2. `refine.ts` is imported by 16 tool files but missing from the gate's `HASHED_FILES`

- **Severity**: High
- **Category**: structure
- **File**: `src/lib/ai/tools/refine.ts:19-27`
- **Scenario**: `refineLines()` is imported by 16 files under `src/lib/ai/tools/` (repo-wide grep), including 7 owned by this context — `ads.ts`, `analysis.ts`, `article-draft.ts`, `brief.ts`, `local-review-reply.ts`, `monthly-recap.ts`, `repurpose.ts` — plus `twin-reply.ts`, `twin-style.ts`, `cohort-diagnosis.ts`, `keyword-clusters.ts`, `comparison-outline.ts`, `lp-variant-ideas.ts`, `lead-source-diagnosis.ts`, `channel-research.ts`, `onboarding-scan.ts`. Yet `scripts/llm-gate.mjs`'s `HASHED_FILES` array (lines 40-76) never lists `src/lib/ai/tools/refine.ts`. Its sibling `voice.ts` — the same kind of shared prompt-fragment helper, used by only 3 tools — *is* listed, with an explicit comment: `// Shared by twin-reply, social and repurpose — a change here rewrites three prompts.` No equivalent line exists for `refine.ts`, despite it rewriting more prompts than `voice.ts` does.
- **Root cause**: `HASHED_FILES` is a hand-maintained list; `voice.ts`'s entry shows the "shared prompt-fragment helper needs tracking" pattern was recognized once, but it was never applied to `refine.ts` (added earlier, or simply missed in the same audit).
- **Impact**: Any edit to `refineLines()` — its Czech instruction text, the `REFINE_MAX` clamp, the blank-line formatting it emits — changes the live re-run prompt for 16 gated tools with **zero** gate re-proof. Because `refine.ts` isn't in `HASHED_FILES` at all, it's not even eligible for the conservative "full re-run" fallback that shared files get; `changedFiles` simply never contains it, so `mode: "skip"` (cached proof reused) regardless of what changed in the file.
- **Fix sketch**: Add `"src/lib/ai/tools/refine.ts"` to the `HASHED_FILES` array in `scripts/llm-gate.mjs`, near the `voice.ts` entry, with a comment listing the tools it affects (mirroring the existing `voice.ts` comment style).
- **Gate impact**: The fix itself only edits `scripts/llm-gate.mjs` (not a `// llm-tool:` file, not `src/lib/llm/` core), so committing it needs no gate re-run. From then on, though, `refine.ts` becomes an untagged `HASHED_FILES` entry, so any future edit to it will correctly force a FULL 19-tool re-run — the same treatment `voice.ts` already gets.

## 3. The "headline + lists + titled-items" normalize/validate shape is copy-pasted across three tools

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/ai/tools/analysis.ts:63-79,84-98`
- **Scenario**: The pattern "parse an array of `{title, detail[, priority]}` objects, drop entries with a falsy title, cap at 6" is written out fully three times: `analysis.ts`'s `normalizeAnalysisResult`/`validateAnalysis` (the `actions` field), `src/lib/ai/tools/monthly-recap.ts:75-91,95-109`'s `normalizeRecap`/`validateRecap` (the `priorities` field), and `src/lib/ai/tools/campaign-eval.ts:72-91,96-113`'s `normalizeReport`/`validateReport` (the `recommendations` field, plus its own `normalizePriority` helper for the extra field). `validateAnalysis` and `validateRecap` in particular are structurally byte-for-byte identical control flow — check headline, check two `cleanList(...).length === 0` fields, check a titled-array length === 0 — differing only in the Czech field names and messages.
- **Root cause**: Each tool file was written independently, copying the "headline + two lists + titled-items" shape from whichever sibling was open at the time, instead of factoring the shared parse/validate logic into `_shared.ts`.
- **Impact**: A behavior change to this shape (e.g. raising the cap from 6 to 8, or tightening the "empty title" filter) must be applied by hand in three places; a partial fix silently leaves the others inconsistent, and a future tool copying this pattern again would make it four.
- **Fix sketch**: Add two generic helpers to `_shared.ts` — e.g. `cleanTitledList(v: unknown, max: number): {title: string; detail: string}[]` and a small `requireNonEmpty(list, message)` guard — and have `analysis.ts`, `monthly-recap.ts` and `campaign-eval.ts`'s normalize/validate functions call them (`campaign-eval.ts` keeps a thin wrapper on top to add the `priority` field).
- **Gate impact**: Editing `analysis.ts` and `monthly-recap.ts` (both `// llm-tool:` files, both in `HASHED_FILES`) forces the incremental gate to re-prove `"analysis"` and `"monthly-recap"`; editing `campaign-eval.ts` similarly forces `"campaign-eval"`. Adding the new helper to `_shared.ts` is itself a shared-file edit that forces a FULL 19-tool re-run (see Finding 1/2) — do the `_shared.ts` addition and all three call-site edits in one commit so that cost is paid once, not per-tool.

## 4. `clamp`/`cap` are reimplemented identically in `social/draft.ts`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/ai/tools/_shared.ts:16-17,44`
- **Scenario**: `clamp` (`_shared.ts:16-17`) and `cap` (`_shared.ts:44`) are each reimplemented byte-for-byte in `src/lib/social/draft.ts` — `clamp` at lines 13-15, `cap` at lines 31-33 — same signatures, same bodies, same ellipsis-truncation behavior. `social/draft.ts` is the deterministic template engine `social.ts` (owned by this context) falls back to via `draftPosts()` whenever the model skips a platform.
- **Root cause**: `social/draft.ts` needed the same two trivial string helpers and defined its own copies rather than importing them, likely because `_shared.ts` reads (per its header, see Finding 5) as scoped to the ads/brief/analysis/campaign-eval tools only.
- **Impact**: Low runtime risk since the logic is simple and stable, but a real drift risk if the truncation or capitalization rule ever needs a fix (e.g. Unicode-safe slicing, a different ellipsis character) — it would need to be applied twice, with nothing signalling the second copy exists.
- **Fix sketch**: Delete the local `clamp`/`cap` in `src/lib/social/draft.ts` and import both from `@/lib/ai/tools/_shared` instead. (Alternatively, hoist just these two pure string helpers into a neutral `src/lib/text-utils.ts` that both `_shared.ts` and `social/draft.ts` import, avoiding a dependency from the non-AI `social/` area into `ai/tools/`.)
- **Gate impact**: None — `_shared.ts` itself doesn't change; only `social/draft.ts` (not in `HASHED_FILES`) changes.

## 5. `_shared.ts`'s header comment understates its real usage

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/lib/ai/tools/_shared.ts:1-3`
- **Scenario**: The header reads "Shared helpers for the AI tool modules (ads / brief / analysis / campaign-eval)." A repo-wide grep shows `_shared.ts` is actually imported by roughly 20 files under `src/lib/ai/tools/` — `social.ts`, `repurpose.ts`, `article-draft.ts`, `local-review-reply.ts`, `voice.ts`, `monthly-recap.ts`, `twin-reply.ts`, `twin-style.ts`, `keyword-clusters.ts`, `channel-research.ts`, `onboarding-scan.ts`, `lp-variant-ideas.ts`, `lead-source-diagnosis.ts`, `comparison-outline.ts`, `cohort-diagnosis.ts`, `refine.ts`, plus the four named — not just the four in the comment.
- **Root cause**: The comment was accurate when `_shared.ts` was created for the first few tools and was never updated as later tools adopted it.
- **Impact**: Purely cosmetic, but misleading: a reader trusting the "four tools" claim could assume a `_shared.ts` change is narrowly scoped, when (per Findings 1-2) it's already correctly gate-classified as affecting everything.
- **Fix sketch**: Reword to "Shared helpers for the AI tool modules" and drop the stale four-file parenthetical, or replace it with "used by every tool in this directory."
- **Gate impact**: Even a comment-only edit to `_shared.ts` changes its content hash; since the file carries no `// llm-tool:` tag, `scripts/lib/gate-plan.mjs` treats it as unattributable shared code and forces a FULL 19-tool real-model gate re-run. Batch this wording fix into the same commit as Finding 3's `_shared.ts` helper addition rather than paying the full-run cost twice.
