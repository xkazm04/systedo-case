# BYOM (Bring-Your-Own-Model) Keys & Provider Adapters

> Context #17 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 3, Low: 0)
> Files read: 11

## 1. `resolveActiveByomKey` is dead code with a stale doc comment describing it as the security-critical seam

- **Severity**: High
- **Category**: dead-code
- **File**: `src/lib/llm/keys/store.ts:144-147`
- **Scenario**: `resolveActiveByomKey(userId)` is fully implemented (decrypts the config's `activeVendor` key) and the module's own header comment says "the decrypted key never leaves the server except through `resolveActiveByomKey`" (store.ts:5). But a repo-wide grep for `resolveActiveByomKey` finds only its own definition and that doc line — zero call sites in `src/`, `test-unit/`, or `test-llm/`. Every real call-time path (`src/lib/llm/byom/request.ts:23`, used by `src/app/api/ai/route.ts`, `src/app/api/campaigns/analyze/route.ts`, `src/app/api/campaigns/analyze/batch/route.ts`, `src/app/api/social/draft/route.ts`) goes through `resolveByomForOperation` instead, which was clearly written to supersede it once the per-operation matrix (`cfg.operations`) shipped.
- **Root cause**: `resolveByomForOperation` (store.ts:158-176) was added later to layer the operation-matrix override on top of the same "decrypt the active vendor's key" logic `resolveActiveByomKey` already did, and the older function was never removed once every caller migrated.
- **Impact**: the module doc actively misdirects — a maintainer reading it to understand "where does a BYOM key get decrypted for a live call" is pointed at a function that no route uses and that also skips the operation-matrix override, so trusting it would silently ignore a user's per-tool vendor/model assignment. It's the kind of landmine that turns into a real bug the moment someone reintroduces a caller based on the doc instead of the (undocumented) actual seam.
- **Fix sketch**: delete `resolveActiveByomKey` from `src/lib/llm/keys/store.ts`, and update the header comment (store.ts:5) to name `resolveByomForOperation` as the call-time seam instead.

## 2. The BYOM default-model catalog is triplicated across three files with no shared source of truth

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/llm/keys/types.ts:57-86`
- **Scenario**: `BYOM_MODEL_CATALOG` (types.ts, this context) encodes each vendor's default model id (e.g. `anthropic: "claude-sonnet-5"`, `gemini: "gemini-3.5-flash"`). The same four defaults, split into quality/fast tiers, are re-declared independently as `BYOM_DEFAULT_MODELS` in `src/lib/llm/models.ts:88-93` — the table `byomModel()` actually reads at call time (imported by `src/lib/llm/byom/adapters.ts:19`). A third copy, `MODEL_HINTS`, is hand-typed again in `src/components/app/modules/ByomKeys.tsx:82-88`, whose own comment admits it: `/** Default model hints per vendor (mirrors BYOM_DEFAULT_MODELS server-side). */`. All three currently agree, but nothing enforces it — `BYOM_MODEL_CATALOG` is already imported directly by a sibling client component (`ByomMatrix.tsx:6`), so `ByomKeys.tsx` re-typing the values instead of importing the same catalog isn't a client/server-boundary necessity, just drift waiting to happen.
- **Root cause**: the catalog was likely added in `types.ts` for the settings-matrix UI, then a second, tier-aware table was written in `models.ts` for the actual dispatch, and a third literal snapshot was pasted into `ByomKeys.tsx` for its own "default" hint labels, each at a different point in the feature's growth.
- **Impact**: a future model bump (e.g. rotating the Gemini default off `gemini-3.5-flash`) that only touches `models.ts` leaves the settings UI showing/pre-selecting a default that the backend no longer actually uses for an unconfigured user — wrong model shown to the user, wrong cost estimate, and a support-confusing mismatch between what's displayed and what's billed.
- **Fix sketch**: make `BYOM_DEFAULT_MODELS` in `models.ts` the single source (it's already tier-aware and already the one wired to `byomModel()`), derive `BYOM_MODEL_CATALOG`'s `default` field from it in `types.ts`, and replace `ByomKeys.tsx`'s `MODEL_HINTS` literal with an import of `BYOM_MODEL_CATALOG` (or `BYOM_DEFAULT_MODELS`, neither of which is server-only) instead of a hand-mirrored constant.

## 3. Two independent encodings of "does this model support a reasoning knob"

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/llm/keys/types.ts:52,67`
- **Scenario**: the settings-matrix UI gates the reasoning selector off `ByomModelOption.noReasoning` (`types.ts:52`, set `true` only for `claude-haiku-4-5` at `types.ts:67`, consumed by `ByomMatrix.tsx:142,174,198,224`). The server-side adapter decides the same fact independently via a regex in `anthropicReasoning()`: `const supportsEffort = /opus|sonnet/i.test(model) && !/haiku/i.test(model)` (`src/lib/llm/byom/reasoning.ts:41`). The two happen to agree today, but they're two unrelated mechanisms (an explicit per-model boolean flag vs. a name-pattern test) with no code linking them.
- **Root cause**: the catalog flag was added for the matrix UI's disabled state; the regex was written separately in the reasoning mapper without reusing it.
- **Impact**: adding a new Anthropic model to `BYOM_MODEL_CATALOG` that doesn't match `/opus|sonnet/i` (or a future haiku-class model whose id happens to match) without also setting `noReasoning` correctly produces a UI that offers a reasoning level the backend silently no-ops (or vice versa) — a confusing but non-crashing drift, not currently manifesting.
- **Fix sketch**: derive `anthropicReasoning`'s support check from the catalog's `noReasoning` flag instead of a regex — e.g. export a small `supportsReasoning(vendor, model)` helper in `types.ts` (already the shared contract module) that both `ByomMatrix.tsx` and `reasoning.ts` call, and delete the regex.

## 4. `deleteByomConfig` is implemented twice, dead in production, and only reachable through its own unit test

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/llm/keys/store.local.ts:45-47`
- **Scenario**: both backends export `deleteByomConfig` (`store.local.ts:45-47` and the equivalent in `src/lib/llm/keys/store.firestore.ts:54-56`), matching interfaces per the dual-store pattern. The dispatcher in `store.ts`, however, never calls it — the only key-removal path is `deleteByomKey` (store.ts:93-103), which deletes one vendor from `cfg.keys` and re-saves, leaving an empty `{ keys: {} }` row/doc behind rather than dropping the record. A repo-wide grep finds `deleteByomConfig` called from exactly one place: `test-unit/byom-keys.test.mjs:112`, which imports it directly from `store.local.ts` to reset test state — the Firestore copy has no caller at all, not even a test.
- **Root cause**: looks like scaffolding written when the store was first laid out (delete-the-whole-doc), superseded once `deleteByomKey`'s finer-grained per-vendor removal shipped, but never pruned from either backend.
- **Impact**: low direct cost (each copy is ~3 lines), but it's a real dead surface with a matching test that gives a false impression of production coverage/usage, and the asymmetry (tested via `store.local.ts` only, `store.firestore.ts`'s copy fully unreferenced) means a future `LOCAL_DB=false` deploy carries untested dead code.
- **Fix sketch**: either wire it in (call `deleteByomConfig` from `deleteByomKey` in `store.ts` once `cfg.keys` becomes empty, to actually drop the row/doc) or remove `deleteByomConfig` from both backends and update the test to assert via `getByomConfig`/`saveByomConfig` only. This is a product-behavior choice, not a pure cleanup — flagging for a decision rather than prescribing one.

## 5. The AsyncLocalStorage context wrapper is hand-duplicated between `byom-context.ts` and `request-context.ts`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/llm/byom-context.ts:8-30`
- **Scenario**: `byom-context.ts` is a ~20-line `AsyncLocalStorage` wrapper (`store`, a getter, an `enterWith`-based setter, plus a `run`-based variant). `src/lib/llm/request-context.ts:8-27` (not in this context, sibling top-level module) is the identical shape for a different payload (`LlmRequestContext` vs `ResolvedByomKey`) — same `AsyncLocalStorage` instance, same getter/setter pair, same "each request runs in its own async context" doc line. `request-context.ts`'s own header comment says it outright: *"the exact pattern byom-context uses for the provider key."* Two hand-written copies of one micro-abstraction, self-acknowledged in the source.
- **Root cause**: `request-context.ts` was added after `byom-context.ts` for a different piece of per-request state and copied the pattern inline rather than factoring out a generic helper.
- **Impact**: small today (2 instances, ~20 lines each), but it's the textbook "rule of three" precursor — the next per-request context need (there are already two) will likely copy-paste a third, and a bug fixed in one (e.g. around `enterWith` vs `run` semantics) won't propagate to the other.
- **Fix sketch**: factor a generic `createAlsContext<T>()` helper (e.g. in a new small `src/lib/llm/als-context.ts`) returning `{ get, enterWith, run }`, and have both `byom-context.ts` and `request-context.ts` call it instead of each declaring their own `AsyncLocalStorage`. Low risk — the public function names/signatures (`getByomContext`, `enterByomContext`, `runWithByomContext`) stay the same, only their bodies change to delegate.
