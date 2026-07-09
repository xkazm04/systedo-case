# Catalog, Inventory, Audience & Distribution

> Context #6 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 8

## 1. Clipboard copy-with-fallback duplicated twice in-file, and a shared helper already exists

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/DistributionModule.tsx:311-328`
- **Scenario**: `VariantCard`'s `copyToClipboard` (lines 311-328) and `NewsletterHandoff`'s `copyNewsletter` (lines 575-596, same file) both hand-roll the identical "try `navigator.clipboard.writeText`, on failure create a hidden `<textarea>`, `select()`, `document.execCommand("copy")`, remove it" sequence — same DOM calls, same styling (`position:fixed; opacity:0`), same catch-and-swallow. A generic, already-exported version of this exact logic — `copyTextWithFallback(text)` — lives in `src/components/article/permalink.ts:23-42` and is unused by this file. Grepping the repo turns up the same hand-rolled fallback a further three times: `src/components/article/ShareBar.tsx:139`, `src/components/article/CopyMarkdownButton.tsx:40`, `src/app/_dev-inspector/DevInspector.tsx:38`.
- **Root cause**: the clipboard-fallback trick was written inline each time a "copy" button was added, rather than reusing (or promoting) the one already built for the article permalink feature.
- **Impact**: six near-identical copies of browser-fragility-sensitive code (the `execCommand("copy")` fallback path is exactly the kind of thing that quietly bit-rots). A fix to one — e.g. handling Firefox's `execCommand` deprecation, or adding a toast on failure — has to be hunted down and applied six times; two of those copies are in the very file under review.
- **Fix sketch**: promote `copyTextWithFallback` out of `src/components/article/permalink.ts` (it's already generic, just mis-homed under `components/article/`) into a shared module, e.g. `src/lib/clipboard.ts`. In `DistributionModule.tsx`, replace `copyToClipboard` in `VariantCard` and the inline try/catch in `NewsletterHandoff.copyNewsletter` with calls to the shared helper; keep the per-caller `setCopied`/timeout bookkeeping local.

## 2. Channel list hardcoded into two translation strings, drifts from the structured source of truth

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/InventoryBudgetActions.tsx:39`
- **Scenario**: `T.cs.appliedDetail` (line 39) and `T.en.appliedDetail` (line 69) hardcode the channel names as literal text: `"…napříč {ch} kanály (Google, Sklik, Zboží, Heureka, Meta)"` / `"…across {ch} channels (Google, Sklik, Zboží, Heureka, Meta)"`. The actual channel set is `SKU_AD_CHANNELS` in `src/lib/inventory/action-plan.ts:23-29`, and `{ch}` itself is already computed dynamically from that data (`channelCount = plan.actions[0]?.channels.length ?? 0`, line 105). The parenthetical names are not derived from `SKU_AD_CHANNELS` at all — they're just typed out.
- **Root cause**: the channel list was five items when both were written, so the count (`{ch}`) and the spelled-out names happened to agree; nothing keeps them that way.
- **Impact**: the moment `SKU_AD_CHANNELS` gains, loses, or renames a channel (a very plausible edit — it's exactly the kind of list a Czech-market integration adds to), the "applied" confirmation banner will report a channel count that no longer matches the parenthetical list of names, in both languages, with no compiler or test catching it — a live, user-facing lie about which channels the budget shift reached.
- **Fix sketch**: replace the hardcoded names with an interpolated value built from `plan.actions[0]?.channels.map(c => c.name).join(", ")`, passed as a new `{list}` var to `t("appliedDetail", { n, amount, ch: channelCount, list })`, and drop the literal parenthetical from both `T.cs`/`T.en` strings.

## 3. `buildActionPlan` computes `valueProtected`, `totalShifted` and `policy` that nothing reads

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/components/app/modules/InventoryBudgetActions.tsx:86-103`
- **Scenario**: `InventoryBudgetActions` is the only consumer of the `InventoryActionPlan` produced by `buildActionPlan` (`src/lib/inventory/action-plan.ts:66-107`; called once, from `InventorySeasonModule.tsx:171`). Inside `InventoryBudgetActions`, only `plan.actions` and `plan.withinGuardrails` are ever read (confirmed by grepping every `plan.` access in the file). `plan.valueProtected`, `plan.totalShifted`, and `plan.policy` (`{ maxMoveAmountCzk, maxMoves }`) are computed on every render but never touched — the component instead recomputes its own selection-scoped `sel.protectedValue`/`sel.total` locally (lines 96-103), which is legitimately a different (checkbox-filtered) figure, but that just underlines that the plan-level fields have no caller at all.
- **Root cause**: `buildActionPlan` was built to return a complete "plan" shape (mirroring the ad-ops control-plane envelope the docblock references), but the UI only ended up needing a subset.
- **Impact**: dead computation plus a misleading API surface — a reader of `InventoryActionPlan` reasonably assumes `valueProtected`/`policy` are shown somewhere (the `guardBreach` copy even says "outside guardrails — needs approval" without ever surfacing what the guardrail *is*, i.e. `plan.policy.maxMoveAmountCzk`/`maxMoves`).
- **Fix sketch**: either wire the unused fields into the UI (show `plan.policy.maxMoveAmountCzk`/`maxMoves` next to the `guardBreach` label so the guardrail is explained, and use `plan.valueProtected` as a full-plan figure alongside the selection-scoped `sel.protectedValue`), or, if that's out of scope, strip `valueProtected`, `totalShifted`, and `policy` from `InventoryActionPlan` and `buildActionPlan`'s return in `src/lib/inventory/action-plan.ts` so nothing is computed and returned without a reader.

## 4. The same mini-sparkline wrapper is redefined three times

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/modules/AudienceModule.tsx:138-159`
- **Scenario**: `AudienceModule.tsx` defines `MiniSpark` (lines 138-159: local `SPARK_W=120`/`SPARK_H=32`, wraps `<Sparkline>` with `area={false} stroke="var(--color-brand-accent)" strokeWidth={1.75} className="overflow-visible"`). `DistributionModule.tsx` defines `CtrSparkline` (lines 668-691) with the same `SPARK_W=120`, `SPARK_H=28`, and the identical `area`/`stroke`/`strokeWidth`/`overflow-visible` props, just swapping `dot` for `markPeak`. A third copy of the same wrapper (own `SPARK_W=96`/`SPARK_H=28`, same stroke/strokeWidth/area/overflow-visible) exists in `src/components/app/modules/LtvModule.tsx:189-204` (outside this context, but proves the pattern is a recurring one, not a one-off coincidence).
- **Root cause**: each module needed a small inline trend chart and wrapped the shared `Sparkline` primitive locally instead of building one shared "compact sparkline" wrapper alongside it.
- **Impact**: the shared visual language of these mini-charts (brand-accent stroke, 1.75px weight, no fill, overflow-visible for the end dot) now lives in three places; a design tweak (e.g. switching the accent token or stroke weight) requires editing all three and trusting they stay in sync.
- **Fix sketch**: add a small `MiniSparkline` wrapper (e.g. in `src/components/charts/`, next to `Sparkline`) that owns the shared defaults and takes just `values`, `label`, and a `dot | markPeak` mode; have `AudienceModule.MiniSpark`, `DistributionModule.CtrSparkline`, and `LtvModule`'s equivalent delegate to it, keeping only their size constants if those genuinely need to differ.

## 5. `TrendCard` reinvents already-exported `Formatters`/`TFn` types

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/components/app/modules/AudienceModule.tsx:174-175`
- **Scenario**: `TrendCard`'s props type `t` and `fmt` as `Awaited<ReturnType<typeof getT<keyof typeof T.cs>>>` and `Awaited<ReturnType<typeof getServerFormatters>>`. Both are just verbose re-derivations of types that are already named and exported: `Formatters` from `src/lib/format.ts:32` (the exact return type of `getServerFormatters`) and `TFn<K>` from `src/lib/i18n/interpolate.ts:21` (the exact return type of `getT`).
- **Root cause**: written against the local `getT`/`getServerFormatters` call sites without checking whether the resulting type already had a name.
- **Impact**: purely cosmetic — no behavior risk — but the `Awaited<ReturnType<typeof ...>>` indirection is harder to read at a glance and easy to copy-paste into the next component instead of importing the real type.
- **Fix sketch**: `import type { Formatters } from "@/lib/format"` and `import type { TFn } from "@/lib/i18n/interpolate"`, then type the props as `t: TFn<keyof typeof T.cs>; fmt: Formatters;`.
