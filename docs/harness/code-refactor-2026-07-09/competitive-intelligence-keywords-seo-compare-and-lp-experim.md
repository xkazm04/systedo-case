# Competitive Intelligence: Keywords, SEO Compare & LP Experiments

> Context #53 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 2, Low: 2)
> Files read: 14

## 1. Three private reimplementations of the shared seeded-PRNG/hash instead of importing the "one implementation instead of three copies" module

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/seo-compare/catalog.ts:7,19-23`
- **Scenario**: `catalog.ts` calls `seed01()` (from `src/lib/project-data/seed.ts:8-15`) to seed its deterministic volume/difficulty/rank synthesis. `seed01` re-implements the exact FNV-1a hash loop that already lives canonically as `hashStr()` in `src/lib/demo/prng.mjs:31-38` — a module whose own header comment says "the seeded PRNG + string hash every demo-data generator uses ... one implementation instead of three copies." This context's own `keywords/sample.ts:8` correctly imports `mulberry32, hashStr` from that canonical module. But a sibling generator in this same context, `lp-exp/sample.ts:5,68`, calls `projectVary()` from `src/lib/project-data/vary.ts`, which at lines 37-43 inlines its own byte-identical copy of the `mulberry32` algorithm (compare to `prng.mjs:16-24`) and at lines 57-64 inlines its own byte-identical copy of the FNV-1a hash (`hash32`, whose own comment admits "same constants as seed01") instead of importing `mulberry32`/`hashStr`.
- **Root cause**: the `prng.mjs` consolidation pass covered the dashboard seed script, sample campaigns, and sample keyword ideas, but predates (or was never back-ported into) `project-data/seed.ts` and `project-data/vary.ts`, which grew their own copies independently.
- **Impact**: the "one implementation instead of three copies" promise is already false — there are effectively 4 copies of the hash/PRNG pair across the repo. Two of this context's own three sample generators (`lp-exp/sample.ts` via `vary.ts`, `seo-compare/catalog.ts` via `seed.ts`) depend on the un-consolidated copies while the third (`keywords/sample.ts`) depends on the canonical one — a new contributor copying `keywords/sample.ts`'s pattern for a fourth generator wouldn't discover the drift. Any future tuning of the PRNG's distribution (e.g. to fix a demo-data skew) must be found and applied in up to 4 places to stay consistent.
- **Fix sketch**: in `src/lib/project-data/seed.ts`, replace `seed01`'s private FNV-1a loop with `mulberry32(hashStr(id))()` imported from `@/lib/demo/prng.mjs` (same output distribution, one call). In `src/lib/project-data/vary.ts`, delete the inline `hash32` function (57-64) and the inline `rnd` closure (37-43), and instead build the wobble PRNG via `mulberry32(hashStr(key))` from the same module. Neither `seed.ts` nor `vary.ts` is owned by this context — flag for the owning team, since their own regression coverage should confirm the algorithms are byte-identical before landing.
- **Build risk**: none — `demo/prng.mjs`, `project-data/seed.ts` and `project-data/vary.ts` are all plain framework-free modules already imported from both server-only and client-safe call sites; nothing about this change touches the client/server boundary.

## 2. Duplicate "parse-stored-JSON-or-null" block in the competitor store's local and Firestore backends

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/competitors/store.local.ts:15-19`
- **Scenario**: `getCompetitors` in `store.local.ts:15-19` wraps `JSON.parse(row.data)` in a `try { ... } catch { return null; }` guard. The Firestore backend, `store.firestore.ts:16-20`, wraps `JSON.parse(raw)` in the identical guard. This is backend-agnostic pure logic (parsing a JSON string into a `CompetitorSet`, degrading to `null` on corruption) — the kind of duplication the project's local/Firestore-parity exception explicitly calls out as worth flagging, since it could move up into the dispatcher.
- **Root cause**: each backend file was written by adapting its sibling (`store.ts`'s header says it "Mirrors cost-model/store"), and the tiny parse-or-null guard got copied along with the backend-specific I/O instead of being factored into the framework-free `types.ts` where `sanitizeCompetitors` already lives.
- **Impact**: low today, but if the persisted shape ever needs a validation/migration step (e.g. schema-checking the parsed object, or logging a corrupt-data warning), a developer must remember to patch both backends identically instead of one shared helper — exactly the kind of drift the dispatcher pattern (`store.ts`) exists to prevent.
- **Fix sketch**: add `export function parseCompetitorSet(raw: string | null | undefined): CompetitorSet | null` to `src/lib/competitors/types.ts` (alongside the existing `sanitizeCompetitors`, both framework-free), wrapping the try/catch once. Update `store.local.ts:15-19` to `return parseCompetitorSet(row.data);` and `store.firestore.ts:16-20` to `return parseCompetitorSet(raw);`.

## 3. `CompareIntent` labels are hand-mirrored into `ai-types.ts` with no parity guard

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/seo-compare/compute.ts:12-17`
- **Scenario**: `INTENT_LABELS` here (`alternative`/`vs`/`pricing`/`review` → Czech labels) is deliberately mirrored in `src/lib/ai-types.ts:781-791` as `CompareOutlineIntent`/`COMPARE_INTENT_LABELS`, whose comment says "mirrored from lib/seo-compare/sample so the client+server contract stays free of the sample-data import." That mirror feeds the gated LLM tool `src/lib/ai/tools/comparison-outline.ts:22,51` (prompt text: `Záměr dotazu: ${COMPARE_INTENT_LABELS[req.intent]}`). The split is intentional and documented — this finding is not "merge the files" — but nothing enforces the two label maps stay equal; they currently agree only because someone typed the same four Czech words twice.
- **Root cause**: an explicit import-boundary decision (avoid pulling `seo-compare/sample.ts` into the AI-tool type surface) with no compile-time or test-time value-equality check, only structural (key-set) equality via the shared literal union.
- **Impact**: if a query-intent value is ever added or relabeled in `seo-compare/compute.ts` (the "source of truth" per the comment), `ai-types.ts`'s copy silently goes stale — TypeScript only checks that both `Record`s cover the same key set, not that the string values match, so the AI-generated comparison-page prompt and the SEO-compare UI badge could show mismatched intent wording for the same query with zero compiler or test signal.
- **Fix sketch**: add a small unit test (e.g. `src/lib/seo-compare/compute.test.ts` or a shared cross-module test) asserting `Object.keys(INTENT_LABELS)` matches `Object.keys(COMPARE_INTENT_LABELS)` and every value is equal — the cheapest guard that preserves the intentional import-boundary split without touching either production file.
- **Gate impact**: none if the fix is test-only. If `src/lib/ai-types.ts` itself needs a comment update, that file is not in `HASHED_FILES`; `src/lib/ai/tools/comparison-outline.ts` (which is hashed) does not need to change.

## 4. Relative parent-directory import breaks this context's `@/lib/...` alias convention

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/lib/seo-compare/compute.ts:10`
- **Scenario**: `import type { SavedKeyword } from "../keywords/types";` is the only relative (`../`) cross-domain import among this context's 14 files. Every other cross-domain import uses the alias — e.g. `seo-compare/catalog.ts:6-7` (`@/lib/catalog/offering`, `@/lib/project-data/seed`), `lp-exp/compute.ts:6` (`@/lib/metrics`), `keywords/engine.ts:5-8` (`@/lib/campaigns/connection`, `@/lib/google/token`, etc.).
- **Root cause**: likely written without checking the sibling-file convention; both forms resolve identically under the project's `tsconfig` paths.
- **Impact**: purely cosmetic — no runtime difference — but it's inconsistent with every other file in this context and in the broader codebase, and it's the kind of stray relative import that survives a file move (e.g. `seo-compare/` relocating a directory level) silently pointing at the wrong place, unlike an aliased import which breaks loudly.
- **Fix sketch**: change to `import type { SavedKeyword } from "@/lib/keywords/types";`

## 5. Two unrelated data models both named "competitor" with no cross-reference

- **Severity**: Low
- **Category**: structure
- **File**: `src/lib/competitors/types.ts:4-13`
- **Scenario**: `Competitor`/`CompetitorSet` here (`{ name, note? }`, user-entered per project, feeds `competitorGroundingText` for AI recap/social grounding) is a completely separate model from `PlanOffering.competitors` (`{ name, url?, price? }`) defined in `src/lib/catalog/offering.ts:66`, which this same context's `seo-compare/catalog.ts:34` iterates over to synthesize `"{brand} vs {competitor}"` SEO queries. The two never share code today, but they share a name and a domain (rival businesses), so a developer grepping "competitor" or asked to "let users edit tracked competitors" would naturally expect one model, not two independently-shaped ones.
- **Root cause**: organic growth — the catalog's per-plan named rivals were added later as static offering fixture data, independently of the pre-existing user-entered `CompetitorSet` feature; nothing links them.
- **Impact**: low today (no shared code path, no bug), but real confusion risk for the next feature that touches "competitors" (e.g. "auto-populate SEO comparison queries from your tracked competitor list") — whoever picks it up needs to first discover these are two distinct models before attempting to merge or bridge them.
- **Fix sketch**: no code change — add a one-line cross-reference in each file's header comment, e.g. in `competitors/types.ts`: "Unrelated to `PlanOffering.competitors` in `src/lib/catalog/offering.ts` — that's catalog-seeded rival names for SEO query synthesis (seo-compare/catalog.ts), not user-entered."
