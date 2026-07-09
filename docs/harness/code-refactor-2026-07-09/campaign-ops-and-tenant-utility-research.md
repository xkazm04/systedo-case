# Campaign ops & tenant utility/research

> Context #26 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 3, Medium: 1, Low: 1)
> Files read: 24

## 1. Local `roas` helper in the store reimplements the shared ratio primitive with swapped argument order

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/campaigns/route.ts:46`
- **Scenario**: `getLatestChanges` (called from here, and identically from `src/app/api/campaigns/analyze/route.ts:90` and `src/app/api/campaigns/analyze/batch/route.ts:90`) lives in `src/lib/campaigns/store.ts:568-644`. Inside it, `src/lib/campaigns/store.ts:602` defines `const roas = (cost: number, value: number) => (cost > 0 ? value / cost : 0);` and calls it as `roas(c.cost, valueOf(c))` (cost, value) at lines 618/629/639. The canonical, already-in-use ratio helper is `src/lib/metrics/ratios.ts:11` — `export const roas = (value: number, cost: number): number => safe(value, cost);` — with the **opposite** parameter order, and it's already imported and correctly called as `roas(c.conversionValue, c.cost)` (value, cost) one file over in `src/lib/campaigns/types.ts:6,199`.
- **Root cause**: `getLatestChanges` was written as a self-contained diffing routine before (or without noticing) the shared `@/lib/metrics/ratios` module existed for this exact domain; the local closure never got swapped out.
- **Impact**: Today both call conventions independently compute `value/cost` correctly, so there's no live bug — but the same identifier `roas` means opposite argument order depending which of these two campaign files you're standing in. A developer who extends `getLatestChanges` and, out of habit from `types.ts`, calls the local `roas` as `roas(value, cost)` (matching the shared/canonical convention) silently gets `cost/value` back — an inverted ROAS shipped into the `roasBefore`/`roasAfter` fields that `campaigns/route.ts`, `analyze/route.ts` and `analyze/batch/route.ts` all surface to the UI's change-diff badges.
- **Fix sketch**: Delete the local `const roas = ...` at `store.ts:602`, import `roas` from `@/lib/metrics/ratios` (already the convention in `types.ts`), and swap the three call sites (618/629/639) to `roas(valueOf(c), c.cost)` / `roas(valueOf(p), p.cost)` (value, cost) to match the shared signature.

## 2. Every route reimplements session→userId extraction instead of the existing memoized helper

- **Severity**: High
- **Category**: dead-code
- **File**: `src/app/api/campaigns/accounts/route.ts:7-8,24-26`
- **Scenario**: `src/lib/session.ts:18-21` already exports `currentUserId` — a `react.cache()`-memoized `async (): Promise<string | null>` that does exactly `((session?.user as { id?: string } | undefined)?.id) ?? null`, and it is the established convention used by 26 other files across the app (`src/lib/projects/guard.ts`, `src/app/api/byom/guard.ts`, every `src/app/api/projects/[id]/*/route.ts`, etc). None of the 15 files in this context use it. Instead every single one reimplements the identical expression locally, under three different names: `userIdOf(session)` (`accounts/route.ts:24-26`, `campaigns/route.ts:33-35`, importing `Session` from `next-auth` just for the signature), `requireUserId()` (`control-plane/route.ts:20-22`, `report-config/route.ts:14-16`, `alerts/route.ts:9-11`, `keywords/lists/route.ts:19-21`, `experiments/route.ts:20-22`), `userId()` (`patterns/route.ts:13-15`), or inlined at the call site (`apply/route.ts:12`, `activity/route.ts:11`, `usage/route.ts:7`, `keywords/route.ts:44`, `patterns/search/route.ts:38`, `analyze/route.ts:64`, `analyze/batch/route.ts:60`).
- **Root cause**: `src/lib/session.ts` (added for the `/app` page-render path) was never adopted by the API route layer, so each route author re-derived the one-liner independently rather than importing the shared helper.
- **Impact**: 15-for-15 duplication of the same auth primitive under three naming conventions is a real "which name do I use in this folder" tax, and it silently diverges from the one place (`session.ts`) documented as the source of truth for session/user-id derivation.
- **Fix sketch**: In each of the 15 files, replace the local `userIdOf`/`requireUserId`/`userId`/inline pattern with `import { currentUserId } from "@/lib/session"` and `const userId = await currentUserId();` (drop the now-unused `Session` type import in `campaigns/route.ts` and `accounts/route.ts`).
- **Gate impact**: `src/app/api/campaigns/analyze/route.ts` is on `HASHED_FILES` in `scripts/llm-gate.mjs:71` — editing it (even just this line) forces a real-model gate re-run for the `campaign-eval` tool. The other 14 files are not hashed and are gate-free edits; do that one in its own commit so a CLI usage-limit failure doesn't block the other 14.

## 3. The per-target RAG-query + evaluate + save pipeline is copy-pasted between the single and batch analyze routes

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/campaigns/analyze/batch/route.ts:178-214`
- **Scenario**: The ~35-line block that builds the portfolio RAG query (best/worst campaign by ROAS → Czech query string → `getPatternLines`), calls `generateCampaignEvaluation`, and `saveReport`s the result is duplicated verbatim (module names aside) at `src/app/api/campaigns/analyze/route.ts:130-170`. The query-building sub-block in particular (lines 132-145 in `analyze/route.ts` vs. 180-193 in `batch/route.ts`) is byte-identical. The batch route's own header comment (`analyze/batch/route.ts:9-11`) says it's "A NEW sibling of the gate-hashed analyze route: reuses the identical hash/cache/save seams from the store" — i.e. the intent was to share logic via the store layer, but this orchestration block was never actually factored out.
- **Root cause**: The batch endpoint was built by copying the single-target flow into a loop rather than extracting a shared `buildPortfolioRagQuery()` helper.
- **Impact**: This is the paid-LLM eval path — any future change to how the RAG query is phrased (what stats it cites, what counts as "best"/"worst") has to be made twice and re-verified twice against two separately-tested routes, with no compiler or test failure to catch a missed second edit.
- **Fix sketch**: Extract the pure `best`/`worst`/`query` construction (lines 132-145 / 180-193) into a `buildPortfolioRagQuery(campaigns: Campaign[]): string` in `src/lib/campaigns/types.ts` (already a pure module imported by both server routes and client components — see `CampaignTable.tsx`, `useCampaigns.ts` — so this stays safe to add to). Both routes then call `getPatternLines(tenant, buildPortfolioRagQuery(campaigns))`. Leave the BYOM/quota/save sequencing alone since the two routes intentionally differ there (single request vs. graceful-stop batch).
- **Gate impact**: `src/app/api/campaigns/analyze/route.ts` is on `HASHED_FILES` (`scripts/llm-gate.mjs:71`); extracting the shared helper touches that file and forces a real-model gate re-run for `campaign-eval`. `analyze/batch/route.ts` itself is not hashed.

## 4. The `str()` JSON-coercion helper is redefined per-file, and one copy silently drops the `.trim()`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/api/campaigns/apply/route.ts:9`
- **Scenario**: `const str = (v: unknown): string => (typeof v === "string" ? v : "");` here has no `.trim()`. The same one-liner is redefined *with* `.trim()` in four other owned files — `report-config/route.ts:18`, `patterns/route.ts:11`, `patterns/search/route.ts:14`, `keywords/route.ts:17` — and again (also with `.trim()`) in 7 more files elsewhere in the app (`src/lib/ai/validation.ts:58`, `src/app/api/social/posts/route.ts:12`, `src/app/api/social/messages/route.ts:11`, `src/app/api/social/draft/route.ts:37`, `src/app/api/images/route.ts:35`, plus a non-trimming pair at `src/lib/inventory/erp.ts:43` and `src/app/api/images/nobg/route.ts:20`). No shared `str`/`asString` utility exists anywhere under `src/lib` to import instead.
- **Root cause**: A tiny, obviously-inlineable helper that every route author reaches for and rewrites from scratch, with no canonical source to copy from.
- **Impact**: Low risk today, but it's a real behavioral fork: `apply/route.ts`'s `campaignId`/`fromId`/`toId`/`fromName`/`toName` values are compared/used un-trimmed, so a value with incidental leading/trailing whitespace (e.g. pasted from a UI field) would fail an equality check that the trimmed variant elsewhere in the same context would have passed silently.
- **Fix sketch**: Add one `export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");` to a small shared module (e.g. `src/lib/http/parse.ts`, new) and import it in the 5 owned files instead of each redefining it; drop the un-trimmed variant in `apply/route.ts` in favor of the trimmed one (its call sites are ID equality checks, so trimming is strictly safer, not a behavior regression).

## 5. The "silently default the body on a bad/missing JSON payload" boilerplate is copy-pasted across the batch and sync routes

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/app/api/campaigns/analyze/batch/route.ts:68-73`
- **Scenario**: `let body: unknown = {}; try { body = await request.json(); } catch { /* empty body is fine */ }` here is byte-identical (comment text aside) to `src/app/api/campaigns/route.ts:123-128`'s `let body: unknown = {}; try { body = await request.json(); } catch { /* empty body is fine — default the period */ }`. A looser variant of the same "parse optimistically, swallow failure, keep going" shape also appears in `alerts/route.ts:28-36`, `keywords/lists/route.ts:120-128` (DELETE), `patterns/route.ts:56-64` (DELETE) and `experiments/route.ts:120-127` (DELETE), each inlining its own field extraction inside the `try`.
- **Root cause**: No shared "parse JSON body, fall back to a default on any failure" utility exists, so each POST/DELETE handler that wants soft-fail-open behavior (as opposed to the hard-400 handlers elsewhere in this same context) re-writes the try/catch shell.
- **Impact**: Purely cosmetic — behavior is correct and consistent everywhere it appears — but it's 6 copies of a 4-6 line shell for something a 3-line generic would cover for the two byte-identical cases at least.
- **Fix sketch**: Add `async function parseJsonBody<T>(request: Request, fallback: T): Promise<T> { try { return await request.json(); } catch { return fallback; } }` to a shared module (or the same `src/lib/http/parse.ts` from finding 4) and use it at `campaigns/route.ts:123-128` and `analyze/batch/route.ts:68-73` (the two identical cases). Leave the four DELETE handlers alone — they extract typed fields inline inside the `try` rather than defaulting the whole body, so collapsing them would be a bigger, lower-value reshape for the same behavior.
